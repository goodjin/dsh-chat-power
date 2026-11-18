import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { Simulate } from 'react-dom/test-utils'
import { afterEach, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ComposerHeader } from '../src/composer-header.tsx'
import { acquireComposerHeader } from '../src/composer-header-mount.ts'
import { readShortcuts, SHORTCUT_KEY } from '../src/composer-shortcuts.ts'
import { openComposerEdit, closeComposerEdit } from '../src/composer-edit-state.ts'

afterEach(() => { document.body.innerHTML = ''; localStorage.clear(); vi.useRealTimers() })
it('卡内共享标题、快捷新增删除持久化、发送与分叉绑定当前会话，保留草稿节点', async () => {
  document.body.innerHTML = '<div data-composer-card><div id="overlay"></div><div data-composer-input>草稿</div><button id="native-send">发送</button></div>'
  const card = document.querySelector<HTMLElement>('[data-composer-card]')!
  const input = document.querySelector('[data-composer-input]')!
  const nativeSend = document.getElementById('native-send')!
  const root = createRoot(document.getElementById('overlay')!)
  const send = vi.fn(async () => {})
  const fork = vi.fn(async () => {})
  const click = async (text: string) => {
    const button = [...card.querySelectorAll('button')].find(el => (el.getAttribute('aria-label') ?? el.textContent) === text)!
    expect(button).toBeDefined()
    await act(async () => button.click())
  }
  try {
    vi.useFakeTimers()
    await act(async () => root.render(createElement(ComposerHeader, { sessionId: 's', actions: { send, fork }, canSend: true, canFork: true })))
    expect(card.firstElementChild?.hasAttribute('data-chat-power-composer-header')).toBe(true)
    expect(card.querySelector('time')).not.toBeNull()
    await click('快捷发送')
    await click('新增快捷方式')
    const textarea = card.querySelector('textarea')!
    await act(async () => Simulate.change(textarea, { target: { value: '我的快捷内容' } } as any))
    await click('保存')
    expect(readShortcuts(localStorage).at(-1)?.text).toBe('我的快捷内容')
    await click('我的快捷内容')
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('s', '我的快捷内容')
    expect(input.textContent).toBe('草稿')
    expect(document.getElementById('native-send')).toBe(nativeSend)
    // 发送成功不写进标题栏（用户要求），改成底部浮一条回执，1.6 秒后自消。
    expect(card.querySelector('.chat-power-composer-notice')).toBeNull()
    expect(document.querySelector('[data-composer-toast]')?.textContent).toBe('已发送')
    await act(async () => { vi.advanceTimersByTime(1700) })
    expect(document.querySelector('[data-composer-toast]')).toBeNull()
    await click('分叉')
    expect(fork).toHaveBeenCalledTimes(1)
    expect(fork).toHaveBeenCalledWith('s')
    // 收起输入框：标题栏换成小横条，卡片打上收起标记。
    await click('收起输入框')
    expect(card.hasAttribute('data-chat-power-collapsed')).toBe(true)
    expect(card.querySelector('.chat-power-composer-collapsed')).not.toBeNull()
    expect(card.querySelector('.chat-power-composer-title')).toBeNull()
    // 再点展开：标记与横条都退掉，回到标题栏。
    await click('展开输入框')
    expect(card.hasAttribute('data-chat-power-collapsed')).toBe(false)
    expect(card.querySelector('.chat-power-composer-title')).not.toBeNull()
    await click('快捷发送')
    while (card.querySelector('button[aria-label^="删除："]')) {
      const button = card.querySelector<HTMLButtonElement>('button[aria-label^="删除："]')!
      await act(async () => button.click())
    }
    expect(localStorage.getItem(SHORTCUT_KEY)).toBe('[]')
    expect(readShortcuts(localStorage)).toEqual([])
    // 编辑模式与普通模式共享一个 mount；退出后常驻标题恢复。
    const editMount = acquireComposerHeader(card)
    expect(card.querySelectorAll('[data-chat-power-composer-header]')).toHaveLength(1)
    await act(async () => { openComposerEdit({ sessionId: 's', title: '编辑副本', text: '内容', send }) })
    expect(card.querySelector('.chat-power-composer-title')).toBeNull()
    editMount.release()
    await act(async () => closeComposerEdit('s'))
    expect(card.querySelector('.chat-power-composer-title')).not.toBeNull()
  } finally { await act(async () => root.unmount()); closeComposerEdit('s') }
  expect(card.querySelector('[data-chat-power-composer-header]')).toBeNull()
  expect(input.parentElement).toBe(card)
})

it('大编辑区时「收起输入框」按钮被样式藏掉（不与浮钮的向下箭头撞形）', async () => {
  // 2026-11-18 现场：输入框撑成半屏后，标题栏里有两个向下箭头——「收起输入框」
  // 的图标与浮钮翻成的向下箭头。大编辑区时前者先藏起来。
  document.body.innerHTML = '<div data-composer-card><div id="overlay"></div><div data-composer-input>草稿</div></div>'
  const card = document.querySelector<HTMLElement>('[data-composer-card]')!
  const root = createRoot(document.getElementById('overlay')!)
  const send = vi.fn(async () => {})
  try {
    await act(async () => root.render(createElement(ComposerHeader, { sessionId: 's', actions: { send, fork: send } })))
    const collapse = card.querySelector<HTMLButtonElement>('[data-composer-collapse]')
    expect(collapse).not.toBeNull()
    // 小框时它在。
    expect(card.classList.contains('dshcp-big')).toBe(false)
    // 撑成大编辑区：卡片挂上 dshcp-big，样式据此把该按钮藏掉。
    await act(async () => { card.classList.add('dshcp-big') })
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'composer-header.module.css'), 'utf8')
    expect(css).toMatch(/:global\(\[data-composer-card\]\.dshcp-big\)\s+\[data-composer-collapse\]\s*\{[^}]*display:\s*none/)
  } finally { await act(async () => root.unmount()) }
})
