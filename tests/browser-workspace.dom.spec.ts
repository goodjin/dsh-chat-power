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
    expect(host.querySelector('input[value="https://example.com/"]')).not.toBeNull()
    expect(host.textContent).not.toContain('暂无书签')
    const menuButton = host.querySelector('[aria-label="浏览器设置"]')!
    expect(menuButton.previousElementSibling?.getAttribute('aria-label')).toBe('网页标签')
    await click(menuButton)
    await click(button('隐藏书签栏'))
    expect(host.querySelector('iframe')).not.toBeNull()
    const star = host.querySelector('[aria-label="添加当前页面到书签"]')!
    expect(star.closest('form')!.nextElementSibling!.hasAttribute('hidden')).toBe(true)
  })
  it('导入预览支持选择配置、保留目录和重复导入去重', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ root: '/chrome', profiles: [{ id: 'Default', name: '测试' }] }))).mockResolvedValueOnce(new Response(JSON.stringify({ bookmarks: [{ id: 'folder', name: '研究', children: [{ id: 'leaf', name: '文档', url: 'https://example.com/' }] }] }))))
    await act(async () => { browserState.open('import') })
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    await click(button('预览书签'))
    expect(host.textContent).toContain('研究'); expect(host.textContent).toContain('文档')
    await click(button('导入所选书签')); await click(button('导入所选书签'))
    expect(browserState.get().bookmarks).toHaveLength(1)
    expect(browserState.get().bookmarks[0]?.children?.[0]?.children).toHaveLength(1)
    vi.unstubAllGlobals()
  })
})
