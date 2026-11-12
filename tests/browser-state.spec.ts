import { describe, expect, it } from 'vitest'
import { BrowserState, chromeBookmarks, selectedBookmarks } from '../src/browser/state.ts'
const source = { roots: { bookmark_bar: { type: 'folder', name: '书签栏', children: [
  { type: 'folder', name: '项目', children: [{ type: 'url', name: '文档', url: 'https://example.com/docs' }] },
  { type: 'url', name: '危险', url: 'javascript:alert(1)' },
] } } }
describe('共享浏览器和书签', () => {
  it('恢复网页顺序、当前页和书签栏开关，关闭页面中止原引擎实例', () => {
    let saved: string | null = null
    const storage = { getItem: () => saved, setItem: (_: string, s: string) => { saved = s } }
    const state = new BrowserState(storage)
    const a = state.open('page', 'https://a.example'); const b = state.open('page', 'https://b.example')
    state.select(a.id); state.toggleBookmarks()
    const restored = new BrowserState(storage)
    expect(restored.get().pages.map(p => p.url)).toEqual(['https://a.example/', 'https://b.example/'])
    expect(restored.get().active).toBe(restored.get().pages[0]?.id)
    expect(restored.get().showBookmarks).toBe(false)
    const tab = state.tab(a); state.close(a.id)
    expect(tab.controller.signal.aborted).toBe(true)
    expect(state.get().active).toBe(b.id)
  })
  it('目录层级保留、同目录去重、不同目录同网址保留', () => {
    const tree = chromeBookmarks(source)
    expect(tree[0]?.children).toHaveLength(1)
    const state = new BrowserState()
    state.importBookmarks(tree); state.importBookmarks(chromeBookmarks(source))
    expect(state.get().bookmarks.map(n => n.name)).toEqual(['书签栏'])
    expect(state.get().bookmarks[0]?.children?.[0]?.children).toHaveLength(1)
    state.importBookmarks([{ id: 'other', name: '另一个目录', children: [{ id: 'url', name: '文档', url: 'https://example.com/docs' }] }])
    expect(state.get().bookmarks).toHaveLength(2) // 顶层直接并列，不再包壳
    expect(state.get().bookmarks[1]?.children).toHaveLength(1)
  })
  it('导入直接落一级目录：Chrome 顶层节点成为书签栏一级项，同名仍去重', () => {
    const state = new BrowserState()
    const tree = chromeBookmarks(source)
    const leaf = tree[0]!.children![0]!.children![0]!
    state.importBookmarks(selectedBookmarks(tree, new Set([leaf.id])))
    expect(state.get().bookmarks).toHaveLength(1) // 「书签栏」根节点成为一级项，而非包进「从 Chrome 导入」
    expect(state.get().bookmarks[0]?.name).toBe('书签栏')
    state.importBookmarks(selectedBookmarks(chromeBookmarks(source), new Set([leaf.id])))
    expect(state.get().bookmarks).toHaveLength(1) // 同名顶层目录去重
  })
  it('旧「从 Chrome 导入」壳在导入或恢复时展开并入一级目录', () => {
    const state = new BrowserState()
    // 模拟旧版数据：一级只有壳文件夹
    state.saveBookmark({ name: '从 Chrome 导入', children: [{ id: 'b1', name: '文档', url: 'https://example.com/docs' }, { id: 'f1', name: '项目', children: [{ id: 'b2', name: '仓库', url: 'https://example.com/repo' }] }] })
    state.importBookmarks([{ id: 'new', name: '新闻', url: 'https://news.example.com' }])
    const top = state.get().bookmarks
    expect(top.map(n => n.name)).toEqual(['文档', '项目', '新闻']) // 壳展开：内容并入一级，壳本身消失
    expect(top.find(n => n.name === '项目')?.children).toHaveLength(1)
  })
  it('导入直接落一级目录，不新增「从 Chrome 导入」文件夹', () => {
    const state = new BrowserState()
    state.importBookmarks([{ id: 'f1', name: '研究', children: [{ id: 'u1', name: '文档', url: 'https://example.com/' }] }, { id: 'u2', name: '首页', url: 'https://example.org/' }])
    const bookmarks = state.get().bookmarks
    expect(bookmarks.map(b => b.name)).toEqual(['研究', '首页'])
    expect(bookmarks.some(b => b.name === '从 Chrome 导入')).toBe(false)
    expect(bookmarks[0]?.children?.[0]?.name).toBe('文档')
  })
  it('旧「从 Chrome 导入」壳文件夹在导入或恢复时展开并合并到一级目录', () => {
    let saved: string | null = null
    const storage = { getItem: () => saved, setItem: (_: string, s: string) => { saved = s } }
    const legacy = new BrowserState(storage)
    legacy.importBookmarks([{ id: 'u1', name: '文档', url: 'https://example.com/' }])
    // 手工构造旧壳形状，模拟上一版插件写入的数据
    saved = JSON.stringify({ version: 1, pages: [], bookmarks: [{ id: 'shell', name: '从 Chrome 导入', children: [{ id: 'u1', name: '文档', url: 'https://example.com/' }, { id: 'f1', name: '研究', children: [] }] }] })
    const restored = new BrowserState(storage)
    expect(restored.get().bookmarks.map(b => b.name)).toEqual(['文档', '研究'])
    expect(restored.get().bookmarks.some(b => b.name === '从 Chrome 导入')).toBe(false)
  })
  it('仅导入勾选子项并保留祖先目录', () => {
    const tree = chromeBookmarks(source)
    const leaf = tree[0]!.children![0]!.children![0]!
    const selected = selectedBookmarks(tree, new Set([leaf.id]))
    expect(selected[0]?.children?.[0]?.children).toEqual([leaf])
  })
  it('文件夹不能移入自身或子孙目录；书签可改名、移动和删除', () => {
    const state = new BrowserState()
    state.saveBookmark({ name: '目录', children: [] })
    const folder = state.get().bookmarks[0]!
    expect(() => state.saveBookmark(folder, folder.id)).toThrow()
    expect(state.get().bookmarks).toEqual([folder])
    state.saveBookmark({ name: '网页', url: 'https://example.com' })
    const node = state.get().bookmarks[1]!
    state.saveBookmark({ ...node, name: '新名称' }, folder.id)
    expect(state.get().bookmarks).toHaveLength(1)
    expect(state.get().bookmarks[0]?.children?.[0]?.name).toBe('新名称')
    state.removeBookmark(node.id)
    expect(state.get().bookmarks[0]?.children).toEqual([])
  })
  it('操作标签复用，网页标签支持多个独立实例', () => {
    const state = new BrowserState()
    expect(state.open('import').id).toBe(state.open('import').id)
    expect(state.open().id).not.toBe(state.open().id)
  })
})
