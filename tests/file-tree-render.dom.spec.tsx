// @vitest-environment jsdom
/**
 * 工作区文件树的渲染（2026-11-18）。
 *
 * 钉住这几件在真实 DOM 上成立的事：
 * - 根路径栏画出来了（目录段 + 末段）；
 * - 当前文件那一行标了 aria-current；
 * - 目录有展开箭头、文件有类型图标；
 * - 重新读取按钮在根路径栏上；
 * - 右键一行会请求打开菜单。
 */
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LazyFileTree } from '../src/file-tree-lazy.tsx'

const flush = async (): Promise<void> => {
  await act(async () => { await Promise.resolve() })
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) })
}

let container: HTMLDivElement | undefined
afterEach(() => {
  container?.remove()
  container = undefined
})

function mount(props: Partial<Parameters<typeof LazyFileTree>[0]> = {}): HTMLDivElement {
  container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const remote = () => ({
    workspaceFiles: {
      list: async () => ({
        ok: true,
        value: {
          entries: [
            { name: 'src', type: 'directory' },
            { name: 'main.ts', type: 'file', size: 120 },
          ],
          truncated: false,
        },
      }),
    },
  })
  act(() => {
    root.render(<LazyFileTree
      sessionId="s1"
      remote={remote}
      t={key => key}
      {...props} />)
  })
  return container
}

describe('工作区文件树的渲染', () => {
  it('画出根路径栏：目录段与末段分开', async () => {
    const box = mount({ rootPath: '/Users/good/project' })
    await flush()
    expect(box.querySelector('[class*="rootLeaf"]')?.textContent).toBe('project')
    expect(box.querySelector('[class*="rootPart"]')?.textContent).toContain('Users')
  })

  it('当前文件那一行标出来', async () => {
    const box = mount({ currentPath: 'main.ts' })
    await flush()
    const row = box.querySelector('[data-files-path="main.ts"] button')
    expect(row?.getAttribute('aria-current')).toBe('true')
    expect(row?.hasAttribute('data-current')).toBe(true)
  })

  it('不是当前文件的行不标', async () => {
    const box = mount({ currentPath: 'other.ts' })
    await flush()
    const row = box.querySelector('[data-files-path="main.ts"] button')
    expect(row?.hasAttribute('aria-current')).toBe(false)
  })

  it('目录行有展开标记，文件行有类型图标', async () => {
    const box = mount()
    await flush()
    const directory = box.querySelector('[data-files-path="src"] button')
    expect(directory?.getAttribute('aria-expanded')).toBe('false')
    expect(directory?.querySelector('[class*="caret"]')).not.toBeNull()
    // 文件行的图标是按类型挑的 svg，不是目录那个文件夹图标。
    const file = box.querySelector('[data-files-path="main.ts"] button')
    const icons = file?.querySelectorAll('[class*="icon"]') ?? []
    expect(icons.length).toBeGreaterThan(0)
  })

  it('根路径栏上有重新读取按钮', async () => {
    const box = mount({ rootPath: '/root', onRefresh: vi.fn() })
    await flush()
    expect(box.querySelector('[data-files-refresh]')).not.toBeNull()
  })

  it('右键一行会请求打开菜单', async () => {
    const onContextMenu = vi.fn()
    const box = mount({ onContextMenu })
    await flush()
    const row = box.querySelector('[data-files-path="main.ts"] button') as HTMLElement
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 12, clientY: 34 })
    await act(async () => { row.dispatchEvent(event) })
    expect(onContextMenu).toHaveBeenCalledWith(
      { sessionId: 's1', path: 'main.ts', directory: false },
      { x: 12, y: 34 },
    )
  })

  it('目录行右键带目录标记', async () => {
    const onContextMenu = vi.fn()
    const box = mount({ onContextMenu })
    await flush()
    const row = box.querySelector('[data-files-path="src"] button') as HTMLElement
    await act(async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 1, clientY: 2 }))
    })
    expect(onContextMenu).toHaveBeenCalledWith(
      { sessionId: 's1', path: 'src', directory: true },
      { x: 1, y: 2 },
    )
  })
})
