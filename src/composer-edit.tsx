import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconFolderOpenOutlineRegular, IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { acquireComposerHeader } from './composer-header-mount.ts'
import { BIG_CLASS } from './expand-editor.tsx'
import { scrollEditToTop } from './edit-scroll.ts'
import { ComposeCard } from './compose-card.tsx'
import { copyTextToClipboard } from './send-actions.ts'
import { statusNoticeClass, uiButtonClass, btnClass } from './ui-theme.ts'
import { fallbackT } from './locales.ts'
import { attachComposerEdit, composerEditAttached, closeComposerEdit, composerEditText, detachComposerEdit, getComposerEdit, performComposerEdit, setComposerEditNotice, subscribeComposerEdit, type EditShell } from './composer-edit-state.ts'
import './composer-edit.module.css'

export function ComposerEditSurface({ sessionId, shellOf }: { sessionId: string; shellOf(id: string): EditShell | undefined }) {
  const entry = useSyncExternalStore(subscribeComposerEdit, () => getComposerEdit(sessionId))
  const anchor = useRef<HTMLSpanElement>(null)
  const [mounts, setMounts] = useState<{ head: HTMLElement; actions: HTMLElement } | null>(null)
  const [ready, setReady] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copyPending, setCopyPending] = useState(false)
  const copyState = useRef<{ generation: number; busy: boolean; timer?: ReturnType<typeof setTimeout> }>({ generation: 0, busy: false })
  const request = entry?.request
  useLayoutEffect(() => {
    setCopied(false)
    setCopyPending(false)
    copyState.current.busy = false
    return () => {
      copyState.current.generation++
      clearTimeout(copyState.current.timer)
      copyState.current.timer = undefined
    }
  }, [request, sessionId])
  const copyDraft = async (): Promise<void> => {
    const state = copyState.current
    if (state.busy) return
    const generation = state.generation
    state.busy = true
    clearTimeout(state.timer)
    setCopied(false)
    setCopyPending(true)
    try {
      const ok = await copyTextToClipboard(composerEditText(sessionId))
      if (state.generation !== generation) return
      setComposerEditNotice(sessionId, ok ? '' : '复制失败')
      setCopied(ok)
      if (ok) state.timer = setTimeout(() => setCopied(false), 1500)
    } catch {
      if (state.generation === generation) setComposerEditNotice(sessionId, '复制失败')
    } finally {
      if (state.generation === generation) { state.busy = false; setCopyPending(false) }
    }
  }
  useLayoutEffect(() => {
    if (!request) return
    const card = anchor.current?.closest<HTMLElement>('[data-composer-card]')
    const content = card?.closest<HTMLElement>('[data-conversation-content]')
    const seat = card?.closest<HTMLElement>('[data-composer-seat]')
    const viewport = card?.closest<HTMLElement>('[data-conversation-scroll]')
    const input = card?.querySelector<HTMLElement>('[data-composer-input]')
    if (!card || !content || !seat || !input) return
    const headerMount = acquireComposerHeader(card)
    const head = headerMount.head
    const actions = document.createElement('div')
    head.dataset.composeEditHead = ''; actions.dataset.composeEditActions = ''
    head.after(actions)
    const wasExpanded = card.classList.contains(BIG_CLASS)
    card.classList.add(BIG_CLASS)
    card.dataset.composeEdit = ''
    // 回答、选区和文件编辑都按会话视口计算，扣除输入座位的工具栏/页脚。
    const oldHeight = card.style.getPropertyValue('--compose-edit-height')
    const oldPriority = card.style.getPropertyPriority('--compose-edit-height')
    const resizeEditor = () => {
      const available = viewport?.clientHeight || content.getBoundingClientRect().height
      const chrome = Math.max(0, seat.getBoundingClientRect().height - card.getBoundingClientRect().height)
      if (available <= chrome) return
      const height = `${Math.floor(available - chrome)}px`
      if (card.style.getPropertyValue('--compose-edit-height') !== height) card.style.setProperty('--compose-edit-height', height)
    }
    if (request.save) card.dataset.composeEditFile = ''
    resizeEditor()
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resizeEditor)
    for (const node of new Set([content, seat, card, viewport].filter((node): node is HTMLElement => !!node))) resize?.observe(node)
    window.addEventListener('resize', resizeEditor)
    setMounts({ head, actions })
    try {
      const shell = shellOf(sessionId)
      if (!shell) throw new Error('输入框尚未就绪，请退出后重试')
      attachComposerEdit(sessionId, shell)
      setReady(true)
    } catch (error) { setComposerEditNotice(sessionId, String(error)) }
    // Reuse the existing expanded-input keyboard behavior.
    input.focus({ preventScroll: true })
    const align = window.requestAnimationFrame(() => {
      resizeEditor()
      // 编辑面回到顶部：内容灌进来后浏览器把滚动留在末尾，顶部就看不见了。
      scrollEditToTop(card)
    })
    return () => {
      try { detachComposerEdit(sessionId) } catch (error) { console.warn('[chat-power] restore draft:', error) }
      delete head.dataset.composeEditHead
      headerMount.release(); actions.remove()
      card.classList.toggle(BIG_CLASS, wasExpanded)
      resize?.disconnect()
      window.removeEventListener('resize', resizeEditor)
      window.cancelAnimationFrame(align)
      if (oldHeight) card.style.setProperty('--compose-edit-height', oldHeight, oldPriority)
      else card.style.removeProperty('--compose-edit-height')
      delete card.dataset.composeEditFile
      delete card.dataset.composeEdit
      setMounts(null); setReady(false)
    }
  }, [request, sessionId, shellOf])
  useLayoutEffect(() => {
    const input = anchor.current?.closest('[data-composer-card]')?.querySelector<HTMLElement>('[data-composer-input]')
    if (!entry?.pending || !input) return
    const editable = input.getAttribute('contenteditable')
    input.setAttribute('contenteditable', 'false')
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
    input.addEventListener('beforeinput', block, true)
    const card = input.closest('[data-composer-card]')!
    card.addEventListener('click', block, true)
    return () => {
      if (editable === null) input.removeAttribute('contenteditable'); else input.setAttribute('contenteditable', editable)
      input.removeEventListener('beforeinput', block, true)
      card.removeEventListener('click', block, true)
    }
  }, [entry?.pending])
  const t = fallbackT
  return <><span ref={anchor} hidden />{entry && mounts && <ComposeCard
    mounts={mounts} title={entry.request.title} subtitle={t('compose.copyHint')}
    headerActions={<>
      {entry.request.save && <button type="button" className={btnClass} data-compose-save="" disabled={entry.pending || entry.nativePending || !ready} onClick={() => { void performComposerEdit(sessionId, 'save') }}><IconCheckOutlineRegular size={15} />{t('compose.save')}</button>}
      {entry.request.reveal && <button type="button" className={uiButtonClass} data-local-reveal="" title="打开文件所在文件夹" aria-label="打开文件所在文件夹" disabled={entry.pending || entry.nativePending || !ready} onClick={() => { void performComposerEdit(sessionId, 'reveal') }}><IconFolderOpenOutlineRegular size={16} /></button>}
    </>}
    onCancel={() => closeComposerEdit(sessionId)}
    onCopy={() => { copyDraft().catch(error => console.warn('[chat-power] edit copy:', error)) }}
    copied={copied} copyPending={copyPending}
    pending={entry.pending || entry.nativePending || !ready}
    labels={{ cancel: t('markdownTurn.cancel'), copy: t('compose.copy'), copied: t('answerCard.copied'), save: t('compose.save'), send: t('compose.sendCurrent'), newSession: t('compose.sendNewSession') }}
  >{entry.notice && <p role="status" className={statusNoticeClass}>{entry.notice}</p>}</ComposeCard>}</>
}

