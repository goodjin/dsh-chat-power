// @vitest-environment jsdom
/**
 * 展开大编辑区的**真实 React 渲染**回归（jsdom + 真 react-dom，不挂 setup.ts 的哑代理）。
 *
 * 断言组件把状态真正落到 DOM：收起时是一枚向上展开按钮；展开后是多行 textarea；
 * **回车只换行不误发**；只有点发送才发；空白 / 在途禁用发送；草稿写回外壳。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 原语包的图标会传递性引入 .module.css，jsdom 的 vite 不转译 CSS；这里把图标
// 换成同名桩组件（不渲染真实 SVG），只保留组件名与调用签名。dom 配置不挂 setup.ts
// 的整包 mock，所以本测试自己声明。vi.mock 会被 vitest 提升到文件顶部。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = (props: { size?: number }) => createElement('span', { 'data-icon-size': props.size })
  return {
    IconChevronUpOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconSendOutlineRegular: stub,
  }
})

import { ExpandEditor, type ExpandEditorReaders } from '../src/expand-editor.tsx'
import { fallbackT } from '../src/locales.ts'

;(globalThis as { IS_REACT_ATT_ENVIRONMENT?: boolean }).IS_REACT_ATT_ENVIRONMENT = true

/** 一份可编排的 readers：sendToSession 由调用方给定（resolve / reject 可控）。 */
function makeReaders(send: ExpandEditorReaders['sendToSession']): ExpandEditorReaders {
  return { sendToSession: send }
}

/** 外壳桩：记录 setDraft 收到的快照，供断言「编辑即写回」。 */
function makeShell(initialText: string) {
  const writes: unknown[] = []
  return {
    writes,
    shell: {
      draftSnapshot: { text: initialText, references: [] },
      setDraft: (draft: unknown) => { writes.push(draft) },
    },
  }
}

let container: HTMLElement
let content: HTMLElement
let root: Root

beforeEach(() => {
  // 展开态经 portal 挂进会话内容区；测试里提供一个该标记的节点，让 portal 落到可查询处。
  content = document.createElement('div')
  content.dataset.conversationContent = ''
  document.body.appendChild(content)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  content.remove()
})

/** 渲染 ExpandEditor 并冲刷挂载后异步。 */
const render = async (props: Parameters<typeof ExpandEditor>[0]): Promise<void> => {
  await act(async () => {
    root.render(createElement(ExpandEditor, props))
  })
}

/** 在当前 DOM（含 portal 目标）里点匹配选择器的第一个按钮。 */
const click = async (selector: string): Promise<void> => {
  const el = document.querySelector<HTMLButtonElement>(selector)
  if (el === null) throw new Error(`no button for ${selector}`)
  await act(async () => { el.click() })
}

