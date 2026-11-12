import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LinkSettingsSection, registerLinkSettings } from '../src/link-settings.tsx'
import { DEFAULT_LINK_OPEN_KEY, defaultLinkOpenMode } from '../src/link-open.ts'
import { en, makeT } from '../src/locales.ts'

beforeEach(() => {
  // Node's global localStorage is unavailable in this runner; provide browser storage semantics.
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    clear: () => values.clear(),
  })
})
let root: Root | undefined
function render() {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(createElement(LinkSettingsSection)))
  return container
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('链接设置段', () => {
  it('使用 settings.section 生命周期注册，未挂会话头部', () => {
    const register = vi.fn()
    const inject = vi.fn((_key, callback) => callback())
    registerLinkSettings({ register, inject, entries: () => [], subscribe: () => () => {} })
    expect(inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'settings.section', id: 'chat-power', locale: 'chatPower' }), LinkSettingsSection)
    expect(register).toHaveBeenCalledTimes(1)
  })
  it.each([null, 'invalid', 'right', 'browser'])('恢复旧键值 %s，并立即改变链接消费者读取的偏好', stored => {
    if (stored !== null) localStorage.setItem(DEFAULT_LINK_OPEN_KEY, stored)
    const container = render()
    const right = container.querySelector<HTMLInputElement>('input[value="right"]')!
    const browser = container.querySelector<HTMLInputElement>('input[value="browser"]')!
    expect(right.checked).toBe(stored !== 'browser')
    expect(browser.checked).toBe(stored === 'browser')
    expect(container.textContent).toContain('网页链接默认打开方式')
    expect(container.textContent).toContain('右侧预览')
    act(() => browser.click())
    expect(defaultLinkOpenMode()).toBe('browser')
    expect(browser.checked).toBe(true)
    act(() => right.click())
    expect(defaultLinkOpenMode()).toBe('right')
    expect(right.checked).toBe(true)
    expect(localStorage.getItem(DEFAULT_LINK_OPEN_KEY)).toBe('right')
  })
  it('接受宿主翻译函数并渲染英文选项', () => {
    const container = render()
    act(() => root!.render(createElement(LinkSettingsSection, { t: makeT(en) })))
    expect(container.textContent).toContain('Default web link opening')
    expect(container.textContent).toContain('External browser')
  })
})
