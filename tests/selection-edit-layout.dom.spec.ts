import { act, createElement, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconWarningOutlineRegular: () => null, Toast: () => null,
}))
vi.mock('../src/compose-card.tsx', () => ({
  ComposeCard: ({ children, onCancel }: { children: ReactNode; onCancel: () => void }) =>
    createElement('section', null, children, createElement('button', { onClick: onCancel }, '取消')),
}))
import { registerSelectionEditComposer } from '../src/selection-edit-card.tsx'
import { openSelectionEdit, closeSelectionEdit } from '../src/selection-actions.ts'
import { fallbackT } from '../src/locales.ts'
import type { MarkdownTurnReaders } from '../src/markdown-turn-sources.ts'

it('编辑卡进入正文流、排在输入框前；关闭后移除挂载点并保留消息', () => {
  document.body.innerHTML = '<main data-conversation-scroll><article>回答</article><footer data-composer-seat><div id="overlay"></div></footer></main>'
  const scroller = document.querySelector('main')!
  const message = document.querySelector('article')!
  let View: ComponentType = () => null
  registerSelectionEditComposer({
    inject: (_key, callback) => callback(),
    register: (_options, component) => { View = component as ComponentType; return () => {} },
  }, {} as MarkdownTurnReaders, fallbackT)
  openSelectionEdit('待编辑文本', false, undefined)
  const root = createRoot(document.getElementById('overlay')!)
  try {
    act(() => root.render(createElement(View)))
    const editor = document.querySelector('[data-selection-edit-cover]')!
    expect(editor.parentElement).toBe(scroller)
    expect(editor.nextElementSibling?.hasAttribute('data-composer-seat')).toBe(true)
    expect(document.querySelector('textarea')?.value).toBe('待编辑文本')
    act(() => document.querySelector('button')!.click())
    expect(document.querySelector('[data-selection-edit-cover]')).toBeNull()
    expect(message.parentElement).toBe(scroller)
  } finally {
    act(() => root.unmount())
    closeSelectionEdit()
    document.body.replaceChildren()
  }
})
