/**
 * 文档预览（宿主右侧栏「文档」标签）右上角的本包动作钮。
 *
 * 宿主把那一排的位置交给 `sidebar.right.tab.document.actions` 插槽，同一排里
 * 放的是它自己的图标钮（28×28、透明底、悬停才有底色）。本包的两个动作
 * ——复制全文、编辑并发送——原先是文字钮，挤在图标旁边既占地方又不成样，
 * 改成同款图标钮。
 *
 * 回执不占地方：复制成功时图标换成对勾、悬停提示同步改成「已复制」；
 * 出错信息进只给读屏软件看的状态区（视觉上收起），鼠标悬停仍能读到。
 */
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconCheckOutlineRegular, IconCopyOutlineRegular, IconEditOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { readEntireWorkspaceText } from './workspace-text.ts'
import { fallbackT } from './locales.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import './document-actions.module.css'

/**
 * 文档预览右上角的两个动作钮。
 *
 * @param props - 会话、文件路径、读取通道与「编辑」的去向。
 * @returns 两个图标钮与一个只给读屏软件的状态区。
 */
export function DocumentActions({ sessionId, absolutePath, readers, onEdit }: {
  sessionId: string
  absolutePath: string
  readers: MarkdownTurnReaders
  onEdit: (sessionId: string, path: string) => void
}): ReactNode {
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const lifetime = useRef<AbortController>()
  const copyTimer = useRef<number | undefined>(undefined)
  useEffect(() => { const c = new AbortController(); lifetime.current = c; return () => c.abort() }, [])
  useEffect(() => () => { if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current) }, [])

  const run = async (edit: boolean): Promise<void> => {
    if (busy || lifetime.current === undefined) return
    const signal = lifetime.current.signal
    setBusy(true)
    setStatus('')
    try {
      if (edit) { onEdit(sessionId, absolutePath); return }
      const text = await readEntireWorkspaceText(sessionId, absolutePath,
        offset => readers.readPage(sessionId, absolutePath, offset, signal), signal)
      await navigator.clipboard.writeText(text)
      if (signal.aborted) return
      // 复制成功：图标换成对勾、提示文字同步改，不往那一排里塞文字。
      setCopied(true)
      setStatus(fallbackT('documentActions.copied'))
      if (copyTimer.current !== undefined) window.clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => { setCopied(false); setStatus('') }, 1500)
    } catch (error) {
      if (signal.aborted) return
      setStatus(fallbackT('documentActions.failed') + String(error))
    } finally { if (!signal.aborted) setBusy(false) }
  }

  const copyLabel = copied ? fallbackT('documentActions.copied') : fallbackT('documentActions.copy')
  const editLabel = fallbackT('documentActions.edit')
  return <>
    <button
      type="button"
      data-chat-power-document-action=""
      data-chat-power-document-copy=""
      aria-label={copyLabel}
      title={copyLabel}
      disabled={busy}
      onClick={() => { void run(false) }}
    >
      {copied ? <IconCheckOutlineRegular size={16} /> : <IconCopyOutlineRegular size={16} />}
    </button>
    <button
      type="button"
      data-chat-power-document-action=""
      data-chat-power-document-edit=""
      aria-label={editLabel}
      title={editLabel}
      disabled={busy}
      onClick={() => { void run(true) }}
    >
      <IconEditOutlineRegular size={16} />
    </button>
    <span role="status" data-chat-power-document-status="">{status}</span>
  </>
}
