import { readFileSync } from 'node:fs'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconFolderOpenOutlineRegular: () => null, IconCheckOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null, IconCopyOutlineRegular: () => null,
  IconNewChatOutlineRegular: () => null, IconSendOutlineRegular: () => null,
}))
import { BIG_CLASS } from '../src/expand-editor.tsx'
import { ComposerEditSurface, ComposerEditNewSession } from '../src/composer-edit.tsx'
import { openComposerEdit, closeComposerEdit } from '../src/composer-edit-state.ts'
it.each([false, true])('restores the original composer and its expanded state (%s) on exit', async (wasExpanded) => {
  document.body.innerHTML = '<main data-conversation-content><div data-conversation-scroll><article>回答</article><footer data-composer-seat><div data-composer-card><div id="overlay"></div><div data-input-scroll><div data-composer-input contenteditable="true"></div></div><div id="native-row"><button id="model">模型</button><span id="right"></span><button id="native-send">发送</button><span id="info">输入框信息</span></div></div></footer></div></main>'
  const style = document.createElement('style')
  style.textContent = '[data-composer-card]{width:720px;padding:12px;border-radius:24px}#native-row{display:flex}' + readFileSync('src/composer-edit.module.css', 'utf8').replace(/:global\(([^)]+)\)/g, '$1')
  document.body.append(style)
  const input = document.querySelector<HTMLElement>('[data-composer-input]')!
  document.querySelector('[data-composer-card]')!.classList.toggle(BIG_CLASS, wasExpanded)
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
    openComposerEdit({ sessionId: 'dom-edit', title: 'example.ts', text: '\tconst n = 1\n', send: vi.fn(), save: vi.fn(), reveal })
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
    expect(Number.parseFloat(cardStyle.height)).toBeCloseTo(window.innerHeight * 0.6)
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
    await act(async () => { (document.querySelector('[data-local-reveal]') as HTMLElement).click() })
    expect(reveal).toHaveBeenCalledTimes(1)
    act(() => (document.querySelector('[data-compose-cancel]') as HTMLElement).click())
    expect(input.textContent).toBe('原草稿')
    expect(document.querySelector('[data-compose-edit]')).toBeNull()
    expect(document.querySelector('[data-composer-card]')?.classList.contains(BIG_CLASS)).toBe(wasExpanded)
    expect(document.querySelector('[data-compose-edit-head]')).toBeNull()
  } finally {
    act(() => { footerRoot.unmount(); root.unmount() }); closeComposerEdit('dom-edit'); document.body.replaceChildren()
  }
})
