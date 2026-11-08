// @vitest-environment jsdom
/**
 * 工作区文件树的**真实 React 渲染**回归（jsdom + 真 react-dom，不挂 setup.ts 的哑代理）。
 *
 * 断言组件渲染出来的 DOM 行为，先红后绿——红必须复现**原故障的行为**（首屏一条都不画、
 * 失败与空目录都白屏），不能拿「模块找不到 / 函数不存在」冒充红。`file-tree-lazy-load.spec.ts`
 * 钉纯函数决策，这里钉整组件把状态真正落到 DOM。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { LazyFileTree } from '../src/file-tree-lazy.tsx'
import { fallbackT } from '../src/locales.ts'

;(globalThis as { IS_REACT_ATT_ENVIRONMENT?: boolean }).IS_REACT_ATT_ENVIRONMENT = true

type Entry = { name: string; type: 'file' | 'directory' | 'other'; size?: number }
interface ListingEnvelope {
  ok: boolean
  value?: { entries: Entry[]; truncated?: boolean }
  error?: { message: string }
}

/** 列目录响应固定成一份信封的 remote。 */
const remoteReturning = (listing: ListingEnvelope): (() => unknown) => () => ({
  workspaceFiles: { list: () => Promise.resolve(listing) },
})

/** 没有 workspaceFiles.list 能力的 remote（能力没接上 / 换了连接）。 */
const remoteWithoutList = (): () => unknown => () => ({ unrelated: true })

let container: HTMLElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
})

/** 渲染并冲刷挂载后异步列目录的微任务，让 .then 后的状态真正落到 DOM。 */
const renderTree = async (remote: () => unknown): Promise<void> => {
  await act(async () => {
    root.render(createElement(LazyFileTree, { sessionId: 's1', remote, t: fallbackT }))
  })
  await act(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 0) }) })
}

const treeText = (): string => document.querySelector('[data-chat-lazy-file-tree]')?.textContent ?? ''

describe('LazyFileTree 真实渲染：首屏', () => {
  it('成功的目录响应后，首批文件真的画到树上（不是空白）', async () => {
    await renderTree(remoteReturning({ ok: true, value: { entries: [{ name: 'alpha.ts', type: 'file' }, { name: 'beta.ts', type: 'file' }], truncated: false } }))
    expect(document.querySelector('[data-files-path="alpha.ts"]')).not.toBeNull()
    expect(document.querySelector('[data-files-path="beta.ts"]')).not.toBeNull()
  })
})

describe('LazyFileTree 真实渲染：失败与空目录要给反馈（不再白屏）', () => {
  it('ok:false 失败信封 → 显示错误提示', async () => {
    await renderTree(remoteReturning({ ok: false, error: { message: 'boom' } }))
    expect(treeText()).toContain('boom')
  })
  it('remote 缺 workspaceFiles.list → 显示「无法读取」提示', async () => {
    await renderTree(remoteWithoutList())
    expect(treeText()).toContain('无法读取')
  })
  it('空目录 → 显示「此目录为空」', async () => {
    await renderTree(remoteReturning({ ok: true, value: { entries: [], truncated: false } }))
    expect(treeText()).toContain('此目录为空')
  })
})
