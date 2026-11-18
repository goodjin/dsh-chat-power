/**
 * 工作区文件树（懒加载版）。
 *
 * 宿主那棵树一次把一个目录的全部条目画出来（上限两千条），工作区一大就卡；
 * 加上每行一次 stat 请求（查文件大小），一次打开能发出上千个请求。
 *
 * 这棵树改成：**一次只展示当前目录的直接子项**；点开文件夹才加载下一层；
 * 每层最多显示 {@link FILE_PAGE_SIZE} 条，剩下的用「加载更多」继续显示。
 * 文件大小随目录列表一起回来（`list` 的结果带 `size`），不再逐个 stat。
 */
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import styles from './file-tree-lazy.module.css'
import { watchDirectory } from './file-tree-watch.ts'
import { fileIconKind, fileIconPath } from './file-tree-icons.ts'
import { ancestorsOf, isCurrentRow, rootPathView } from './file-tree-view.ts'
import { handleTreeKey, visibleRows } from './file-tree-keyboard.ts'
import type { WorkspaceFileTarget } from './file-tree-menu.ts'

/** 每层最多显示多少条（超出部分用「加载更多」继续）。 */
export const FILE_PAGE_SIZE = 100

/** remote 拿不到 `workspaceFiles.list` 时的提示。 */
const REMOTE_MISSING_ERROR = '无法读取工作区文件列表'
/** 列目录调用抛错时的提示。 */
const LIST_ERROR = '读取目录失败'

/** 目录里的一个条目。 */
export interface FileEntry {
  /** 条目名（目录里的一级名字）。 */
  readonly name: string
  /** 条目类型。 */
  readonly type: 'file' | 'directory' | 'other'
  /** 文件大小（字节）；目录没有。 */
  readonly size?: number
}

