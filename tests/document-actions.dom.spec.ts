// @vitest-environment jsdom
/**
 * 文档预览右上角的动作钮：图标表示（复制 / 编辑）。
 *
 * 宿主把文档预览那一排的尾部交给 `sidebar.right.tab.document.actions` 插槽，
 * 同一排里放的是宿主自己的图标钮。本包的两个动作原先是文字钮（复制全文 /
 * 编辑并发送），挤在图标旁边既占地方又不成样——这里钉住它们是图标钮。
 */
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// 原语包的图标会传递性引入 .module.css，jsdom 的 vite 不转译 CSS；这里把图标换成
// 同名的 SVG 桩（保留「按钮里是图形」这件事本身）。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const icon = (name: string) => (props: { size?: number }) =>
    createElement('svg', { 'data-icon': name, width: props.size, height: props.size })
  return {
    IconCheckOutlineRegular: icon('check'),
    IconCopyOutlineRegular: icon('copy'),
    IconEditOutlineRegular: icon('edit'),
  }
})

import { DocumentActions } from '../src/document-actions.tsx'
import type { MarkdownTurnReaders } from '../src/markdown-turn-sources.ts'

afterEach(() => { document.body.innerHTML = ''; vi.useRealTimers() })

/** 只实现用到的那两个方法。 */
function fakeReaders(text = '文件全文'): MarkdownTurnReaders {
  return {
    readPage: async () => ({ text, lines: 1, eof: true }),
  } as unknown as MarkdownTurnReaders
}

/** 把组件挂上去，返回容器与两个钮。 */
async function mount(readers = fakeReaders(), onEdit = vi.fn()) {
  document.body.innerHTML = '<div id="root"></div>'
  const root = createRoot(document.getElementById('root')!)
  await act(async () => {
    root.render(createElement(DocumentActions, {
      sessionId: 's1', absolutePath: '/w/docs/a.md', readers, onEdit,
    }))
  })
  const host = document.getElementById('root')!
  return {
    host,
    copy: host.querySelector<HTMLButtonElement>('[data-chat-power-document-copy]')!,
    edit: host.querySelector<HTMLButtonElement>('[data-chat-power-document-edit]')!,
    status: host.querySelector<HTMLElement>('[data-chat-power-document-status]')!,
    onEdit,
  }
}

describe('文档预览右上角的图标钮', () => {
  it('两个动作都是图标钮：没有文字标签，只有图形与提示', async () => {
    const { host, copy, edit } = await mount()
    expect(copy).not.toBeNull()
    expect(edit).not.toBeNull()
    expect(copy.querySelector('svg')).not.toBeNull()
    expect(edit.querySelector('svg')).not.toBeNull()
    // 文字不再出现在按钮里（改由 aria-label / title 说明）
    expect((copy.textContent ?? '').trim()).toBe('')
    expect((edit.textContent ?? '').trim()).toBe('')
    expect(copy.getAttribute('aria-label')).toBe('复制全文')
    expect(edit.getAttribute('aria-label')).toBe('编辑并发送')
    expect(copy.getAttribute('title')).toBe('复制全文')
    expect(edit.getAttribute('title')).toBe('编辑并发送')
    // 两钮都带本包的标记，便于样式与诊断定位
    expect(copy.getAttribute('data-chat-power-document-action')).toBe('')
    expect(edit.getAttribute('data-chat-power-document-action')).toBe('')
    expect(host.querySelectorAll('button')).toHaveLength(2)
  })

  it('点复制：读全文写进剪贴板，图标换成对勾', async () => {
    const written: string[] = []
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => { written.push(text) } },
    })
    vi.useFakeTimers()
    const { copy } = await mount()
    await act(async () => { copy.click() })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(written).toEqual(['文件全文'])
    // 成功后图标换成对勾，提示文字同步改成「已复制全文」
    expect(copy.getAttribute('aria-label')).toBe('已复制全文')
    expect(copy.querySelector('svg')?.getAttribute('data-icon')).toBe('check')
    await act(async () => { vi.advanceTimersByTime(1700) })
    expect(copy.getAttribute('aria-label')).toBe('复制全文')
    expect(copy.querySelector('svg')?.getAttribute('data-icon')).toBe('copy')
  })

  it('点编辑：交给调用方去开编辑区', async () => {
    const onEdit = vi.fn()
    const { edit } = await mount(fakeReaders(), onEdit)
    await act(async () => { edit.click() })
    expect(onEdit).toHaveBeenCalledWith('s1', '/w/docs/a.md')
  })

  it('复制失败：图标不变，出错信息进只给读屏软件看的状态区', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('剪贴板不可用') } },
    })
    const { copy, status } = await mount()
    await act(async () => { copy.click() })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(copy.getAttribute('aria-label')).toBe('复制全文')
    expect(status.textContent ?? '').toContain('操作失败')
    expect(status.getAttribute('role')).toBe('status')
  })
})
