/**
 * 选区「复制」按钮：点击把选中文字写进剪贴板，并给一段短暂的浮层提示。
 *
 * 被测的是活实现（src/selection-toolbar.tsx 的 copySelectionText 与按钮表、
 * src/locales.ts 的词典）。这里钉住三件不变量：
 * - 新按钮紧跟「引用」之后，分隔线挪到「复制」之后；
 * - 复制结果（成功 / 被拒 / 无剪贴板）各自给出对应文案，绝不抛错；
 * - 中英词典都登记了这三条词条。
 *
 * 反馈用独立浮层而非改按钮文字：点完工具栏即收起，按钮上的状态来不及看。
 */

import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSendOutlineRegular: () => null,
  IconEditOutlineRegular: () => null,
}))

const { SelectionToolbar, copySelectionText } = await import('../src/selection-toolbar.tsx')
const { zh, en } = await import('../src/locales.ts')

/** 用假剪贴板替换全局 navigator.clipboard；返回还原函数。 */
function withClipboard(writeText: ((text: string) => Promise<void>) | undefined): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: writeText === undefined ? undefined : { writeText },
  })
  return () => {
    if (original === undefined) {
      Reflect.deleteProperty(globalThis.navigator, 'clipboard')
    } else {
      Object.defineProperty(globalThis.navigator, 'clipboard', original)
    }
  }
}

/** 调组件工厂，拿返回的 React 元素树。 */
function render(overrides: Record<string, unknown> = {}): ReactElement {
  return SelectionToolbar({
    readText: () => '选中文字',
    dismiss: () => {},
    clearSelection: () => {},
    t: (key: string) => key,
    ...overrides,
  } as never)
}

/** 从元素树里读出按钮的 data-action 顺序（含分隔线位置）。 */
function actionList(element: ReactElement): string[] {
  const props = element.props as { children: unknown[] }
  return (props.children as ReactElement[])
    .map(child => {
      const action = (child as { props?: { 'data-action'?: string } }).props?.['data-action']
      if (action !== undefined) return action
      const className = (child as { props?: { className?: string } }).props?.className
      return className?.includes('divider') ? '|' : '?'
    })
}

describe('按钮排列', () => {
  it('复制紧跟引用之后，分隔线挪到复制之后', () => {
    expect(actionList(render())).toEqual([
      'quote', 'copy-selection', '|', 'send-to-chat', 'edit-selection', 'multi-add',
    ])
  })

  it('复制按钮带 selection.copy 文案', () => {
    const element = render()
    const props = element.props as { children: unknown[] }
    const copy = (props.children as ReactElement[]).find(
      child => (child as { props?: { 'data-action'?: string } }).props?.['data-action'] === 'copy-selection',
    )
    expect(copy).toBeDefined()
    const labels = (copy as ReactElement).props.children as ReactElement[]
    expect(labels.map(l => l.props.children)).toContain('selection.copy')
  })
})

describe('复制结果文案', () => {
  const t = (key: string) => zh[key as keyof typeof zh] ?? key

  it('成功时给出「已复制」', async () => {
    const restore = withClipboard(async () => {})
    try {
      expect(await copySelectionText('选中文字', t)).toBe('已复制')
    } finally { restore() }
  })

  it('剪贴板拒绝时给出「复制失败，请手动复制」，不抛错', async () => {
    const restore = withClipboard(async () => { throw new Error('denied') })
    try {
      expect(await copySelectionText('选中文字', t)).toBe('复制失败，请手动复制')
    } finally { restore() }
  })

  it('无剪贴板时同样给失败提示，不抛错', async () => {
    const restore = withClipboard(undefined)
    try {
      expect(await copySelectionText('选中文字', t)).toBe('复制失败，请手动复制')
    } finally { restore() }
  })
})

describe('词典登记', () => {
  it('中英都登记了复制 / 已复制 / 复制失败三条', () => {
    expect(zh['selection.copy']).toBe('复制')
    expect(zh['selection.copied']).toBe('已复制')
    expect(zh['selection.copyFailed']).toBe('复制失败，请手动复制')
    expect(en['selection.copy']).toBe('Copy')
    expect(en['selection.copied']).toBe('Copied')
    expect(en['selection.copyFailed']).toBe('Copy failed; select the text to copy manually')
  })
})
