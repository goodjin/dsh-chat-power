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
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import styles from './file-tree-lazy.module.css'

/** 每层最多显示多少条（超出部分用「加载更多」继续）。 */
export const FILE_PAGE_SIZE = 100

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
 * @returns 目录列表；失败或形状不对时给空列表。
 */
export function parseListing(value: unknown): DirectoryListing {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.value)) return { entries: [], truncated: false }
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
interface LevelState {
  /** 已取到的全部条目。 */
  readonly entries: readonly FileEntry[]
  /** 已经显示了多少条。 */
  readonly shown: number
  /** 取列表中。 */
  readonly loading: boolean
  /** 取列表失败时的提示。 */
  readonly error?: string
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

export function LazyFileTree(props: {
  /** 会话 ID（远程调用要带）。 */
  readonly sessionId: string
  /** 远程服务。 */
  readonly remote: () => unknown
  /** 文案。 */
  readonly t: (key: string, vars?: Record<string, string | number>) => string
  /** 点文件：交给上层打开。 */
  readonly onOpenFile?: (path: string) => void
}): ReactNode {
  const [levels, setLevels] = useState<Record<string, LevelState>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const load = useCallback((path: string): void => {
    const api = listingRemote(props.remote)
    if (api === undefined) return
    setLevels(prev => ({ ...prev, [path]: { entries: prev[path]?.entries ?? [], shown: prev[path]?.shown ?? 0, loading: true } }))
    void api.list(props.sessionId, path).then((value) => {
      const listing = parseListing(value)
      setLevels(prev => ({
        ...prev,
        [path]: {
          entries: sortEntries(listing.entries),
          shown: prev[path]?.shown ?? FILE_PAGE_SIZE,
          loading: false,
          ...(listing.truncated ? {} : {}),
        },
      }))
    }).catch(() => {
      setLevels(prev => ({ ...prev, [path]: { entries: [], shown: 0, loading: false, error: '读取目录失败' } }))
    })
  }, [props.remote, props.sessionId])

  useEffect(() => {
    load('')
  }, [load])

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

  const renderLevel = (path: string, depth: number): ReactNode => {
    const level = levels[path]
    if (level === undefined) return null
    if (level.error !== undefined) return <div className={styles.hint}>{level.error}</div>
    if (level.loading && level.entries.length === 0) return <div className={styles.hint}>载入中…</div>
    const visible = level.entries.slice(0, level.shown)
    const rest = level.entries.length - visible.length
    return <>
      <ul className={styles.list} data-files-list="">
        {visible.map((entry) => {
          const entryPath = path === '' ? entry.name : `${path}/${entry.name}`
          const isDirectory = entry.type === 'directory'
          const open = expanded[entryPath] === true
          return <>
            <li
              key={entryPath}
              className={styles.item}
              data-files-entry={isDirectory ? 'directory' : 'file'}
              data-files-path={entryPath}
            >
              <button
                type="button"
                className={styles.row}
                aria-expanded={isDirectory ? open : undefined}
                onClick={() => {
                  if (isDirectory) toggle(entryPath)
                  else props.onOpenFile?.(entryPath)
                }}
              >
                <span className={styles.name}>{entry.name}</span>
                {entry.type === 'file' && entry.size !== undefined && (
                  <span className={styles.size}>{formatSize(entry.size)}</span>
                )}
              </button>
            </li>
            {isDirectory && open && renderLevel(entryPath, depth + 1)}
          </>
        })}
      </ul>
      {rest > 0 && (
        <button type="button" className={styles.more} data-files-more="" onClick={() => more(path)}>
          {props.t('fileTree.loadMore', { count: rest })}
        </button>
      )}
    </>
  }

  return <div className={styles.tree} data-chat-lazy-file-tree="">{renderLevel('', 0)}</div>
}

/** 字节数转成人类看得懂的短文本。 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
