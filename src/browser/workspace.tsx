import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { browserState, type Bookmark, type Page } from './state.ts'
import css from './workspace.module.css'
import { requestChrome } from './chrome-request.ts'
const useBrowser = () => useSyncExternalStore(browserState.subscribe, browserState.get, browserState.get)
function BookmarkItems({ nodes, onOpen }: { nodes: Bookmark[]; onOpen: (url: string) => void }) {
  return <>{nodes.map(n => n.children ? <details key={n.id} className={css.folder}><summary>{n.name || '未命名文件夹'}</summary><div><BookmarkItems nodes={n.children} onOpen={onOpen} />{n.children.length === 0 && <span>空文件夹</span>}</div></details> : <span key={n.id} className={css.bookmark}><button title={n.url} onClick={event => { if (n.url) { if (event.metaKey || event.ctrlKey) browserState.open('page', n.url); else onOpen(n.url) } }}>{n.name || n.url}</button></span>)}</>
}
/** Keep folder popovers outside the measured row so they never increase its height. */
export function BookmarkBar({ nodes, onOpen }: { nodes: Bookmark[]; onOpen: (url: string) => void }) {
  const root = useRef<HTMLDivElement>(null)
  const measureRow = useRef<HTMLDivElement>(null)
  const more = useRef<HTMLDetailsElement>(null)
  const [count, setCount] = useState(0)
  useLayoutEffect(() => {
    const bar = root.current, row = measureRow.current
    if (!bar || !row) return
    const measure = () => {
      const widths = Array.from(row.children, child => child.getBoundingClientRect().width)
      const available = bar.clientWidth
      const total = widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * 6
      if (total <= available) { setCount(nodes.length); return }
      let used = 0, visible = 0
      for (const width of widths) {
        const next = used + (visible ? 6 : 0) + width
        if (next > Math.max(0, available - 66)) break
        used = next; visible++
      }
      setCount(visible)
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : undefined
    observer?.observe(bar)
    for (const child of row.children) observer?.observe(child)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [nodes])
  useEffect(() => {
    const dismiss = (event: PointerEvent) => { if (more.current && !more.current.contains(event.target as Node)) more.current.open = false }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [])
  return <div ref={root} className={css.bookmarkRow} aria-label="书签栏">
    <div ref={measureRow} className={css.bookmarkMeasure} aria-hidden="true"><BookmarkItems nodes={nodes} onOpen={() => {}} /></div>
    <BookmarkItems nodes={nodes.slice(0, count)} onOpen={onOpen} />
    {count < nodes.length && <details ref={more} className={`${css.folder} ${css.bookmarkMore}`} onKeyDown={event => { if (event.key === 'Escape' && more.current) { more.current.open = false; more.current.querySelector('summary')?.focus() } }}>
      <summary aria-label="更多书签">更多</summary>
      <div onClick={event => { if ((event.target as HTMLElement).closest('button') && more.current) more.current.open = false }}><BookmarkItems nodes={nodes.slice(count)} onOpen={onOpen} /></div>
    </details>}
  </div>
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
    {seats && createPortal(snapshot.bookmarks.length ? <BookmarkBar nodes={snapshot.bookmarks} onOpen={url => hostProps.loadUrl(tab.id, url)} /> : null, seats.bookmarks)}
  </div>
}
function SyncBookmarks() {
  const snapshot = useBrowser()
  const last = snapshot.chromeSync
  const [root, setRoot] = useState(last?.root ?? '')
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([])
  const [profile, setProfile] = useState(last?.profile ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const generation = useRef(0)
  const inFlight = useRef(false)
  useEffect(() => () => { generation.current++ }, [])
  const sync = async () => {
    if (inFlight.current) return
    inFlight.current = true
    const version = ++generation.current
    setBusy(true); setMessage('')
    try {
      let resolvedRoot = root, chosen = profile
      let result = await requestChrome(root, profile || undefined)
      if (version !== generation.current) return
      if ('profiles' in result) {
        setProfiles(result.profiles)
        chosen = result.profiles.find(p => p.id === 'Default')?.id ?? result.profiles[0]?.id ?? ''
        if (!chosen) throw new Error('未找到 Chrome 书签，请检查 Chrome 数据目录')
        resolvedRoot = result.root
        setRoot(resolvedRoot); setProfile(chosen)
        result = await requestChrome(resolvedRoot, chosen)
      }
      if (version !== generation.current) return
      if (!('bookmarks' in result)) throw new Error('Chrome 未返回书签数据')
      browserState.syncBookmarks(result.bookmarks, result.source ?? JSON.stringify([resolvedRoot, chosen]), resolvedRoot, chosen)
      setMessage('同步完成，已更新 Chrome 书签并保留本地额外项目')
    } catch (error) { if (version === generation.current) setMessage(error instanceof Error ? error.message : String(error)) }
    finally { inFlight.current = false; if (version === generation.current) setBusy(false) }
  }
  const render = (nodes: Bookmark[]): ReactNode => <ul>{nodes.map(n => <li key={n.id}>{n.children ? <details><summary>{n.name}</summary>{render(n.children)}</details> : <span>{n.name}<small>{n.url}</small></span>}</li>)}</ul>
  return <section className={css.operation} aria-label="同步书签面板"><h2>同步书签</h2>
    <p>从 Chrome 单向同步到本浏览器。同一书签以 Chrome 的名称、网址和目录位置为准，本地额外的书签和目录保留。</p>
    <p>同步来源：运行 DSH 的电脑上的 Chrome{profile ? ` · ${profile}` : ''}</p>
    <p>上次同步时间：{last ? <time dateTime={last.at}>{new Date(last.at).toLocaleString()}</time> : '尚未同步'}</p>
    {last && <p>上次同步数据：{last.links} 个书签、{last.folders} 个目录；新增 {last.added} 项，内容更新 {last.updated} 项，保留本地额外项目 {last.retained} 项。</p>}
    <button disabled={busy} onClick={() => { sync().catch(error => console.warn('[chat-power] bookmark sync failed', error)) }}>{busy ? '同步中…' : '立即同步'}</button>
    <details className={css.syncSettings}><summary>Chrome 同步设置</summary>
      <label>Chrome 数据目录或 Bookmarks 文件<input disabled={busy} value={root} onChange={e => { setRoot(e.target.value); setProfile(''); setProfiles([]) }} placeholder="留空自动发现" /></label>
      <label>Chrome 用户配置<select disabled={busy} value={profile} onChange={e => setProfile(e.target.value)}><option value="">自动选择默认配置</option>{(profiles.length ? profiles : profile ? [{ id: profile, name: profile }] : []).map(p => <option key={p.id} value={p.id}>{p.name}（{p.id}）</option>)}</select></label>
    </details>
    {message && <p role="status">{message}</p>}
    {last && <details className={css.syncData}><summary>查看上次同步的数据</summary>{last.data.length ? render(last.data) : <p>Chrome 中没有可同步的 HTTP/HTTPS 书签，本地书签已保留。</p>}</details>}
  </section>
}
/** Chrome-style manager: folder tree on the left, list on the right, search filter, edit dialog. */
type ManagerFolder = { id: string; name: string; children: Bookmark[] }
function managerFolders(nodes: Bookmark[], name = '', id = ''): ManagerFolder[] {
  const self: ManagerFolder = { id, name: name || '书签栏', children: nodes }
  const childFolders = nodes.flatMap(n => n.children ? managerFolders(n.children, n.name, n.id) : [])
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
  const [expanded, setExpanded] = useState(() => new Set(['']))
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
      browserState.saveBookmark({ id: editing?.node?.id, name, ...(isFolder ? { children: editing?.node?.children ?? [] } : { url }) }, String(data.get('parent') ?? ''))
      setEditing(undefined); setMessage('已保存')
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }
  const current = allFolders.find(f => f.id === folder) ?? allFolders[0]!
  useEffect(() => { if (current.id !== folder) setFolder(current.id) }, [current.id, folder])
  const selectFolder = (id: string) => {
    setFolder(id); setQuery('')
    setExpanded(previous => {
      const next = new Set(previous)
      const reveal = (nodes: Bookmark[], ancestors: string[]): boolean => nodes.some(node => {
        if (node.id === id) { for (const key of [...ancestors, id]) next.add(key); return true }
        return node.children ? reveal(node.children, [...ancestors, node.id]) : false
      })
      next.add(''); reveal(snapshot.bookmarks, [''])
      return next
    })
  }
  const tree = (entry: ManagerFolder): ReactNode => {
    const children = entry.children.filter(n => n.children)
    const open = expanded.has(entry.id)
    return <li key={entry.id} role="treeitem" aria-label={entry.name} aria-selected={current.id === entry.id} aria-expanded={children.length ? open : undefined}>
      <div className={css.treeRow}>
        {children.length ? <button className={css.treeToggle} aria-label={`${open ? '折叠' : '展开'} ${entry.name}`} onClick={() => setExpanded(previous => { const next = new Set(previous); if (open) next.delete(entry.id); else next.add(entry.id); return next })}>{open ? '−' : '+'}</button> : <span className={css.treeSpacer} />}
        <button className={css.treeName} aria-current={current.id === entry.id ? 'true' : undefined} title={entry.name} onClick={() => selectFolder(entry.id)}>{entry.name}</button>
      </div>
      {open && children.length > 0 && <ul role="group">{children.map(child => tree({ id: child.id, name: child.name, children: child.children! }))}</ul>}
    </li>
  }
  const items = query ? searchHits(snapshot.bookmarks, query.toLowerCase()) : current.children.map(node => ({ node, parent: current.id }))
  const rows = (list: { node: Bookmark; parent: string }[]): ReactNode => <ul role="list">{list.map(({ node: n, parent }) => <li key={n.id} role="listitem">
    <button className={`${css.bookmarkRowLabel} ${n.children ? css.folderRow : ''}`} onClick={() => n.children ? selectFolder(n.id) : n.url && browserState.open('page', n.url)}>{n.name}{n.url ? <span className={css.urlPreview}>{n.url}</span> : null}</button>
    <span className={css.rowActions}>
      <button aria-label={`编辑 ${n.name}`} title="编辑" onClick={() => openEdit(n, parent)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z" /></svg></button>
      <button aria-label={`删除 ${n.name}`} title="删除" onClick={() => { browserState.removeBookmark(n.id); setMessage('已删除') }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button>
    </span>
  </li>)}</ul>
  return <section className={css.operation} aria-label="管理书签面板"><h2>管理书签</h2>
    <div className={css.managerToolbar}>
      <input aria-label="搜索书签" placeholder="搜索书签" value={query} onChange={e => setQuery(e.target.value)} />
      <button onClick={() => openEdit(undefined, folder)}>新建书签</button>
      <button onClick={() => openEdit(undefined, folder, true)}>新建文件夹</button>
      <button onClick={() => { setQuery('') }}>清空搜索</button>
    </div>
    <div className={css.managerLayout}>
      <nav aria-label="文件夹树"><ul role="tree" aria-label="书签目录">{tree(allFolders[0]!)}</ul></nav>
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
      ['同步书签', () => browserState.open('import')],
      ['管理书签', () => { setDraft(undefined); browserState.open('bookmarks') }],
    ].map(([label, action]) => <button key={label as string} role="menuitem" onClick={() => { (action as () => void)(); setMenu(false) }}>{label as string}</button>)}</div></>}
    <div className={css.tabsRow}><div className={css.tabs} role="tablist" aria-label="网页标签">{snapshot.pages.map(p => <span key={p.id} className={css.tab} data-active={snapshot.active === p.id}><button role="tab" aria-selected={snapshot.active === p.id} aria-controls={`browser-panel-${p.id}`} title={p.title} onClick={() => browserState.select(p.id)}>{p.title}</button><button aria-label={`关闭 ${p.title}`} onClick={() => browserState.close(p.id)}>×</button></span>)}
<button aria-label="新建网页" onClick={() => browserState.open()}>＋</button></div><button className={css.menuButton} aria-label="浏览器设置" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>⋯</button></div>
    {snapshot.pages.length === 0 && <div className={css.empty}><p>打开网页，或从 Chrome 同步书签</p><button onClick={() => browserState.open()}>新建网页</button><button onClick={() => browserState.open('import')}>同步书签</button></div>}
    {snapshot.pages.map(p => <div id={`browser-panel-${p.id}`} role="tabpanel" key={p.id} hidden={snapshot.active !== p.id} className={css.page}>{p.type === 'import' ? <SyncBookmarks /> : p.type === 'bookmarks' ? <BookmarkManager draft={draft} /> : renderPage(p, snapshot.active === p.id)}</div>)}
  </div>
}
