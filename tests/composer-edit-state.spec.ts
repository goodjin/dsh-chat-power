import { describe, expect, it, vi } from 'vitest'
import { attachComposerEdit, closeComposerEdit, composerEditText, detachComposerEdit, getComposerEdit, openComposerEdit, performComposerEdit, type EditShell } from '../src/composer-edit-state.ts'
function shell(initial: any = { text: '原草稿', references: [], quotes: [] }) {
  let value = initial
  return {
    get draftSnapshot() { return value },
    get snapshot() { return { draft: value.text, phase: 'plain' } },
    setDraft(next: any) { value = typeof next === 'string' ? { text: next, references: [], quotes: [] } : next },
    attachmentIds: ['image-1'],
  }
}
let seq = 0
const id = () => `edit-test-${++seq}`
describe('composer edit transaction', () => {
  it('restores semantic references, quotes, commands and retains attachments on cancel', () => {
    const key = id()
    const draft = { text: '/cmd @file 引文', references: [{ ref: 'a' }], quotes: [{ text: '引文' }], command: { token: '/cmd' } }
    const host = shell(draft)
    openComposerEdit({ sessionId: key, title: 'file', text: '\tcode\n\n', send: vi.fn() })
    attachComposerEdit(key, host)
    expect(composerEditText(key)).toBe('\tcode\n\n')
    host.setDraft('changed')
    closeComposerEdit(key)
    expect(host.draftSnapshot).toEqual(draft)
    expect(host.attachmentIds).toEqual(['image-1'])
  })
  it('suspends drafts per session and resumes without stealing another session', () => {
    const a = id(), b = id(), first = shell(), second = shell({ text: 'other', references: [] })
    for (const key of [a, b]) openComposerEdit({ sessionId: key, title: key, text: key, send: vi.fn() })
    attachComposerEdit(a, first); first.setDraft('修改后'); detachComposerEdit(a)
    attachComposerEdit(b, second)
    expect(first.snapshot.draft).toBe('原草稿')
    expect(second.snapshot.draft).toBe(b)
    detachComposerEdit(b); attachComposerEdit(a, first)
    expect(first.snapshot.draft).toBe('修改后')
    closeComposerEdit(a); closeComposerEdit(b)
  })
  it('failed send keeps the text; only successful send restores the original', async () => {
    const key = id(), host = shell(), send = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    openComposerEdit({ sessionId: key, title: 'text', text: '正文', send }); attachComposerEdit(key, host)
    await performComposerEdit(key, 'new')
    expect(composerEditText(key)).toBe('正文')
    expect(getComposerEdit(key)?.notice).toContain('offline')
    await performComposerEdit(key, 'new')
    expect(send).toHaveBeenLastCalledWith('正文', 'new')
    expect(getComposerEdit(key)).toBeUndefined()
    expect(host.snapshot.draft).toBe('原草稿')
  })
  it('blocks double sends, replacement and close while a request is in flight', async () => {
    const key = id(), host = shell()
    let done!: () => void
    const send = vi.fn(() => new Promise<void>(resolve => { done = resolve }))
    const request = { sessionId: key, title: 'text', text: '正文', send }
    openComposerEdit(request); attachComposerEdit(key, host)
    const pending = performComposerEdit(key, 'current')
    await performComposerEdit(key, 'new'); closeComposerEdit(key)
    expect(openComposerEdit(request)).toBe(false)
    expect(send).toHaveBeenCalledTimes(1)
    expect(getComposerEdit(key)?.pending).toBe(true)
    done(); await pending
    expect(host.snapshot.draft).toBe('原草稿')
  })
  it('supports empty-file saves, preserves CRLF, and opens the folder without closing', async () => {
    const key = id(), host = shell(), save = vi.fn(), reveal = vi.fn()
    openComposerEdit({ sessionId: key, title: 'file', text: 'a\r\n', send: vi.fn(), save, reveal }); attachComposerEdit(key, host)
    host.setDraft('a\nb\n'); await performComposerEdit(key, 'save')
    expect(save).toHaveBeenLastCalledWith('a\r\nb\r\n')
    host.setDraft(''); await performComposerEdit(key, 'save')
    expect(save).toHaveBeenLastCalledWith('')
    await performComposerEdit(key, 'reveal')
    expect(reveal).toHaveBeenCalledTimes(1)
    expect(getComposerEdit(key)).toBeDefined()
    closeComposerEdit(key)
  })
  it('refuses a busy editor without touching its original text', () => {
    const key = id(), setDraft = vi.fn()
    openComposerEdit({ sessionId: key, title: 'text', text: '新内容', send: vi.fn() })
    expect(() => attachComposerEdit(key, { snapshot: { draft: '旧内容', phase: 'submitting' }, setDraft } as EditShell)).toThrow()
    expect(setDraft).not.toHaveBeenCalled()
    closeComposerEdit(key)
  })
})

 it('native send keeps host controls in charge, preserves failed drafts and restores after acceptance', async () => {
  const key = id()
  let listener = () => {}
  let phase = 'plain', text = '原草稿'
  const host = {
    get snapshot() { return { draft: text, phase } },
    get draftSnapshot() { return { text, references: [] } },
    setDraft(value: any) { text = typeof value === 'string' ? value : value.text },
    state: { subscribe(callback: () => void) { listener = callback; return () => { listener = () => {} } } },
  }
  const send = vi.fn()
  openComposerEdit({ sessionId: key, title: 'text', text: '编辑正文', send })
  attachComposerEdit(key, host)
  phase = 'sending'; listener()
  expect(getComposerEdit(key)?.nativePending).toBe(true)
  closeComposerEdit(key)
  expect(getComposerEdit(key)).toBeDefined()
  phase = 'plain'; listener()
  expect(composerEditText(key)).toBe('编辑正文')
  expect(getComposerEdit(key)?.nativePending).toBe(false)
  phase = 'sending'; listener()
  text = ''; phase = 'plain'; listener()
  await Promise.resolve()
  expect(getComposerEdit(key)).toBeUndefined()
  expect(text).toBe('原草稿')
  expect(send).not.toHaveBeenCalled()
 })
