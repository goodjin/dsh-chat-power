import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { browserState, folders, selectedBookmarks, type Bookmark, type Page } from './state.ts'
import css from './workspace.module.css'
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
async function requestChrome(root?: string, profile?: string) {
  const response = await fetch('/chat-power/chrome-bookmarks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ root: root || undefined, profile }) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || `读取失败（${response.status}）`)
  return result
}
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
      if (result.bookmarks) { setTree(result.bookmarks); setSelected(new Set(allIds(result.bookmarks))) }
      else { setRoot(result.root); setProfiles(result.profiles); setProfile(result.profiles[0]?.id ?? ''); if (!result.profiles.length) setMessage('此目录未发现 Chrome 书签，也可直接选择 Bookmarks 文件') }
    } catch (error) { if (version === generation.current) setMessage(String(error)) }
    finally { if (version === generation.current) setBusy(false) }
  }
  const toggle = (node: Bookmark, checked: boolean) => {
    const next = new Set(selected)
    for (const id of allIds([node])) { if (checked) next.add(id); else next.delete(id) }
    setSelected(next)
  }
  const render = (nodes: Bookmark[]): ReactNode => <ul>{nodes.map(n => <li key={n.id}><label><input type="checkbox" checked={n.children ? allIds([n]).every(id => selected.has(id)) : selected.has(n.id)} onChange={e => toggle(n, e.target.checked)} />{n.name || '未命名'}</label>{n.children ? render(n.children) : <small>{n.url}</small>}</li>)}</ul>
  return <section className={css.operation}><h2>导入 Chrome 书签</h2><p>读取运行 DSH 的这台电脑上的 Chrome 书签，保留目录层级与顺序。也可指定 Bookmarks 文件。</p>
    <form onSubmit={e => { e.preventDefault(); void load() }}><label>Chrome 数据目录或 Bookmarks 文件<input value={root} onChange={e => { setRoot(e.target.value); setProfiles([]); setTree([]) }} placeholder="留空自动发现" /></label><button disabled={busy}>查找书签</button></form>
    {profiles.length > 0 && <div><label>Chrome 用户配置<select value={profile} onChange={e => { setProfile(e.target.value); setTree([]) }}>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}（{p.id}）</option>)}</select></label><button disabled={busy || !profile} onClick={() => { void load(profile) }}>预览书签</button></div>}
    {busy && <p role="status">正在读取…</p>}{message && <p role="status">{message}</p>}
    {tree.length > 0 && <><div><button onClick={() => setSelected(new Set(allIds(tree)))}>全选</button><button onClick={() => setSelected(new Set())}>取消全选</button></div>{render(tree)}<button disabled={selected.size === 0 || busy} onClick={() => { browserState.importBookmarks(selectedBookmarks(tree, selected)); setMessage('已导入到“从 Chrome 导入”，同一目录内的重复书签已跳过') }}>导入所选书签</button></>}
  </section>
}
function BookmarkManager({ draft }: { draft?: { name: string; url: string } }) {
  const snapshot = useBrowser()
  const [editing, setEditing] = useState<Bookmark>()
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [folder, setFolder] = useState(false)
  const [parent, setParent] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { if (draft) { setEditing(undefined); setFolder(false); setName(draft.name); setUrl(draft.url) } }, [draft])
  const render = (nodes: Bookmark[], parentId = ''): ReactNode => <ul>{nodes.map(n => <li key={n.id}><span>{n.children ? '▸ ' : ''}{n.name}</span> <button onClick={() => { setEditing(n); setName(n.name); setUrl(n.url ?? ''); setFolder(!!n.children); setParent(parentId); setMessage('') }}>编辑 / 移动</button><button onClick={() => browserState.removeBookmark(n.id)}>删除</button>{n.url && <button onClick={() => browserState.open('page', n.url)}>打开</button>}{n.children && render(n.children, n.id)}</li>)}</ul>
  return <section className={css.operation}><h2>管理书签</h2><form onSubmit={e => {
    e.preventDefault()
    try { browserState.saveBookmark({ id: editing?.id, name, ...(folder ? { children: editing?.children ?? [] } : { url }) }, parent); setName(''); setUrl(''); setEditing(undefined); setMessage('已保存') } catch (error) { setMessage(String(error)) }
  }}><label>名称<input value={name} onChange={e => setName(e.target.value)} required /></label><label><input type="checkbox" checked={folder} disabled={!!editing} onChange={e => setFolder(e.target.checked)} />文件夹</label>{!folder && <label>网址<input value={url} onChange={e => setUrl(e.target.value)} required placeholder="https://" /></label>}
    <label>位置<select value={parent} onChange={e => setParent(e.target.value)}><option value="">书签栏</option>{folders(snapshot.bookmarks).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label><button>{editing ? '保存修改' : '添加'}</button><button type="button" onClick={() => { setEditing(undefined); setName(''); setUrl(''); setFolder(false); setParent('') }}>新建书签 / 文件夹</button></form>{message && <p role="status">{message}</p>}{render(snapshot.bookmarks)}</section>
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
    <div className={css.tabsRow}><div className={css.tabs} role="tablist" aria-label="网页标签">{snapshot.pages.map(p => <span key={p.id} className={css.tab} data-active={snapshot.active === p.id}><button role="tab" aria-selected={snapshot.active === p.id} aria-controls={`browser-panel-${p.id}`} title={p.title} onClick={() => browserState.select(p.id)}>{p.title}</button><button aria-label={`关闭 ${p.title}`} onClick={() => browserState.close(p.id)}>×</button></span>)}<button aria-label="新建网页" onClick={() => browserState.open()}>＋</button></div><button className={css.menuButton} aria-label="浏览器设置" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(v => !v)}>⋯</button></div>
    {snapshot.pages.length === 0 && <div className={css.empty}><p>打开网页，或从 Chrome 导入书签</p><button onClick={() => browserState.open()}>新建网页</button><button onClick={() => browserState.open('import')}>导入 Chrome 书签</button></div>}
    {snapshot.pages.map(p => <div id={`browser-panel-${p.id}`} role="tabpanel" key={p.id} hidden={snapshot.active !== p.id} className={css.page}>{p.type === 'import' ? <ImportBookmarks /> : p.type === 'bookmarks' ? <BookmarkManager draft={draft} /> : renderPage(p, snapshot.active === p.id)}</div>)}
  </div>
}
