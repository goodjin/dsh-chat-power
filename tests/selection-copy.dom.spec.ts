/**
 * 选区「复制」按钮的真渲染回归：点击后确实写剪贴板、确实浮出提示、确实收台。
 *
 * 元素树测试（selection-toolbar.spec.ts）只钉形状，覆盖不到点击与异步反馈；
 * 这里用真 React + jsdom 跑一遍。剪贴板用假实现注入，避免依赖 Chromium。
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 真渲染只需要两个描边图标；真实 primitives 包会连带加载 node_modules 里的
// .module.css（vite 不处理），故喂哑组件顶上。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSendOutlineRegular: () => null,
  IconEditOutlineRegular: () => null,
}))

import { SelectionToolbar } from '../src/selection-toolbar.tsx'
import { makeT, zh } from '../src/locales.ts'

let root: Root | undefined

function render(props: Record<string, unknown>): HTMLElement {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(createElement(SelectionToolbar, props as never)))
  return container
}

/** 装一个记录写入内容的假剪贴板；返回写入记录与还原函数。 */
function fakeClipboard(ok = true): { writes: string[]; restore: () => void } {
  const writes: string[] = []
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard')
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        if (!ok) throw new Error('denied')
        writes.push(text)
      },
    },
  })
  return {
    writes,
    restore: () => {
      if (original === undefined) Reflect.deleteProperty(globalThis.navigator, 'clipboard')
      else Object.defineProperty(globalThis.navigator, 'clipboard', original)
    },
  }
}

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
  vi.useRealTimers()
})

describe('点复制按钮', () => {
  it('把选中文字写进剪贴板，浮出「已复制」，并清选区收台', async () => {
    const board = fakeClipboard()
    const clearSelection = vi.fn()
    const dismiss = vi.fn()
    try {
      const container = render({
        readText: () => '要复制的选中文字',
        dismiss,
        clearSelection,
        t: makeT(zh),
      })
      const button = container.querySelector<HTMLButtonElement>('[data-action="copy-selection"]')!
      expect(button).not.toBeNull()
      expect(button.textContent).toContain('复制')

      await act(async () => {
        button.click()
        // 放掉 copyTextToClipboard 的 Promise 链，让 .then 里的浮层落地。
        await Promise.resolve()
      })

      expect(board.writes).toEqual(['要复制的选中文字'])
      expect(clearSelection).toHaveBeenCalledTimes(1)
      expect(dismiss).toHaveBeenCalledTimes(1)
      const toast = document.querySelector('[data-dshca-copy-toast]')
      expect(toast?.textContent).toBe('已复制')

      // 约 1.5 秒后提示自消，不留在页面上。
      await act(async () => { vi.advanceTimersByTime(1500) })
      expect(document.querySelector('[data-dshca-copy-toast]')).toBeNull()
    } finally { board.restore() }
  })

  it('剪贴板被拒时浮出「复制失败，请手动复制」，不抛错也不卡住收台', async () => {
    const board = fakeClipboard(false)
    const dismiss = vi.fn()
    try {
      const container = render({
        readText: () => '选中文字',
        dismiss,
        clearSelection: () => {},
        t: makeT(zh),
      })
      const button = container.querySelector<HTMLButtonElement>('[data-action="copy-selection"]')!
      await act(async () => {
        button.click()
        await Promise.resolve()
      })
      expect(dismiss).toHaveBeenCalledTimes(1)
      expect(document.querySelector('[data-dshca-copy-toast]')?.textContent)
        .toBe('复制失败，请手动复制')
    } finally { board.restore() }
  })
})
