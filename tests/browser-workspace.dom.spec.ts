import { createElement, act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BrowserChrome, BrowserWorkspace } from '../src/browser/workspace.tsx'
import { browserState, type Page } from '../src/browser/state.ts'
let host: HTMLDivElement; let root: Root
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click() }) }
function renderPage(page: Page) {
  return createElement(BrowserChrome, { hostProps: { loadUrl: () => {}, useTabInfo: () => ({ tab: { id: page.id } }), useBrowserState: () => ({ frame: { target: page.url ? { url: page.url, title: page.title } : undefined } }) },
    children: createElement('div', {}, createElement('form', {}, createElement('input', { 'aria-label': '地址' })), createElement('iframe', { title: page.id, src: 'about:blank' })) })
}
beforeEach(async () => {
  for (const p of browserState.get().pages) browserState.close(p.id)
  for (const b of browserState.get().bookmarks) browserState.removeBookmark(b.id)
  if (!browserState.get().showBookmarks) browserState.toggleBookmarks()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  await act(async () => { root.render(createElement(BrowserWorkspace, { renderPage })) })
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks() })
describe('浏览器工作台真实 DOM', () => {
  it('切换页面及显示状态不会重建网页节点，关闭才移除', async () => {
    await act(async () => { browserState.open('page', 'https://example.com/a'); browserState.open('page', 'https://example.com/b') })
    const pages = browserState.get().pages
    const first = host.querySelector(`iframe[title="${pages[0]!.id}"]`)
    expect(host.querySelectorAll('iframe')).toHaveLength(2)
    await act(async () => { browserState.select(pages[0]!.id); browserState.setVisible(false); browserState.setVisible(true) })
    expect(host.querySelector(`iframe[title="${pages[0]!.id}"]`)).toBe(first)
    await act(async () => { browserState.close(pages[0]!.id) })
    expect(host.querySelectorAll('iframe')).toHaveLength(1)
  })
  it('星标进入书签操作标签，菜单开关只控制书签栏', async () => {
    await act(async () => { browserState.open('page', 'https://example.com') })
    await click(host.querySelector('[aria-label="添加当前页面到书签"]')!)
    expect(host.textContent).toContain('管理书签')
    expect(host.querySelector('[role="dialog"] input[aria-label="名称"]')!.getAttribute('value') ?? '').not.toBeNull()
    expect(host.querySelector('[role="dialog"] input[aria-label="网址"]')!.getAttribute('value') ?? '').toContain('example.com')
    const menuButton = host.querySelector('[aria-label="浏览器设置"]')!
    expect(menuButton.previousElementSibling?.getAttribute('aria-label')).toBe('网页标签')
    await click(menuButton)
    await click(button('隐藏书签栏'))
    expect(host.querySelector('iframe')).not.toBeNull()
    const star = host.querySelector('[aria-label="添加当前页面到书签"]')!
    expect(star.closest('form')!.nextElementSibling!.hasAttribute('hidden')).toBe(true)
  })
  it('导入预览支持选择配置、保留目录和重复导入去重，导入直接落书签栏一级目录', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ root: '/chrome', profiles: [{ id: 'Default', name: '测试' }] }))).mockResolvedValue(new Response(JSON.stringify({ bookmarks: [{ id: 'folder', name: '研究', children: [{ id: 'leaf', name: '文档', url: 'https://example.com/' }] }] }))))
    await act(async () => { browserState.open('import') })
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await click(button('预览书签'))
    expect(host.textContent).toContain('研究'); expect(host.textContent).toContain('文档')
    await click(button('导入所选书签')); await click(button('导入所选书签'))
    expect(host.textContent).toContain('已导入到书签栏')
    expect(browserState.get().bookmarks.map(b => b.name)).toEqual(['研究'])
    expect(browserState.get().bookmarks[0]?.children?.[0]?.name).toBe('文档')
    vi.unstubAllGlobals()
  })
  it('管理书签页呈 Chrome 式布局：左侧文件夹树、右侧列表、搜索过滤、编辑对话框', async () => {
    await act(async () => { browserState.saveBookmark({ name: '研究', children: [{ id: 'd1', name: '文档', url: 'https://example.com/' }, { id: 'd2', name: '论坛', url: 'https://forum.example.com/' }] }); browserState.saveBookmark({ name: '首页', url: 'https://home.example.com/' }) })
    await act(async () => { browserState.open('bookmarks') })
    const manager = host.querySelector('[aria-label="管理书签面板"]')!
    expect(manager).not.toBeNull()
    expect(manager.querySelector('[aria-label="文件夹树"]')).not.toBeNull()
    expect(manager.querySelector('[aria-label="书签列表"]')).not.toBeNull()
    expect(manager.textContent).toContain('书签栏')
    // 右侧列表展示当前文件夹内容
    expect(manager.querySelector('[role="list"]')!.textContent).toContain('研究')
    expect(manager.querySelector('[role="list"]')!.textContent).toContain('首页')
    // 搜索过滤
    const search = manager.querySelector<HTMLInputElement>('input[aria-label="搜索书签"]')!
    const setNative = (input: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, value)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    await act(async () => { setNative(search, '论坛') })
    expect(manager.querySelector('[role="list"]')!.textContent).not.toContain('文档')
    expect(manager.querySelector('[role="list"]')!.textContent).toContain('论坛')
    await act(async () => { setNative(search, '') })
    // 编辑对话框
    await click([...manager.querySelectorAll('button')].find(b => b.getAttribute('aria-label')?.startsWith('编辑 '))!)
    const dialog = manager.querySelector('[role="dialog"]')!
    expect(dialog).not.toBeNull()
    const nameInput = dialog.querySelector<HTMLInputElement>('input[aria-label="名称"]')!
    await act(async () => { nameInput.value = '研究文档'; nameInput.dispatchEvent(new Event('input', { bubbles: true })) })
    await click([...dialog.querySelectorAll('button')].find(b => b.textContent === '保存')!)
    expect(manager.querySelector('[role="dialog"]')).toBeNull()
    expect(browserState.get().bookmarks.map(b => b.name)).toContain('研究文档')
  })
})
