/**
 * 新会话时的工具入口：工作区文件 / 浏览器 / 终端。
 *
 * 照搬右侧栏打开时的样子——新会话一进来，会话区就把这几个栏目摆出来，
 * 点一个就打开对应的工具。
 */
import type { ReactNode } from 'react'
import styles from './tools-entries.module.css'

/** 一个入口。 */
export interface ToolEntry {
  /** 入口种类。 */
  readonly kind: 'files' | 'browser' | 'terminal'
  /** 文案。 */
  readonly label: string
  /** 图标（SVG 源码）。 */
  readonly icon: string
}

export function ToolEntries(props: {
  /** 入口列表。 */
  readonly entries: readonly ToolEntry[]
  /** 点入口。 */
  readonly onOpen: (kind: ToolEntry['kind']) => void
}): ReactNode {
  return (
    <div className={styles.entries} data-chat-tools-entries="">
      {props.entries.map(entry => (
        <button
          key={entry.kind}
          type="button"
          className={styles.entry}
          data-chat-tools-entry={entry.kind}
          onClick={() => { props.onOpen(entry.kind) }}
        >
          <span className={styles.icon} aria-hidden="true" dangerouslySetInnerHTML={{ __html: entry.icon }} />
          <span className={styles.label}>{entry.label}</span>
        </button>
      ))}
    </div>
  )
}
