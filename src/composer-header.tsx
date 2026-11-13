import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { acquireComposerHeader } from './composer-header-mount.ts'
import { getComposerEdit, subscribeComposerEdit } from './composer-edit-state.ts'
import { readShortcuts, writeShortcuts, type ComposerShortcut } from './composer-shortcuts.ts'
import type { PluginContext } from './index.ts'
import { createMarkdownTurnReaders } from './markdown-turn-sources.ts'
import './composer-header.module.css'

const HEADER_ICONS = {
  fork: 'M6 3v12m0-6h8a4 4 0 0 0 4-4V3M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0M15 3a3 3 0 1 0 6 0',
  quick: 'm13 2-9 12h7l-1 8 10-13h-7Z',
  add: 'M12 5v14M5 12h14',
  remove: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7',
  save: 'm5 12 4 4L19 6',
  cancel: 'm6 6 12 12M18 6 6 18',
} as const
function HeaderIcon({ name }: { name: keyof typeof HEADER_ICONS }) {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={HEADER_ICONS[name]} /></svg>
}

export interface ComposerHeaderActions {
  send(id: string, text: string): Promise<void>
  fork(id: string): Promise<void>
}
export function ComposerHeader({ sessionId, actions, canSend = false, canFork = false }: {
  sessionId: string; actions: ComposerHeaderActions; canSend?: boolean; canFork?: boolean
}) {
  const anchor = useRef<HTMLSpanElement>(null)
  const [head, setHead] = useState<HTMLElement | null>(null)
  const editing = useSyncExternalStore(subscribeComposerEdit, () => getComposerEdit(sessionId))
  const [now, setNow] = useState(() => new Date())
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const [entries, setEntries] = useState<ComposerShortcut[]>([])
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)
  const busy = useRef(false)
  const mounted = useRef(false)
  useLayoutEffect(() => {
    const card = anchor.current?.closest<HTMLElement>('[data-composer-card]')
    if (!card) return
    const mount = acquireComposerHeader(card)
    setHead(mount.head)
    return mount.release
  }, [sessionId])
  useEffect(() => {
    mounted.current = true
    const timer = window.setInterval(() => setNow(new Date()), 1000 * 30)
    return () => { mounted.current = false; window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    try { setEntries(readShortcuts(localStorage)) } catch { setNotice('无法读取快捷方式，请检查浏览器存储') }
  }, [open])
  useEffect(() => {
    if (editing) { setOpen(false); setAdding(false) }
  }, [editing])
  useEffect(() => {
    if (!open || !head) return
    const outside = (event: Event) => { if (!head.contains(event.target as Node)) setOpen(false) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [head, open])
  const save = (next: ComposerShortcut[]): boolean => {
    try { writeShortcuts(localStorage, next); setEntries(next); setNotice(''); return true }
    catch { setNotice('保存失败，快捷方式未修改'); return false }
  }
  const run = (operation: () => Promise<void>, success: string) => {
    if (busy.current) return
    busy.current = true; setPending(true); setNotice('')
    void operation().then(() => {
      if (mounted.current) { setNotice(success); setOpen(false) }
    }).catch(error => {
      if (mounted.current) setNotice(error instanceof Error ? error.message : String(error))
    }).finally(() => { busy.current = false; if (mounted.current) setPending(false) })
  }
  return <><span ref={anchor} hidden />{head && !editing && createPortal(<div className="chat-power-composer-tools" onClick={event => event.stopPropagation()}>
    <div className="chat-power-composer-title">
      <span>输入</span>
      <time dateTime={now.toISOString()} title={now.toLocaleString()}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</time>
      <button type="button" disabled={pending || !canFork} data-composer-icon="" aria-label="分叉" title="从最后一个已完成轮次分叉并打开；不发送草稿" onClick={() => run(() => actions.fork(sessionId), '已创建分支')}><HeaderIcon name="fork" /></button>
      <button type="button" data-composer-icon="" aria-label="快捷发送" title="快捷发送" aria-expanded={open} disabled={pending} onClick={() => setOpen(!open)}><HeaderIcon name="quick" /></button>
      <span data-chat-power-expand-seat="" />
    </div>
    {notice && <div role="status" className="chat-power-composer-notice">{notice}</div>}
    {open && <div className="chat-power-shortcuts">
      <div className="chat-power-shortcut-list">
        {entries.length === 0 && <p>暂无快捷方式</p>}
        {entries.map(item => <div key={item.id} className="chat-power-shortcut-row">
          <button type="button" disabled={pending || !canSend} title={item.text} onClick={() => run(() => actions.send(sessionId, item.text), '已发送')}>{item.text}</button>
          <button type="button" data-composer-icon="" title="删除快捷方式" aria-label={`删除：${item.text}`} disabled={pending} onClick={() => save(entries.filter(entry => entry.id !== item.id))}><HeaderIcon name="remove" /></button>
        </div>)}
      </div>
      {adding ? <div>
        <textarea aria-label="快捷发送内容" value={draft} onChange={event => setDraft(event.target.value)} placeholder="输入要直接发送的内容" />
        <button type="button" data-composer-icon="" title="保存快捷方式" aria-label="保存" disabled={!draft.trim() || pending} onClick={() => {
          if (save([...entries, { id: crypto.randomUUID(), text: draft.trim() }])) { setDraft(''); setAdding(false) }
        }}><HeaderIcon name="save" /></button>
        <button type="button" data-composer-icon="" title="取消新增" aria-label="取消" onClick={() => { setAdding(false); setDraft('') }}><HeaderIcon name="cancel" /></button>
      </div> : <button type="button" data-composer-icon="" title="新增快捷方式" aria-label="新增快捷方式" disabled={pending} onClick={() => setAdding(true)}><HeaderIcon name="add" /></button>}
    </div>}
  </div>, head)}</>
}

export function registerComposerHeader(ctx: PluginContext): void {
  const readers = createMarkdownTurnReaders(() => ctx.get('remote'))
  const actions: ComposerHeaderActions = {
    send: (id, text) => readers.sendToSession(id, text),
    fork: async sessionId => {
      const sessions = ctx.get('sessions') as { fork(options: { sessionId: string; increaseTitle: boolean }): Promise<string> }
      const workspace = ctx.get('uiWorkspace') as { openSession(id: string): void | Promise<void> }
      if (typeof workspace?.openSession !== 'function' || typeof sessions?.fork !== 'function') throw new Error('当前环境暂不支持分叉')
      // 宿主未指定 atSeq 时默认取最后一个已完成轮次的前缀。
      const id = await sessions.fork({ sessionId, increaseTitle: true })
      try { await workspace.openSession(id) } catch { throw new Error(`分支已创建（${id}），请从会话列表打开`) }
    },
  }
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({
    name: 'conversation.input.overlay', id: 'chat-power-composer-header', order: 10,
  }, (props: { sessionId: string; useAccess(key: string): boolean | undefined }) => {
    const canSend = props.useAccess('session/prompt') === true
    const canFork = props.useAccess('session/fork') === true
    return <ComposerHeader key={props.sessionId} sessionId={props.sessionId} actions={actions} canSend={canSend} canFork={canFork} />
  }))
}