/** 一个目录的列表结果。 */
export interface DirectoryListing {
  /** 直接子项。 */
  readonly entries: readonly FileEntry[]
  /** 宿主是否因为上限截断了（还有更多没给）。 */
  readonly truncated: boolean
  /**
   * 取列表失败时的提示。成功（含空目录）为 undefined——空目录是有内容的正常
   * 结果，失败才是异常，两者都不能都退化成「空白」。
   */
  readonly error?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 从远程调用的返回值里取出目录列表。
 *
 * 远程方法返回信封：`{ ok: true, value }` 或 `{ ok: false, error }`。
 *
 * @param value - 远程调用的返回值。
 * @returns 目录列表；形状不对时给空列表，`ok:false` 信封带上 error 提示。
 */
export function parseListing(value: unknown): DirectoryListing {
  if (!isRecord(value)) return { entries: [], truncated: false }
  // 失败信封：明确报错，不再让调用方把它当成「空目录」静默渲染成空白。
  if (value.ok === false) {
    const error = value.error
    const message = isRecord(error) && typeof error.message === 'string' ? error.message : undefined
    return { entries: [], truncated: false, error: message ?? '读取目录失败' }
  }
  if (value.ok !== true || !isRecord(value.value)) return { entries: [], truncated: false }
  const payload = value.value
  const raw = Array.isArray(payload.entries)
    ? payload.entries
    : Array.isArray(payload.items) ? payload.items : []
  const entries: FileEntry[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const name = typeof item.name === 'string' ? item.name : ''
    if (name === '') continue
    const type = item.type === 'directory' ? 'directory' : item.type === 'other' ? 'other' : 'file'
    const size = typeof item.size === 'number' ? item.size : undefined
    entries.push(size === undefined ? { name, type } : { name, type, size })
  }
  return { entries, truncated: payload.truncated === true }
}

/**
 * 目录在前、其余按名字排（与官方一致）。
 *
 * @param entries - 目录里的条目。
 * @returns 排好序的条目。
 */
export function sortEntries(entries: readonly FileEntry[]): FileEntry[] {
  return [...entries].sort((left, right) => {
    const group = Number(right.type === 'directory') - Number(left.type === 'directory')
    if (group !== 0) return group
    return left.name.localeCompare(right.name)
  })
}

/** 一个目录的状态。 */
export interface LevelState {
  /** 已取到的全部条目。 */
  readonly entries: readonly FileEntry[]
  /** 已经显示了多少条。 */
  readonly shown: number
  /** 取列表中。 */
  readonly loading: boolean
  /** 取列表失败时的提示。 */
  readonly error?: string
}

/**
 * 列目录成功后的显示条数。
 *
 * 载入态先把 `shown` 写成 0（此刻条目还没回来），完成时必须回到一整页——否则
 * `0 ?? PAGE_SIZE` 里 0 不是 nullish，首屏会一直停在 0 条、整棵树空白（2026-11-08
 * 现场）。已经「加载更多」过的进度（>0）则保留，不被一次刷新打回。
 */
export function shownAfterLoad(prevShown: number | undefined, pageSize: number): number {
  return prevShown !== undefined && prevShown > 0 ? prevShown : pageSize
}

/** 一份目录状态：取列表失败（remote 缺失 / 调用抛错 / 失败信封）时的明确反馈。 */
export function failedLevel(message: string): LevelState {
  return { entries: [], shown: 0, loading: false, error: message }
}

/**
 * 列目录成功（或收到失败信封）后的目录状态。
 *
 * @param prevShown - 载入态记下的显示进度（首次为 0）。
 * @param value - 远程调用的返回值（信封）。
 * @param pageSize - 每层每页条数。
 */
export function applyListing(prevShown: number | undefined, value: unknown, pageSize: number): LevelState {
  const listing = parseListing(value)
  if (listing.error !== undefined) return failedLevel(listing.error)
  return {
    entries: sortEntries(listing.entries),
    shown: shownAfterLoad(prevShown, pageSize),
    loading: false,
  }
}

/** 一个目录此刻该怎么呈现。 */
export type LevelView =
  | { kind: 'pending' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty' }
  | { kind: 'items' }

/**
 * 把一个目录状态归类成呈现方式：未同步 / 载入中 / 失败 / 空目录 / 有条目。
 *
 * 空目录与失败都要显式呈现——过去两者都退化成「一条都不画的空白」，用户分不清
 * 是目录真为空还是读失败了。
 */
export function levelView(level: LevelState | undefined): LevelView {
  if (level === undefined) return { kind: 'pending' }
  if (level.error !== undefined) return { kind: 'error', message: level.error }
  if (level.loading && level.entries.length === 0) return { kind: 'loading' }
  if (level.entries.length === 0) return { kind: 'empty' }
  return { kind: 'items' }
}

/** 远程列目录的最小面（真实远程对象满足它，测试里的假对象也满足）。 */
export interface ListingRemote {
  /** 列目录：返回 `{ ok: true, value }` 形状的信封。 */
  list(sessionId: string, path: string, signal?: AbortSignal): Promise<unknown>
}

/** 树需要的最小面。 */
export interface TreeRemote {
  /** 远程服务（取 workspaceFiles）。 */
  readonly remote: () => unknown
}

function listingRemote(remote: () => unknown): ListingRemote | undefined {
  const holder = remote()
  const files = isRecord(holder) ? holder.workspaceFiles : undefined
  if (!isRecord(files) || typeof files.list !== 'function') return undefined
  return { list: files.list.bind(files) as ListingRemote['list'] }
}

/**
 * 把路径里的引号转义掉，好放进属性选择器里。
 *
 * @param value - 路径。
 * @returns 转义后的字符串。
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

export function LazyFileTree(props: {
  /** 会话 ID（远程调用要带）。 */
  readonly sessionId: string
  /** 远程服务。 */
  readonly remote: () => unknown
  /** 文案。 */
  readonly t: (key: string, vars?: Record<string, string | number>) => string
  /** 点文件：交给上层打开。 */
  readonly onOpenFile?: (path: string) => void
  /** 当前打开/编辑中的文件（工作区相对路径）：这一行会高亮。 */
  readonly currentPath?: string
  /** 根路径显示（会话工作目录）。 */
  readonly rootPath?: string
  /** 重新读取整棵树。 */
  readonly onRefresh?: () => void
  /** 右键菜单：打开菜单（目标是这一行）。 */
  readonly onContextMenu?: (target: WorkspaceFileTarget, point: { x: number; y: number }) => void
}): ReactNode {
  const [levels, setLevels] = useState<Record<string, LevelState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [focusedPath, setFocusedPath] = useState<string | undefined>(undefined)

  // 取远程对象的函数每次渲染都是新的（父组件传的内联箭头），不能进依赖——
  // 否则 load 每次渲染都重建、首屏加载的 effect 反复触发、监听被反复重建。
  // remoteRef 保持最新引用，依赖里只放稳定的东西。
  const remoteRef = useRef(props.remote)
  remoteRef.current = props.remote

  const load = useCallback((path: string): void => {
    const api = listingRemote(() => remoteRef.current())
    if (api === undefined) {
      // remote 缺失（能力没接上 / 换了连接）：明确报错，不再静默 return 成空白。
      setLevels(prev => ({ ...prev, [path]: failedLevel(REMOTE_MISSING_ERROR) }))
      return
    }
    setLevels(prev => ({ ...prev, [path]: { entries: prev[path]?.entries ?? [], shown: prev[path]?.shown ?? 0, loading: true } }))
    // 根目录用「.」表示：宿主拒绝空路径（直接报 path is required）。
    void api.list(props.sessionId, path === '' ? '.' : path).then((value) => {
      setLevels(prev => ({ ...prev, [path]: applyListing(prev[path]?.shown, value, FILE_PAGE_SIZE) }))
    }).catch(() => {
      setLevels(prev => ({ ...prev, [path]: failedLevel(LIST_ERROR) }))
    })
  }, [props.sessionId])

  useEffect(() => {
    load('')
  }, [load])

  // 自动刷新：展开着的目录挂上变更监听，文件一变就重读那一层。
  // 折叠的目录不监听（没人看）；根目录永远展开，所以永远在监听。
  const watched = useMemo(() => {
    const paths = Object.keys(expanded).filter(path => expanded[path] === true)
    paths.push('')
    return paths.sort()
  }, [expanded])
  const watchKey = watched.join('|')
  useEffect(() => {
    const controller = new AbortController()
    // 每个目录一个监听：目录多时并发订阅，但每个都是独立的取消信号。
    for (const path of watched) {
      void watchDirectory({
        host: remoteRef.current(),
        sessionId: props.sessionId,
        path,
        signal: controller.signal,
        onChange: () => { load(path) },
      })
    }
    return () => { controller.abort() }
    // watchKey 是展开集合的稳定表示：watched 每次渲染都是新数组，不能进依赖。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchKey, load, props.sessionId])

  const toggle = (path: string): void => {
    const open = expanded[path] === true
    setExpanded(prev => ({ ...prev, [path]: !open }))
    if (!open && levels[path] === undefined) load(path)
  }

  const more = (path: string): void => {
    setLevels(prev => {
      const level = prev[path]
      if (level === undefined) return prev
      return { ...prev, [path]: { ...level, shown: level.shown + FILE_PAGE_SIZE } }
    })
  }

  // 当前文件的祖先目录自动展开：打开的文件在树里要看得见。
  const currentPath = props.currentPath
  useEffect(() => {
    const ancestors = ancestorsOf(currentPath)
    if (ancestors.length === 0) return
    setExpanded(prev => {
      let changed = false
      const next = { ...prev }
      for (const ancestor of ancestors) {
        if (next[ancestor] !== true) { next[ancestor] = true; changed = true }
      }
      return changed ? next : prev
    })
  }, [currentPath])

  // 当前文件所在行的祖先要读出来才能显示——没有列出过的目录是空的。
  useEffect(() => {
    const ancestors = ancestorsOf(currentPath)
    for (const ancestor of ancestors) {
      if (levels[ancestor] === undefined) load(ancestor)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPath])

  // 键盘导航：在可见行列表上算动作。
  const rows = useMemo(() => {
    const entries: Record<string, { name: string; type: 'file' | 'directory' | 'other' }[]> = {}
    for (const [path, level] of Object.entries(levels)) {
      entries[path] = level.entries.map(entry => ({ name: entry.name, type: entry.type }))
    }
    return visibleRows(entries, expanded)
  }, [levels, expanded])

  const focusRow = useCallback((path: string): void => {
    setFocusedPath(path)
    const element = document.querySelector<HTMLElement>(`[data-files-path="${cssEscape(path)}"] button`)
    element?.focus()
  }, [])

  const onKeyDown = useCallback((event: React.KeyboardEvent, path: string): void => {
    const outcome = handleTreeKey(rows, path, event.key)
    if (outcome.toggle !== undefined) {
      event.preventDefault()
      toggle(outcome.toggle)
      return
    }
    if (outcome.open !== undefined) {
      event.preventDefault()
      props.onOpenFile?.(outcome.open)
      return
    }
    if (outcome.focus !== undefined) {
      event.preventDefault()
      focusRow(outcome.focus)
    }
  }, [focusRow, props, rows])

  const renderLevel = (path: string, depth: number): ReactNode => {
    const level = levels[path]
    const view = levelView(level)
    if (view.kind === 'pending') return null
    if (view.kind === 'error') return <div className={styles.hint}>{view.message}</div>
    if (view.kind === 'loading') return <div className={styles.hint}>载入中…</div>
    if (view.kind === 'empty') return <div className={styles.hint}>{props.t('fileTree.empty')}</div>
    // view.kind === 'items'：level 必有条目。
    const visible = level!.entries.slice(0, level!.shown)
    const rest = level!.entries.length - visible.length
    return <>
      <ul className={styles.list} data-files-list="">
        {visible.map((entry) => {
          const entryPath = path === '' ? entry.name : `${path}/${entry.name}`
          const isDirectory = entry.type === 'directory'
          const open = expanded[entryPath] === true
          const current = !isDirectory && isCurrentRow(entryPath, props.currentPath)
          return <Fragment key={entryPath}>
            <li
              key={entryPath}
              className={styles.item}
              data-files-entry={isDirectory ? 'directory' : 'file'}
              data-files-path={entryPath}
            >
              <button
                type="button"
                className={styles.row}
                data-current={current || undefined}
                aria-current={current ? 'true' : undefined}
                aria-expanded={isDirectory ? open : undefined}
                tabIndex={entryPath === focusedPath ? 0 : -1}
                onFocus={() => setFocusedPath(entryPath)}
                onKeyDown={event => { onKeyDown(event, entryPath) }}
                onContextMenu={event => {
                  if (props.onContextMenu === undefined) return
                  event.preventDefault()
                  event.stopPropagation()
                  props.onContextMenu(
                    { sessionId: props.sessionId, path: entryPath, directory: isDirectory },
                    { x: event.clientX, y: event.clientY },
                  )
                }}
                onClick={() => {
                  if (isDirectory) toggle(entryPath)
                  else props.onOpenFile?.(entryPath)
                }}
              >
                {isDirectory && (
                  // 树形标识：展开/收起箭头（目录才有）。
                  <span className={styles.caret} data-open={open || undefined} aria-hidden="true">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                )}
                {isDirectory ? (
                  <span className={styles.icon} aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 4.2c0-.66.54-1.2 1.2-1.2h2.4l1.5 1.8h5.7c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3.2c-.66 0-1.2-.54-1.2-1.2V4.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
                  </span>
                ) : (
                  // 文件类型图标：代码、样式、图片、压缩包……一眼能看出是什么文件。
                  <span className={styles.icon} aria-hidden="true">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d={fileIconPath(fileIconKind(entry.name))} stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </span>
                )}
                <span className={styles.name}>{entry.name}</span>
                {entry.type === 'file' && entry.size !== undefined && (
                  <span className={styles.size}>{formatSize(entry.size)}</span>
                )}
              </button>
            </li>
            {isDirectory && open && renderLevel(entryPath, depth + 1)}
          </Fragment>
        })}
      </ul>
      {rest > 0 && (
        <button type="button" className={styles.more} data-files-more="" onClick={() => more(path)}>
          {props.t('fileTree.loadMore', { count: rest })}
        </button>
      )}
    </>
  }

  const root = rootPathView(props.rootPath)
  return <div className={styles.tree} data-chat-lazy-file-tree="">
    {(root.leaf !== '' || root.directories.length > 0) && (
      // 根路径：目录段弱化、末段高亮，长路径省略中段、悬停看全路径。
      <div className={styles.root} title={props.rootPath}>
        {root.directories.map((part, index) => (
          <span key={`${part}-${index}`} className={styles.rootPart}>
            <span className={styles.rootSeparator}>/</span>{part}
          </span>
        ))}
        {root.leaf !== '' && <span className={styles.rootLeaf}>{root.leaf}</span>}
        {props.onRefresh !== undefined && (
          <button type="button" className={styles.refresh} data-files-refresh=""
            aria-label={props.t('fileTree.refresh')} title={props.t('fileTree.refresh')}
            onClick={() => { props.onRefresh?.(); load('') }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5V5h-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        )}
      </div>
    )}
    {renderLevel('', 0)}
  </div>
}

/** 字节数转成人类看得懂的短文本。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
