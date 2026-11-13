import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderOpenOutlineRegular: () => null, IconCheckOutlineRegular: () => createElement('span', { 'data-test-check': '' }),
  IconCloseOutlineRegular: () => null, IconCopyOutlineRegular: () => createElement('span', { 'data-test-copy': '' }),
  IconNewChatOutlineRegular: () => null, IconSendOutlineRegular: () => null,
}))
import { BIG_CLASS } from '../src/expand-editor.tsx'
import { ComposerEditSurface, ComposerEditNewSession } from '../src/composer-edit.tsx'
import { openComposerEdit, closeComposerEdit } from '../src/composer-edit-state.ts'
it.each([[false, false], [true, false], [false, true], [true, true]])('fills viewport and restores draft (expanded=%s, file=%s)', async (wasExpanded, file) => {
  document.body.innerHTML = '<main data-conversation-content><div data-conversation-scroll><article>回答</article><footer data-composer-seat><div data-composer-card><div id="overlay"></div><div data-input-scroll><div data-composer-input contenteditable="true"></div></div><div id="native-row"><button id="model">模型</button><span id="right"></span><button id="native-send">发送</button><span id="info">输入框信息</span></div></div></footer></div></main>'
  const style = document.createElement('style')
  style.textContent = '[data-composer-card]{width:720px;padding:12px;border-radius:24px}#native-row{display:flex}' + readFileSync('src/composer-edit.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1')
  document.body.append(style)
  const input = document.querySelector<HTMLElement>('[data-composer-input]')!
  document.querySelector('[data-composer-card]')!.classList.toggle(BIG_CLASS, wasExpanded)
  const card = input.closest<HTMLElement>('[data-composer-card]')!
  let available = 800
  Object.defineProperty(document.querySelector('[data-conversation-scroll]'), 'clientHeight', { get: () => available })
  vi.spyOn(document.querySelector('[data-conversation-content]')!, 'getBoundingClientRect').mockReturnValue({ height: 999 } as DOMRect)
  vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ height: 400 } as DOMRect)
  vi.spyOn(document.querySelector('[data-composer-seat]')!, 'getBoundingClientRect').mockReturnValue({ height: 440 } as DOMRect)
  let draft = { text: '原草稿', references: [] }
  const host = {
    get draftSnapshot() { return draft },
    get snapshot() { return { draft: draft.text, phase: 'plain' } },
    setDraft(value: any) { draft = typeof value === 'string' ? { text: value, references: [] } : value; input.textContent = draft.text },
  }
  const root = createRoot(document.getElementById('overlay')!)
  const footerRoot = createRoot(document.getElementById('right')!)
  const nativeRow = document.getElementById('native-row')!
  const nativeSend = document.getElementById('native-send')!
  const nativeClick = vi.fn()
  nativeSend.addEventListener('click', nativeClick)
  const reveal = vi.fn()
  try {
    openComposerEdit({ sessionId: 'dom-edit', title: 'example.ts', text: '\tconst n = 1\n', send: vi.fn(), ...(file ? { save: vi.fn(), reveal } : {}) })
    act(() => root.render(createElement(ComposerEditSurface, { sessionId: 'dom-edit', shellOf: () => host })))
    expect(document.querySelector('[data-composer-input]')).toBe(input)
    expect(document.querySelector('textarea')).toBeNull()
    expect(document.querySelector('[data-composer-card]')?.classList.contains(BIG_CLASS)).toBe(true)
    expect(document.querySelector('[data-compose-edit-wrap]')).toBeNull()
    expect(document.querySelector('[data-compose-editing-seat]')).toBeNull()
    expect(input.textContent).toBe('\tconst n = 1\n')
    expect(document.querySelector('[data-compose-edit-head]')?.textContent).toContain('example.ts')
    act(() => footerRoot.render(createElement(ComposerEditNewSession, { sessionId: 'dom-edit', useInput: select => select(host.snapshot) })))
    expect(document.querySelector('[data-compose-send]')).toBeNull()
    expect(document.getElementById('native-row')).toBe(nativeRow)
    expect(getComputedStyle(nativeRow).display).toBe('flex')
    const cardStyle = getComputedStyle(input.closest('[data-composer-card]')!)
    expect(cardStyle.width).toBe('720px')
    expect(cardStyle.padding).toBe('12px')
    expect(cardStyle.borderRadius).toBe('24px')
    expect(card.style.getPropertyValue('--compose-edit-height')).toBe('760px')
    available = 600
    act(() => window.dispatchEvent(new Event('resize')))
    expect(card.style.getPropertyValue('--compose-edit-height')).toBe('560px')
    expect(document.getElementById('native-send')).toBe(nativeSend)
    expect(document.getElementById('info')?.textContent).toBe('输入框信息')
    act(() => nativeSend.click())
    expect(nativeClick).toHaveBeenCalledTimes(1)
    expect(document.querySelector('[data-compose-new-session]')).not.toBeNull()
    const newline = vi.fn()
    input.addEventListener('keydown', newline)
    const enter = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
    input.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(false)
    expect(newline).toHaveBeenCalledTimes(1)
    expect(newline.mock.calls[0]![0]).toBe(enter)
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const imeEnter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    input.dispatchEvent(imeEnter)
    expect(imeEnter.defaultPrevented).toBe(false)
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    if (file) {
      await act(async () => { (document.querySelector('[data-local-reveal]') as HTMLElement).click() })
      expect(reveal).toHaveBeenCalledTimes(1)
    }
    act(() => (document.querySelector('[data-compose-cancel]') as HTMLElement).click())
    expect(input.textContent).toBe('原草稿')
    expect(card.style.getPropertyValue('--compose-edit-height')).toBe('')
    expect(card.hasAttribute('data-compose-edit-file')).toBe(false)
    expect(document.querySelector('[data-compose-edit]')).toBeNull()
    expect(document.querySelector('[data-composer-card]')?.classList.contains(BIG_CLASS)).toBe(wasExpanded)
    expect(document.querySelector('[data-compose-edit-head]')).toBeNull()
  } finally {
    act(() => { footerRoot.unmount(); root.unmount() }); closeComposerEdit('dom-edit'); document.body.replaceChildren()
  }
})