/** Add one control in the host's existing bottom row; do not replace that row. */
export function ComposerEditNewSession(props: {
  sessionId: string
  useInput: <T>(select: (state: { draft: string; phase: string }) => T) => T
}) {
  const entry = useSyncExternalStore(subscribeComposerEdit, () => getComposerEdit(props.sessionId))
  const draft = props.useInput(state => state.draft)
  const phase = props.useInput(state => state.phase)
  if (!entry) return null
  return <button type="button" className={btnClass} data-compose-new-session=""
    disabled={entry.pending || entry.nativePending || !composerEditAttached(props.sessionId) || !draft.trim() || !['plain', 'claimed'].includes(phase)}
    onClick={() => { void performComposerEdit(props.sessionId, 'new') }}>
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8.3125 0.980183C8.66767 1.0531 8.97902 1.20418 9.2627 1.43233C9.48724 1.61297 9.73029 1.85793 9.97949 2.10714L14.707 6.83468L13.293 8.24874L9 3.95577V15.0417H7V3.95577L2.70703 8.24874L1.29297 6.83468L6.02051 2.10714C6.26971 1.85793 6.51277 1.61297 6.7373 1.43233C6.97662 1.23986 7.28445 1.04402 7.6875 0.980183C7.8973 0.947006 8.1031 0.95516 8.3125 0.980183Z" fill="currentColor" />
    </svg>{fallbackT('compose.sendNewSession')}
  </button>
}
