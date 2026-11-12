import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconFolderOpenOutlineRegular, IconCheckOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { BIG_CLASS } from './expand-editor.tsx'
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
  const request = entry?.request
  useLayoutEffect(() => {
    if (!request) return
    const card = anchor.current?.closest<HTMLElement>('[data-composer-card]')
    const content = card?.closest<HTMLElement>('[data-conversation-content]')
    const seat = card?.closest<HTMLElement>('[data-composer-seat]')
    const input = card?.querySelector<HTMLElement>('[data-composer-input]')
    if (!card || !content || !seat || !input) return
    const head = document.createElement('div')
    const actions = document.createElement('div')
    head.dataset.composeEditHead = ''; actions.dataset.composeEditActions = ''
    card.prepend(head); head.after(actions)
    const wasExpanded = card.classList.contains(BIG_CLASS)
    card.classList.add(BIG_CLASS)
    card.dataset.composeEdit = ''
    // File editing fills the available conversation height. Measure the seat's
    // native chrome as well so its footer and padding remain inside the page.
    const resizeFile = () => {
      if (!request.save) return
      const available = content.getBoundingClientRect().height
      const chrome = Math.max(0, seat.getBoundingClientRect().height - card.getBoundingClientRect().height)
      if (available > chrome) card.style.setProperty('--compose-edit-height', `${available - chrome}px`)
    }
    if (request.save) card.dataset.composeEditFile = ''
    resizeFile()
    const resize = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resizeFile)
    if (request.save) { resize?.observe(content); resize?.observe(seat) }
    window.addEventListener('resize', resizeFile)
    setMounts({ head, actions })
    try {
      const shell = shellOf(sessionId)
      if (!shell) throw new Error('输入框尚未就绪，请退出后重试')
      attachComposerEdit(sessionId, shell)
      setReady(true)
    } catch (error) { setComposerEditNotice(sessionId, String(error)) }
    // Reuse the existing expanded-input keyboard behavior.
    input.focus()
    return () => {
      try { detachComposerEdit(sessionId) } catch (error) { console.warn('[chat-power] restore draft:', error) }
      head.remove(); actions.remove()
      card.classList.toggle(BIG_CLASS, wasExpanded)
      resize?.disconnect()
      window.removeEventListener('resize', resizeFile)
      card.style.removeProperty('--compose-edit-height')
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
    onCopy={() => { void copyTextToClipboard(composerEditText(sessionId)).then(ok => setComposerEditNotice(sessionId, ok ? '已复制' : '复制失败')) }}
    pending={entry.pending || entry.nativePending || !ready}
    labels={{ cancel: t('markdownTurn.cancel'), copy: t('compose.copy'), save: t('compose.save'), send: t('compose.sendCurrent'), newSession: t('compose.sendNewSession') }}
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
