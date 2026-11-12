import type { ToolTab } from '../tools-state.ts'

export interface Bookmark { id: string; name: string; url?: string; children?: Bookmark[] }
export interface Page { id: string; type: 'page' | 'import' | 'bookmarks'; title: string; url?: string }
export interface BrowserSnapshot { pages: Page[]; active?: string; bookmarks: Bookmark[]; showBookmarks: boolean; visible?: boolean }
const KEY = 'chat-power.browser.v1'
const uid = () => crypto.randomUUID()
export function webUrl(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 网页')
  return url.href
}
/** Parse Chrome's tree without executing bookmarklets or trusting its object shape. */
export function chromeBookmarks(value: unknown): Bookmark[] {
  let count = 0
  function parse(node: any, depth: number): Bookmark | undefined {
    if (depth > 40 || ++count > 50000) throw new Error('书签目录过大或层级过深')
    if (!node || typeof node.name !== 'string') return undefined
    if (node.type === 'folder' && Array.isArray(node.children)) return { id: uid(), name: node.name, children: node.children.map((n: unknown) => parse(n, depth + 1)).filter(Boolean) }
    if (node.type === 'url' && typeof node.url === 'string') {
      try { return { id: uid(), name: node.name, url: webUrl(node.url) } } catch { return undefined }
    }
    return undefined
  }
  const roots = (value as any)?.roots
  if (!roots || typeof roots !== 'object') throw new Error('不是有效的 Chrome Bookmarks 文件')
  return Object.values(roots).map(n => parse(n, 0)).filter((n): n is Bookmark => n !== undefined)
}
export function folders(nodes: Bookmark[], depth = 0): { id: string; name: string }[] {
  return nodes.flatMap(n => n.children ? [{ id: n.id, name: '　'.repeat(depth) + n.name }, ...folders(n.children, depth + 1)] : [])
}
export function mergeBookmarks(target: Bookmark[], source: Bookmark[]): Bookmark[] {
  const result = structuredClone(target)
  for (const node of source) {
    const match = result.find(n => n.name === node.name && (node.children ? n.children !== undefined : n.url === node.url))
    if (!match) result.push(structuredClone(node))
    else if (node.children && match.children) match.children = mergeBookmarks(match.children, node.children)
  }
  return result
}
export function selectedBookmarks(nodes: Bookmark[], selected: Set<string>): Bookmark[] {
  return nodes.flatMap(n => {
    if (!n.children) return selected.has(n.id) ? [n] : []
    const children = selectedBookmarks(n.children, selected)
    return selected.has(n.id) || children.length ? [{ ...n, children }] : []
  })
}
export class BrowserState {
  private value: BrowserSnapshot = { pages: [], bookmarks: [], showBookmarks: true }
  private listeners = new Set<() => void>()
  private runtime = new Map<string, ToolTab>()
  private storage?: Pick<Storage, 'getItem' | 'setItem'>
  constructor(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
    this.storage = storage
    try {
      const saved = JSON.parse(storage?.getItem(KEY) ?? 'null')
      if (saved?.version === 1 && Array.isArray(saved.bookmarks) && Array.isArray(saved.pages)) {
        // Re-validate persisted URLs and trees rather than trusting local storage.
        const convert = (nodes: any[]): any[] => nodes.map(n => ({ ...n, type: Array.isArray(n.children) ? 'folder' : 'url', children: Array.isArray(n.children) ? convert(n.children) : undefined }))
        const bookmarks = chromeBookmarks({ roots: { root: { name: '', type: 'folder', children: convert(saved.bookmarks) } } })[0]?.children ?? []
        const pages: Page[] = saved.pages.slice(0, 100).filter((p: any) => ['page', 'import', 'bookmarks'].includes(p.type)).map((p: any) => ({ id: uid(), type: p.type, title: String(p.title ?? '新标签页'), url: p.type === 'page' && p.url ? webUrl(p.url) : undefined }))
        this.value = { bookmarks, pages, active: pages[saved.activeIndex]?.id ?? pages[0]?.id, showBookmarks: saved.showBookmarks !== false }
      }
    } catch { /* Corrupt or unavailable storage starts an empty workspace. */ }
  }
  get = () => this.value
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  private put(value: BrowserSnapshot) {
    this.value = value
    try { this.storage?.setItem(KEY, JSON.stringify({ ...value, version: 1, activeIndex: value.pages.findIndex(p => p.id === value.active) })) } catch { console.warn('[chat-power] 浏览器状态无法保存到本机存储') }
    for (const fn of this.listeners) fn()
  }
  open(type: Page['type'] = 'page', url?: string) {
    const existing = type !== 'page' && this.value.pages.find(p => p.type === type)
    if (existing) { this.select(existing.id); return existing }
    const page: Page = { id: uid(), type, title: type === 'import' ? '导入 Chrome 书签' : type === 'bookmarks' ? '管理书签' : url ? new URL(webUrl(url)).hostname : '新标签页', url: url ? webUrl(url) : undefined }
    this.put({ ...this.value, pages: [...this.value.pages, page], active: page.id }); return page
  }
  select(id: string) { if (this.value.pages.some(p => p.id === id)) this.put({ ...this.value, active: id }) }
  close(id: string) {
    const index = this.value.pages.findIndex(p => p.id === id)
    const pages = this.value.pages.filter(p => p.id !== id)
    this.runtime.get(id)?.controller.abort(); this.runtime.delete(id)
    this.put({ ...this.value, pages, active: this.value.active === id ? pages[Math.max(0, index - 1)]?.id : this.value.active })
  }
  updatePage(id: string, url: string, title?: string) {
    try {
      url = webUrl(url)
      const page = this.value.pages.find(p => p.id === id)
      const name = title || new URL(url).hostname
      if (page && (page.url !== url || page.title !== name)) this.put({ ...this.value, pages: this.value.pages.map(p => p.id === id ? { ...p, url, title: name } : p) })
    } catch { /* Host reports internal or unknown addresses; do not persist them. */ }
  }
  setVisible(visible: boolean) { if (!!this.value.visible !== visible) this.put({ ...this.value, visible }) }
  toggleBookmarks() { this.put({ ...this.value, showBookmarks: !this.value.showBookmarks }) }
  saveBookmark(node: Omit<Bookmark, 'id'> & { id?: string }, parent = '') {
    const tree = structuredClone(this.value.bookmarks)
    let old: Bookmark | undefined
    const remove = (nodes: Bookmark[]): void => { for (let i = nodes.length - 1; i >= 0; i--) { if (nodes[i]!.id === node.id) old = nodes.splice(i, 1)[0]; else if (nodes[i]!.children) remove(nodes[i]!.children!) } }
    if (node.id) remove(tree)
    const locate = (nodes: Bookmark[]): Bookmark[] | undefined => { for (const n of nodes) { if (n.id === parent && n.children) return n.children; const found = n.children && locate(n.children); if (found) return found } }
    const destination = parent ? locate(tree) : tree
    if (!destination) throw new Error('目标文件夹不存在，或不能把文件夹移入自身')
    destination.push({ ...old, ...node, id: node.id ?? uid(), name: node.name.trim() || '未命名', url: node.url ? webUrl(node.url) : undefined })
    this.put({ ...this.value, bookmarks: tree })
  }
  removeBookmark(id: string) {
    const remove = (nodes: Bookmark[]): Bookmark[] => nodes.filter(n => n.id !== id).map(n => n.children ? { ...n, children: remove(n.children) } : n)
    this.put({ ...this.value, bookmarks: remove(this.value.bookmarks) })
  }
  importBookmarks(nodes: Bookmark[]) {
    this.put({ ...this.value, bookmarks: mergeBookmarks(this.value.bookmarks, [{ id: uid(), name: '从 Chrome 导入', children: nodes }]) })
  }
  tab(page: Page): ToolTab {
    let tab = this.runtime.get(page.id)
    if (!tab) {
      tab = { id: page.id, kind: 'browser', contentId: 'sidebar://browser', title: page.title, params: page.url ? { url: page.url } : {}, controller: new AbortController(), commands: {} }
      this.runtime.set(page.id, tab)
    }
    return tab
  }
  dispose() { for (const tab of this.runtime.values()) tab.controller.abort(); this.runtime.clear() }
}
function storage(): Storage | undefined { try { return globalThis.localStorage } catch { return undefined } }
export const browserState = new BrowserState(storage())
