import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconFolderOpenOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { BIG_CLASS } from './expand-editor.tsx'
import { ComposeCard } from './compose-card.tsx'
import { copyTextToClipboard } from './send-actions.ts'
import { statusNoticeClass, uiButtonClass } from './ui-theme.ts'
import { fallbackT } from './locales.ts'
import { attachComposerEdit, closeComposerEdit, composerEditText, detachComposerEdit, getComposerEdit, performComposerEdit, setComposerEditNotice, subscribeComposerEdit, type EditShell } from './composer-edit-state.ts'
import './composer-edit.module.css'

export function ComposerEditSurface({ sessionId, shellOf }: { sessionId: string; shellOf(id: string): EditShell | undefined }) {
  const entry = useSyncExternalStore(subscribeComposerEdit, () => getComposerEdit(sessionId))
  const anchor = useRef<HTMLSpanElement>(null)
  const [mounts, setMounts] = useState<{ head: HTMLElement; actions: HTMLElement } | null>(null)
  const [ready, setReady] = useState(false)
  const [hasText, setHasText] = useState(false)
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
    card.prepend(head); card.append(actions)
    const wasExpanded = card.classList.contains(BIG_CLASS)
    card.classList.add(BIG_CLASS)
    card.dataset.composeEdit = ''
    setMounts({ head, actions })
    try {
      const shell = shellOf(sessionId)
      if (!shell) throw new Error('输入框尚未就绪，请退出后重试')
      attachComposerEdit(sessionId, shell)
      setReady(true)
    } catch (error) { setComposerEditNotice(sessionId, String(error)) }
    const update = () => setHasText(composerEditText(sessionId).trim() !== '')
    update()
    const observer = new MutationObserver(update)
    observer.observe(input, { subtree: true, childList: true, characterData: true })
    // Keep every keyboard submit route in editing mode as a newline; native
    // submission stays mounted but its controls are hidden while our transaction owns the draft.
    let composing = false
    const compositionStart = () => { composing = true }
    const compositionEnd = () => { composing = false }
    input.addEventListener('compositionstart', compositionStart)
    input.addEventListener('compositionend', compositionEnd)
    const key = (event: KeyboardEvent) => {
      if (!input.contains(event.target as Node) || event.key !== 'Enter' || composing || event.isComposing || (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey)) return
      event.preventDefault(); event.stopImmediatePropagation()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true }))
    }
    window.addEventListener('keydown', key, true)
    input.focus()
    return () => {
      observer.disconnect(); window.removeEventListener('keydown', key, true)
      input.removeEventListener('compositionstart', compositionStart)
      input.removeEventListener('compositionend', compositionEnd)
      try { detachComposerEdit(sessionId) } catch (error) { console.warn('[chat-power] restore draft:', error) }
      head.remove(); actions.remove()
      card.classList.toggle(BIG_CLASS, wasExpanded)
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
    return () => {
      if (editable === null) input.removeAttribute('contenteditable'); else input.setAttribute('contenteditable', editable)
      input.removeEventListener('beforeinput', block, true)
    }
  }, [entry?.pending])
  const t = fallbackT
  return <><span ref={anchor} hidden />{entry && mounts && <ComposeCard
    mounts={mounts} title={entry.request.title} subtitle={t('compose.copyHint')}
    headerActions={entry.request.reveal && <button type="button" className={uiButtonClass} data-local-reveal="" title="打开文件所在文件夹" aria-label="打开文件所在文件夹" disabled={entry.pending || !ready} onClick={() => { void performComposerEdit(sessionId, 'reveal') }}><IconFolderOpenOutlineRegular size={16} /></button>}
    onCancel={() => closeComposerEdit(sessionId)}
    onCopy={() => { void copyTextToClipboard(composerEditText(sessionId)).then(ok => setComposerEditNotice(sessionId, ok ? '已复制' : '复制失败')) }}
    onSave={entry.request.save ? () => { void performComposerEdit(sessionId, 'save') } : undefined}
    onSend={() => { void performComposerEdit(sessionId, 'current') }}
    onSendNewSession={() => { void performComposerEdit(sessionId, 'new') }}
    pending={entry.pending || !ready} sendDisabled={!hasText}
    labels={{ cancel: t('markdownTurn.cancel'), copy: t('compose.copy'), save: t('compose.save'), send: t('compose.sendCurrent'), newSession: t('compose.sendNewSession') }}
  >{entry.notice && <p role="status" className={statusNoticeClass}>{entry.notice}</p>}</ComposeCard>}</>
}