it('编辑副本复制成功短暂变勾，复制失败不显示成功，退出后忽略迟到结果', async () => {
  vi.useFakeTimers()
  document.body.innerHTML = '<main data-conversation-content><div data-conversation-scroll><footer data-composer-seat><div data-composer-card><div id="overlay"></div><div data-input-scroll><div data-composer-input contenteditable="true"></div></div></div></footer></div></main>'
  const input = document.querySelector<HTMLElement>('[data-composer-input]')!
  let draft = { text: '原草稿', references: [] }
  const shell = {
    get draftSnapshot() { return draft },
    get snapshot() { return { draft: draft.text, phase: 'plain' } },
    setDraft(value: any) { draft = typeof value === 'string' ? { text: value, references: [] } : value; input.textContent = draft.text },
  }
  const oldClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  const writeText = vi.fn(async (_text: string) => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  const root = createRoot(document.getElementById('overlay')!)
  const shellOf = () => shell
  try {
    openComposerEdit({ sessionId: 'copy-edit', title: '回答副本', text: '回答', send: vi.fn() })
    act(() => root.render(createElement(ComposerEditSurface, { sessionId: 'copy-edit', shellOf })))
    shell.setDraft('修改后的回答')
    const button = document.querySelector<HTMLButtonElement>('[data-compose-copy]')!
    const originalLabel = button.getAttribute('aria-label')
    await act(async () => { button.click() })
    expect(writeText).toHaveBeenCalledWith('修改后的回答')
    expect(button.getAttribute('aria-label')).toBe('已复制')
    expect(button.querySelector('[data-test-check]')).not.toBeNull()
    expect(button.querySelector('[data-test-copy]')).toBeNull()
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    expect(button.getAttribute('aria-label')).toBe(originalLabel)
    expect(button.querySelector('[data-test-copy]')).not.toBeNull()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await act(async () => { button.click() })
    expect(button.getAttribute('aria-label')).toBe(originalLabel)
    expect(button.querySelector('[data-test-copy]')).not.toBeNull()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('复制失败')
    let resolve!: () => void
    writeText.mockImplementationOnce(() => new Promise<void>(done => { resolve = done }))
    await act(async () => { button.click() })
    expect(button.disabled).toBe(true)
    act(() => closeComposerEdit('copy-edit'))
    await act(async () => { resolve() })
    expect(document.querySelector('[data-compose-copy]')).toBeNull()
    expect(input.textContent).toBe('原草稿')
  } finally {
    act(() => root.unmount()); closeComposerEdit('copy-edit')
    if (oldClipboard) Object.defineProperty(navigator, 'clipboard', oldClipboard)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.useRealTimers(); document.body.replaceChildren()
  }
})
