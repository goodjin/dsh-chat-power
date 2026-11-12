/** One editing transaction per session. The host remains the only text editor. */
export interface EditShell {
  readonly draftSnapshot?: unknown
  readonly snapshot: { draft: string; phase: string; notice?: { level: string } }
  readonly state?: { subscribe(listener: () => void): () => void }
  setDraft(value: any): void
}
export interface ComposerEditRequest {
  sessionId: string
  title: string
  text: string
  send(text: string, target: 'current' | 'new'): Promise<void>
  save?(text: string): Promise<void>
  reveal?(): Promise<void> | void
  onClose?(): void
}
export interface ComposerEdit {
  request: ComposerEditRequest
  text: string
  pending: boolean
  nativePending?: boolean
  notice: string
}
const entries = new Map<string, ComposerEdit>()
const bindings = new Map<string, { shell: EditShell; backup: unknown; stop?: () => void }>()
const listeners = new Set<() => void>()
const publish = () => { for (const listener of listeners) listener() }
export const subscribeComposerEdit = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getComposerEdit = (id: string) => entries.get(id)
function patch(id: string, update: Partial<ComposerEdit>) {
  const entry = entries.get(id)
  if (entry) { entries.set(id, { ...entry, ...update }); publish() }
}
export function openComposerEdit(request: ComposerEditRequest): boolean {
  if (entries.has(request.sessionId)) return false
  entries.set(request.sessionId, { request, text: request.text, pending: false, notice: '' })
  publish()
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('chat-power:selection-edit-open', { detail: { sessionId: request.sessionId } }))
  return true
}
/** Suspend on navigation and restore the original semantic draft, retaining the edit. */
export function detachComposerEdit(id: string): void {
  const binding = bindings.get(id)
  if (!binding || entries.get(id)?.nativePending) return
  const text = binding.shell.snapshot.draft
  binding.stop?.()
  binding.shell.setDraft(binding.backup)
  bindings.delete(id)
  patch(id, { text })
}
export function attachComposerEdit(id: string, shell: EditShell): void {
  if (bindings.has(id)) return
  const entry = entries.get(id)
  if (!entry) return
  if (shell.snapshot.phase !== 'plain' && shell.snapshot.phase !== 'claimed') throw new Error('输入框正在处理请求，请稍后重试')
  // Do not pretend a text projection can restore semantic chips on older hosts.
  if (shell.draftSnapshot === undefined && shell.snapshot.draft !== '') throw new Error('当前宿主不支持完整草稿恢复，请先处理输入框中的草稿')
  const backup = structuredClone(shell.draftSnapshot ?? '')
  try { shell.setDraft(entry.text) } catch (error) {
    shell.setDraft(backup)
    throw error
  }
  const binding: { shell: EditShell; backup: unknown; stop?: () => void } = { shell, backup }
  bindings.set(id, binding)
  let sending = false
  binding.stop = shell.state?.subscribe(() => {
    const snapshot = shell.snapshot
    const busy = !['plain', 'claimed'].includes(snapshot.phase)
    if (busy) {
      if (!sending) { sending = true; patch(id, { nativePending: true }) }
      return
    }
    if (!sending) return
    sending = false
    patch(id, { nativePending: false })
    // The host keeps the draft on failure and consumes it after an accepted send.
    // Defer restoration until the host finishes its submission transaction.
    if (snapshot.draft === '' && snapshot.notice?.level !== 'error') queueMicrotask(() => {
      if (bindings.get(id) === binding && shell.snapshot.draft === '') closeComposerEdit(id)
    })
  })
  patch(id, {})
}
export function closeComposerEdit(id: string): void {
  const entry = entries.get(id)
  if (!entry || entry.pending || entry.nativePending) return
  try { detachComposerEdit(id) } catch (error) {
    patch(id, { notice: `恢复原草稿失败，请重试：${String(error)}` })
    return
  }
  entries.delete(id)
  publish()
  try { entry.request.onClose?.() } catch (error) { console.warn('[chat-power] editor close:', error) }
}
export function composerEditText(id: string): string {
  return bindings.get(id)?.shell.snapshot.draft ?? entries.get(id)?.text ?? ''
}
export function setComposerEditNotice(id: string, notice: string) { patch(id, { notice }) }
export async function performComposerEdit(id: string, action: 'current' | 'new' | 'save' | 'reveal'): Promise<void> {
  const entry = entries.get(id)
  if (!entry || entry.pending || entry.nativePending || !bindings.has(id)) return
  try {
    const text = bindings.get(id)!.shell.snapshot.draft
    if ((action === 'current' || action === 'new') && text.trim() === '') return
    patch(id, { pending: true, notice: '' })
    if (action === 'save') {
      if (!entry.request.save) throw new Error('此内容无法写回文件')
      // Lexical uses LF internally. Preserve the original file's CRLF convention.
      const fileText = /\r\n/.test(entry.request.text) && !/(?<!\r)\n/.test(entry.request.text) ? text.replace(/\r?\n/g, '\r\n') : text
      await entry.request.save(fileText)
    } else if (action === 'reveal') await entry.request.reveal?.()
    else await entry.request.send(text, action)
    patch(id, { pending: false, notice: action === 'save' ? '已保存' : '' })
    if (action === 'current' || action === 'new') closeComposerEdit(id)
  } catch (error) {
    patch(id, { pending: false, notice: `操作失败：${error instanceof Error ? error.message : String(error)}` })
  }
}

export const composerEditAttached = (id: string): boolean => bindings.has(id)