/** 在 textarea 里逐字写入并冲刷 onChange。 */
const type = async (text: string): Promise<void> => {
  const ta = document.querySelector<HTMLTextAreaElement>('[data-expand-textarea]')
  if (ta === null) throw new Error('no textarea')
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(ta, text)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const sendCount = (calls: { text: string }[]): number => calls.length

describe('ExpandEditor 收起态', () => {
  it('未展开时是一枚向上展开的按钮，没有 textarea、没有发送钮', async () => {
    const readers = makeReaders(vi.fn())
    await render({ sessionId: 's1', t: fallbackT, readers })
    expect(document.querySelector('[data-expand-toggle]')).not.toBeNull()
    expect(document.querySelector('[data-expand-textarea]')).toBeNull()
    expect(document.querySelector('[data-expand-send]')).toBeNull()
  })
})

describe('ExpandEditor 展开', () => {
  it('点展开按钮后出现多行 textarea', async () => {
    const readers = makeReaders(vi.fn())
    await render({ sessionId: 's1', t: fallbackT, readers })
    await click('[data-expand-toggle]')
    expect(document.querySelector('[data-expand-textarea]')).not.toBeNull()
  })

  it('展开态经 portal 挂进会话内容区（不留在 composer overlay 里）', async () => {
    const readers = makeReaders(vi.fn())
    await render({ sessionId: 's1', t: fallbackT, readers })
    await click('[data-expand-toggle]')
    // textarea 落在 [data-conversation-content] 子树里，而非宿主 composer 的 overlay 座位。
    expect(content.querySelector('[data-expand-textarea]')).not.toBeNull()
  })

  it('展开时从外壳草稿种入已有文本', async () => {
    const readers = makeReaders(vi.fn())
    const { shell } = makeShell('已有的草稿')
    await render({ sessionId: 's1', t: fallbackT, readers, getShell: () => shell })
    await click('[data-expand-toggle]')
    const ta = document.querySelector<HTMLTextAreaElement>('[data-expand-textarea]')
    expect(ta?.value).toBe('已有的草稿')
  })
})

describe('ExpandEditor 回车行为', () => {
  it('在 textarea 里按回车只是换行，不触发发送', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const readers = makeReaders(send)
    await render({ sessionId: 's1', t: fallbackT, readers })
    await click('[data-expand-toggle]')
    await type('第一行')
    const ta = document.querySelector<HTMLTextAreaElement>('[data-expand-textarea]')
    await act(async () => {
      ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    // 文本仍只是「第一行」，没有发出去。
    expect(sendCount(send.mock.calls as unknown as { text: string }[])).toBe(0)
    expect(ta?.value).toBe('第一行')
  })
})

describe('ExpandEditor 发送', () => {
  it('点发送钮把正文发给当前会话，成功后清空并收起', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const readers = makeReaders(send)
    const { shell, writes } = makeShell('')
    await render({ sessionId: 's1', t: fallbackT, readers, getShell: () => shell })
    await click('[data-expand-toggle]')
    await type('要发的内容')
    await click('[data-expand-send]')
    expect(send).toHaveBeenCalledWith('s1', '要发的内容')
    // 成功后写回空草稿、编辑区收起。
    expect(writes[writes.length - 1]).toMatchObject({ text: '' })
    expect(document.querySelector('[data-expand-textarea]')).toBeNull()
  })

  it('空白时发送钮禁用；有内容后启用', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const readers = makeReaders(send)
    await render({ sessionId: 's1', t: fallbackT, readers })
    await click('[data-expand-toggle]')
    const sendBtn = () => document.querySelector<HTMLButtonElement>('[data-expand-send]')
    expect(sendBtn()?.disabled).toBe(true)
    await type('有内容了')
    expect(sendBtn()?.disabled).toBe(false)
  })

  it('发送失败时保留正文并给出提示，不收起', async () => {
    const send = vi.fn().mockRejectedValue(new Error('网络炸了'))
    const readers = makeReaders(send)
    await render({ sessionId: 's1', t: fallbackT, readers })
    await click('[data-expand-toggle]')
    await type('失败也留着')
    await click('[data-expand-send]')
    const ta = document.querySelector<HTMLTextAreaElement>('[data-expand-textarea]')
    expect(ta).not.toBeNull()
    expect(ta?.value).toBe('失败也留着')
    expect(document.querySelector('[role="alert"]')?.textContent ?? '').toContain('网络炸了')
  })
})

describe('ExpandEditor 草稿写回', () => {
  it('编辑即写回外壳草稿（保留 references 等字段）', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const readers = makeReaders(send)
    const { shell, writes } = makeShell('')
    await render({ sessionId: 's1', t: fallbackT, readers, getShell: () => shell })
    await click('[data-expand-toggle]')
    await type('半截草稿')
    const last = writes[writes.length - 1] as { text?: string; references?: unknown }
    expect(last?.text).toBe('半截草稿')
    expect(last?.references).toEqual([])
  })

  it('外壳不可达时也能独立编辑与发送（只是不同步小框）', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const readers = makeReaders(send)
    await render({ sessionId: 's1', t: fallbackT, readers, getShell: () => undefined })
    await click('[data-expand-toggle]')
    await type('无外壳也能发')
    await click('[data-expand-send]')
    expect(send).toHaveBeenCalledWith('s1', '无外壳也能发')
  })
})
