import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { browserState, selectedBookmarks, type Bookmark, type Page } from './state.ts'
import css from './workspace.module.css'
import { requestChrome } from './chrome-request.ts'
const useBrowser = () => useSyncExternalStore(browserState.subscribe, browserState.get, browserState.get)
function BookmarkItems({ nodes, onOpen }: { nodes: Bookmark[]; onOpen: (url: string) => void }) {
  return <>{nodes.map(n => n.children ? <details key={n.id} className={css.folder}><summary>{n.name || '未命名文件夹'}</summary><div><BookmarkItems nodes={n.children} onOpen={onOpen} />{n.children.length === 0 && <span>空文件夹</span>}</div></details> : <span key={n.id} className={css.bookmark}><button title={n.url} onClick={() => { if (n.url) onOpen(n.url) }}>{n.name || n.url}</button><button aria-label={`在新标签打开 ${n.name}`} title="在新标签打开" onClick={() => browserState.open('page', n.url)}>↗</button></span>)}</>
}
/** Wrap the host body; keep its desktop/iframe engine, navigation and visibility contract. */
export function BrowserChrome({ hostProps, children }: { hostProps: any; children: ReactNode }) {
  const snapshot = useBrowser()
  const { tab } = hostProps.useTabInfo()
  const native = hostProps.useBrowserState(tab.id)
  const target = native?.frame?.target ?? native?.restoreTarget
  const root = useRef<HTMLDivElement>(null)
  const [seats, setSeats] = useState<{ star: HTMLElement; bookmarks: HTMLElement }>()
  useEffect(() => { if (target?.url) browserState.updatePage(tab.id, target.url, target.title) }, [tab.id, target?.url, target?.title])
  useLayoutEffect(() => {
    const toolbar = root.current?.querySelector('form')
    if (!toolbar) return
    const star = document.createElement('span'); const bookmarks = document.createElement('div')
    bookmarks.className = css.bookmarkBar ?? ''
    toolbar.append(star); toolbar.after(bookmarks); setSeats({ star, bookmarks })
    return () => { star.remove(); bookmarks.remove() }
  }, [])
  useLayoutEffect(() => { if (seats) seats.bookmarks.hidden = !snapshot.showBookmarks }, [seats, snapshot.showBookmarks])
  const current = native?.frame?.address === 'unknown' ? undefined : target?.url ?? snapshot.pages.find(p => p.id === tab.id)?.url
  return <div ref={root} className={css.native}>{children}
    {seats && createPortal(<button type="button" aria-label="添加当前页面到书签" title="添加书签" disabled={!current} onClick={() => window.dispatchEvent(new CustomEvent('chat-power:add-bookmark', { detail: { name: target?.title || current, url: current } }))}>☆</button>, seats.star)}
    {seats && createPortal(snapshot.bookmarks.length ? <BookmarkItems nodes={snapshot.bookmarks} onOpen={url => hostProps.loadUrl(tab.id, url)} /> : null, seats.bookmarks)}
  </div>
}
function allIds(nodes: Bookmark[]): string[] { return nodes.flatMap(n => [n.id, ...allIds(n.children ?? [])]) }
function ImportBookmarks() {
  const [root, setRoot] = useState('')
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([])
  const [profile, setProfile] = useState('')
  const [tree, setTree] = useState<Bookmark[]>([])
  const [selected, setSelected] = useState(new Set<string>())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  useEffect(() => () => { generation.current++ }, [])
  const load = async (readProfile?: string) => {
    const version = ++generation.current
    setBusy(true); setMessage(''); setTree([]); setSelected(new Set())
    try {
      const result = await requestChrome(root, readProfile)
      if (version !== generation.current) return
      if ('bookmarks' in result) { setTree(result.bookmarks); setSelected(new Set(result.bookmarks.flatMap(n => allIds(n.children ?? [])).filter(id => id))) }
      else { setProfiles(result.profiles); setProfile(result.profiles[0]?.id ?? ''); if (readProfile) setMessage('') }
    } catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : String(error)) } finally { if (version === generation.current) setBusy(false) }
  }
  const render = (nodes: Bookmark[], parent = ''): ReactNode => <ul>{nodes.map(n => <li key={n.id}><label><input type="checkbox" checked={selected.has(n.id)} onChange={e => { const next = new Set(selected); e.target.checked ? next.add(n.id) : next.delete(n.id); setSelected(next) }} />{n.children ? <strong>{n.name || '未命名文件夹'}</strong> : n.name}</label>{n.children && <div>{render(n.children, `${parent}${n.id}/`)}</div>}</li>)}</ul>
  return <section className={css.operation}><h2>导入 Chrome 书签</h2><p>读取运行 DSH 的这台电脑上的 Chrome 书签，保留目录层级与顺序。也可指定 Bookmarks 文件。</p>
    <form onSubmit={e => { e.preventDefault(); void load() }}><label>Chrome 数据目录或 Bookmarks 文件<input value={root} onChange={e => { setRoot(e.target.value); setProfiles([]); setTree([]) }} placeholder="留空自动发现" /></label><button disabled={busy}>查找书签</button></form>
    {profiles.length > 0 && <div><label>Chrome 用户配置<select value={profile} onChange={e => { setProfile(e.target.value); setTree([]) }}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}（{p.id}）</option>)}</select></label><button disabled={busy || !profile} onClick={() => { void load(profile) }}>预览书签</button></div>}
    {tree.length > 0 && <><div><button onClick={() => setSelected(new Set(allIds(tree)))}>全选</button><button onClick={() => setSelected(new Set())}>取消全选</button></div>{render(tree)}<button disabled={selected.size === 0 || busy} onClick={() => { browserState.importBookmarks(selectedBookmarks(tree, selected)); setMessage('已导入到书签栏，同一目录内的重复书签已跳过') }}>导入所选书签</button></>}
    {message && <p role="status">{message}</p>}
  </section>
}
/** Chrome-style manager: folder tree on the left, list on the right, search filter, edit dialog. */
type ManagerFolder = { id: string; name: string; children: Bookmark[] }
function managerFolders(nodes: Bookmark[], name = ''): ManagerFolder[] {
  const self: ManagerFolder = { id: '', name: name || '书签栏', children: nodes }
  const childFolders = nodes.flatMap(n => n.children ? managerFolders(n.children, n.name) : [])
  return [self, ...childFolders]
}
function matches(node: Bookmark, query: string): boolean {
  if (!query) return true
  return node.name.toLowerCase().includes(query) || (node.url ?? '').toLowerCase().includes(query)
}
/** Search hits from anywhere in the tree, flattened with their containing folder ids. */
function searchHits(nodes: Bookmark[], query: string, parent = ''): { node: Bookmark; parent: string }[] {
  return nodes.flatMap(n => {
    const hit = matches(n, query) ? [{ node: n, parent }] : []
    return n.children ? [...hit, ...searchHits(n.children, query, n.id)] : hit
  })
}
function BookmarkManager({ draft }: { draft?: { name: string; url: string } }) {
  const snapshot = useBrowser()
  const [folder, setFolder] = useState('') // selected folder id; '' = 书签栏
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ node?: Bookmark; parent: string; folder: boolean }>()
  const [message, setMessage] = useState('')
  const allFolders = useMemo(() => managerFolders(snapshot.bookmarks), [snapshot.bookmarks])
  useEffect(() => { if (draft) setEditing({ parent: '', folder: false }) }, [draft])
  const openEdit = (node: Bookmark | undefined, parent: string, isFolder = false) => { setMessage(''); setEditing({ node, parent, folder: isFolder }) }
  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    const data = new FormData(form)
    const name = String(data.get('name') ?? '')
    const url = String(data.get('url') ?? '')
    const isFolder = editing?.folder || !!editing?.node?.children
    try {
      browserState.saveBookmark({ id: editing?.node?.id, name, ...(isFolder ? { children: editing?.node?.children ?? [] } : { url }) }, editing?.parent ?? '')
      setEditing(undefined); setMessage('已保存')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const current = allFolders.find(f => f.id === folder) ?? allFolders[0]!
  // Search flattens the whole tree to matching rows (Chrome-style); browsing lists the selected folder's direct children.
  const items = query ? searchHits(snapshot.bookmarks, query.toLowerCase()) : current.children.map(node => ({ node, parent: folder }))
  const rows = (list: { node: Bookmark; parent: string }[]): ReactNode => <ul role="list">{list.map(({ node: n, parent }) => <li key={n.id} role="listitem">
    <button aria-expanded={false} className={n.children ? css.folderRow : ''} onClick={() => n.children && setFolder(n.id)}>{n.children ? '▸ ' : ''}{n.name}{n.url ? <span className={css.urlPreview}> {n.url}</span> : null}</button>
    <button aria-label={`编辑 ${n.name}`} onClick={() => openEdit(n, parent)}>编辑</button>
    <button aria-label={`删除 ${n.name}`} onClick={() => { browserState.removeBookmark(n.id); setMessage('已删除') }}>删除</button>
  </li>)}</ul>
  return <section className={css.operation} aria-label="管理书签面板"><h2>管理书签</h2>
    <div className={css.managerToolbar}>
      <input aria-label="搜索书签" placeholder="搜索书签" value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={() => openEdit(undefined, folder)}>新建书签</button>
      <button onClick={() => openEdit(undefined, folder, true)}>新建文件夹</button>
      <button onClick={() => { setQuery('') }}>清空搜索</button>
    </div>
    <div className={css.managerLayout}>
      <nav aria-label="文件夹树"><ul>{allFolders.map((f, i) => <li key={f.id || `root-${i}`}><button aria-current={f.id === folder ? 'true' : undefined} onClick={() => setFolder(f.id)}>{f.id === folder ? '▸ ' : ''}{f.name}</button></li>)}</ul></nav>
      <div aria-label="书签列表">{items.length ? rows(items) : <p>此目录暂无书签</p>}</div>
    </div>
    {editing && <div role="dialog" aria-label={editing.node ? '编辑书签' : '新建书签'} className={css.dialog}><form onSubmit={save}>
      <label>名称<input name="name" aria-label="名称" defaultValue={editing.node?.name ?? draft?.name ?? ''} required /></label>
      <label>网址<input name="url" aria-label="网址" defaultValue={editing.node?.url ?? (editing.folder ? '' : draft?.url ?? '')} placeholder="https://" /></label>
      <label>位置<select name="parent" aria-label="位置" defaultValue={editing.parent}><option value="">书签栏</option>{allFolders.filter(f => f.id).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
      <button>保存</button><button type="button" onClick={() => setEditing(undefined)}>取消</button>
    </form>{message && <p role="status">{message}</p>}</div>}
    {!editing && message && <p role="status">{message}</p>}
  </section>
}
export function BrowserWorkspace({ renderPage }: { renderPage: (page: Page, visible: boolean) => ReactNode }) {
  const snapshot = useBrowser()
  const [menu, setMenu] = useState(false)
  const [draft, setDraft] = useState<{ name: string; url: string }>()
  useEffect(() => {
    const add = (e: Event) => { setDraft((e as CustomEvent).detail); browserState.open('bookmarks') }
    const dismiss = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    window.addEventListener('chat-power:add-bookmark', add); window.addEventListener('keydown', dismiss)
    return () => { window.removeEventListener('chat-power:add-bookmark', add); window.removeEventListener('keydown', dismiss) }
  }, [])
  return <div className={css.workspace}>
    {menu && <><button className={css.dismiss} aria-label="关闭浏览器菜单" onClick={() => setMenu(false)} /><div className={css.menu} role="menu" aria-label="浏览器设置">{[
      ['新建网页', () => browserState.open()],
      [snapshot.showBookmarks ? '隐藏书签栏' : '显示书签栏', () => browserState.toggleBookmarks()],
      ['导入 Chrome 书签', () => browserState.open('import')],
      ['管理书签', () => { setDraft(undefined); browserState.open('bookmarks') }],
    ].map(([label, action]) => <button key={label as string} role="menuitem" onClick={() => { (action as () => void)(); setMenu(false) }}>{label as string}</button>)}</div></>}
    <div className={css.tabsRow}><div className={css.tabs} role="tablist" aria-label="网页标签">{snapshot.pages.map(p => <span key={p.id} className={css.tab} data-active={snapshot.active === p.id}><button role="tab" aria-selected={snapshot.active === p.id} aria-controls={`browser-panel-${p.id}`} title={p.title} onClick={() => browserState.select(p.id)}>{p.title}</button><button aria-label={`关闭 ${p.title}`} onClick={() => browserState.close(p.id)}>×</button></span>)}
<button aria-label="新建网页" onClick={() => browserState.open()}>＋</button></div><button className={css.menuButton} aria-label="浏览器设置" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>⋯</button></div>
    {snapshot.pages.length === 0 && <div className={css.empty}><p>打开网页，或从 Chrome 导入书签</p><button onClick={() => browserState.open()}>新建网页</button><button onClick={() => browserState.open('import')}>导入 Chrome 书签</button></div>}
    {snapshot.pages.map(p => <div id={`browser-panel-${p.id}`} role="tabpanel" key={p.id} hidden={snapshot.active !== p.id} className={css.page}>{p.type === 'import' ? <ImportBookmarks /> : p.type === 'bookmarks' ? <BookmarkManager draft={draft} /> : renderPage(p, snapshot.active === p.id)}</div>)}
  </div>
}
