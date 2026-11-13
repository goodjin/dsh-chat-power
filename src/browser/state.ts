import type { ToolTab } from '../tools-state.ts'

export interface Bookmark { id: string; name: string; url?: string; children?: Bookmark[]; chromeId?: string; chromeSource?: string }
export interface Page { id: string; type: 'page' | 'import' | 'bookmarks'; title: string; url?: string }
export interface ChromeSync { at: string; root: string; profile: string; source: string; links: number; folders: number; added: number; updated: number; retained: number; data: Bookmark[] }
export interface BrowserSnapshot { pages: Page[]; active?: string; bookmarks: Bookmark[]; showBookmarks: boolean; visible?: boolean; chromeSync?: ChromeSync }
const KEY = 'chat-power.browser.v1'
const uid = () => crypto.randomUUID()
export function webUrl(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('仅支持 HTTP 或 HTTPS 网页')
  return url.href
}
/** Parse Chrome's tree without executing bookmarklets or trusting its object shape. */
export function chromeBookmarks(value: unknown, restore = false): Bookmark[] {
  let count = 0
  function parse(node: any, depth: number): Bookmark | undefined {
    if (depth > 40 || ++count > 50000) throw new Error('书签目录过大或层级过深')
    if (!node || typeof node.name !== 'string') return undefined
    const identity = { id: restore && typeof node.id === 'string' ? node.id : uid(), chromeId: restore ? node.chromeId : String(node.guid ?? node.id ?? '') || undefined, chromeSource: restore && typeof node.chromeSource === 'string' ? node.chromeSource : undefined }
    if (node.type === 'folder' && Array.isArray(node.children)) return { ...identity, name: node.name, children: node.children.map((n: unknown) => parse(n, depth + 1)).filter(Boolean) }
    if (node.type === 'url' && typeof node.url === 'string') {
      try { return { ...identity, name: node.name, url: webUrl(node.url) } } catch { return undefined }
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
/**
 * 导入壳名单：旧版「从 Chrome 导入」包装文件夹，以及 Chrome 书签文件的根节点
 * （书签栏 / 其他书签 / 移动设备书签，中英文）。这些名字出现在一级时视为壳，
 * 展开为其中内容；名字匹配只作用于最外层，用户自建的同名子目录不受影响。
 */
const IMPORT_SHELLS = new Set(['从 chrome 导入', '书签栏', '其他书签', '移动设备书签', 'bookmarks bar', 'bookmarks bar.', 'other bookmarks', 'mobile bookmarks'])
/** 递归剥掉一级的导入壳（壳中壳也一并剥掉），内容提升为一级。 */
export function flattenImportShells(nodes: Bookmark[]): Bookmark[] {
  const shells = nodes.filter(n => n.children && IMPORT_SHELLS.has(n.name.toLowerCase()))
  if (!shells.length) return nodes
  const rest = nodes.filter(n => !(n.children && IMPORT_SHELLS.has(n.name.toLowerCase())))
  return flattenImportShells([...rest, ...shells.flatMap(s => s.children ?? [])])
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
/** Chrome wins for matched items; unmatched local nodes survive, including in moved folders. */
export function syncChromeBookmarks(local: Bookmark[], incoming: Bookmark[], source: string) {
  const all: Bookmark[] = []
  const collect = (nodes: Bookmark[]) => { for (const n of nodes) { all.push(n); if (n.children) collect(n.children) } }
  collect(local)
  const byChromeId = new Map(all.filter(n => n.chromeSource === source && n.chromeId).map(n => [n.chromeId!, n]))
  const claimed = new Set<string>()
  const deferred: { result: Bookmark[]; old: Bookmark[] }[] = []
  const stats = { links: 0, folders: 0, added: 0, updated: 0, retained: 0 }
  const build = (nodes: Bookmark[], siblings: Bookmark[]): Bookmark[] => {
    const result = nodes.map(node => {
      const sameType = (n: Bookmark) => !!n.children === !!node.children && !claimed.has(n.id)
      const known = node.chromeId ? byChromeId.get(node.chromeId) : undefined
      const match = (known && sameType(known) ? known : undefined) ||
        siblings.find(n => sameType(n) && (!n.chromeSource || (!node.chromeId && n.chromeSource === source)) && (node.children ? n.name === node.name : n.url === node.url)) ||
        siblings.find(n => sameType(n) && (!n.chromeSource || (!node.chromeId && n.chromeSource === source)) && n.name === node.name)
      if (match) { claimed.add(match.id); if (match.name !== node.name || match.url !== node.url) stats.updated++ }
      else stats.added++
      if (node.children) stats.folders++; else stats.links++
      return { ...node, id: match?.id ?? uid(), chromeSource: source, children: node.children ? build(node.children, match?.children ?? []) : undefined }
    })
    deferred.push({ result, old: siblings })
    return result
  }
  const bookmarks = build(incoming, local)
  const remaining = (nodes: Bookmark[]): Bookmark[] => nodes.flatMap(node => {
    if (claimed.has(node.id)) return []
    stats.retained++
    return [{ ...node, children: node.children ? remaining(node.children) : undefined }]
  })
  for (const item of deferred) item.result.push(...remaining(item.old))
  return { bookmarks, stats }
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
        const bookmarks = flattenImportShells(chromeBookmarks({ roots: { root: { name: '', type: 'folder', children: convert(saved.bookmarks) } } }, true)[0]?.children ?? [])
        const pages: Page[] = saved.pages.slice(0, 100).filter((p: any) => ['page', 'import', 'bookmarks'].includes(p.type)).map((p: any) => ({ id: uid(), type: p.type, title: p.type === 'import' ? '同步书签' : String(p.title ?? '新标签页'), url: p.type === 'page' && p.url ? webUrl(p.url) : undefined }))
        this.value = { bookmarks, pages, active: pages[saved.activeIndex]?.id ?? pages[0]?.id, showBookmarks: saved.showBookmarks !== false, chromeSync: saved.chromeSync && typeof saved.chromeSync.at === 'string' && Array.isArray(saved.chromeSync.data) ? saved.chromeSync : undefined }
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
    const page: Page = { id: uid(), type, title: type === 'import' ? '同步书签' : type === 'bookmarks' ? '管理书签' : url ? new URL(webUrl(url)).hostname : '新标签页', url: url ? webUrl(url) : undefined }
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
    this.put({ ...this.value, bookmarks: mergeBookmarks(flattenImportShells(this.value.bookmarks), flattenImportShells(nodes)) })
  }
  syncBookmarks(nodes: Bookmark[], source: string, root: string, profile: string) {
    const data = flattenImportShells(nodes)
    const result = syncChromeBookmarks(flattenImportShells(this.value.bookmarks), data, source)
    const chromeSync: ChromeSync = { at: new Date().toISOString(), root, profile, source, data: structuredClone(data), ...result.stats }
    this.put({ ...this.value, bookmarks: result.bookmarks, chromeSync })
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
