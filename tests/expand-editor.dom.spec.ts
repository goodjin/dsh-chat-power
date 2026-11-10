// @vitest-environment jsdom
/**
 * 输入框「大编辑区」的**真实 React 渲染**回归（jsdom + 真 react-dom，不挂 setup.ts 的哑代理）。
 *
 * 断言组件把状态真正落到 DOM：一枚向上箭头浮钮；点了给宿主 composer 卡片挂上撑高标记、
 * 再点收起；**大编辑区里普通回车被改写成软换行**（合成 Shift+回车喂给宿主输入框）、
 * 宿主小框的回车行为原样保留；样式注入命中宿主锚点。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// 原语包的图标会传递性引入 .module.css，jsdom 的 vite 不转译 CSS；这里把图标换成
// 同名桩组件（不渲染真实 SVG）。dom 配置不挂 setup.ts 的整包 mock，本测试自己声明。
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = (props: { size?: number }) => createElement('span', { 'data-icon-size': props.size })
  return {
    IconChevronUpOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
  }
})

import { ExpandEditor, BIG_CLASS, COMPOSER_SIZE_TAG, injectComposerSizeCss } from '../src/expand-editor.tsx'
import { fallbackT } from '../src/locales.ts'

;(globalThis as { IS_REACT_ATT_ENVIRONMENT?: boolean }).IS_REACT_ATT_ENVIRONMENT = true

let container: HTMLElement
let content: HTMLElement
let card: HTMLElement
let input: HTMLElement
let root: Root

beforeEach(() => {
  // 宿主结构桩：会话内容区（带 phase）+ composer 卡片 + 输入框（Lexical 内容editable）。
  content = document.createElement('div')
  content.dataset.conversationContent = ''
  document.body.appendChild(content)
  card = document.createElement('div')
  card.dataset.composerCard = ''
  content.appendChild(card)
  input = document.createElement('div')
  input.dataset.composerInput = ''
  input.setAttribute('contenteditable', 'true')
  card.appendChild(input)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => { root.unmount() })
  container.remove()
  content.remove()
})

const render = async (): Promise<void> => {
  await act(async () => {
    root.render(createElement(ExpandEditor, { t: fallbackT }))
  })
}

const toggle = async (): Promise<void> => {
  const el = document.querySelector<HTMLButtonElement>('[data-expand-toggle]')
  if (el === null) throw new Error('no toggle button')
  await act(async () => { el.click() })
}

/** 在输入框上派发一次回车，冲刷拦截逻辑。 */
const pressEnter = (shift = false): KeyboardEvent => {
  const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', shiftKey: shift, bubbles: true, cancelable: true })
  input.dispatchEvent(event)
  return event
}

describe('ExpandEditor 浮钮', () => {
  it('渲染一枚向上箭头浮钮，没有自带编辑区', async () => {
    await render()
    expect(document.querySelector('[data-expand-toggle]')).not.toBeNull()
    // 不渲染 textarea——编辑区就是宿主自己的 composer。
    expect(document.querySelector('textarea')).toBeNull()
  })
})

describe('ExpandEditor 撑高 / 收起', () => {
  it('点浮钮给宿主 composer 卡片挂上撑高标记，再点收起', async () => {
    await render()
    expect(card.classList.contains(BIG_CLASS)).toBe(false)
    await toggle()
    expect(card.classList.contains(BIG_CLASS)).toBe(true)
    expect(document.querySelector('[data-expand-toggle]')?.hasAttribute('data-big')).toBe(true)
    await toggle()
    expect(card.classList.contains(BIG_CLASS)).toBe(false)
    expect(document.querySelector('[data-expand-toggle]')?.hasAttribute('data-big')).toBe(false)
  })

  it('没有 composer 卡片时点浮钮不报错', async () => {
    card.remove()
    await render()
    await expect(toggle()).resolves.toBeUndefined()
  })
})

describe('ExpandEditor 回车改写', () => {
  it('大编辑区：普通回车被改写成软换行（preventDefault + 合成 Shift+回车喂给宿主输入框）', async () => {
    await render()
    await toggle() // 撑高 → 进入大编辑区
    const spy = vi.spyOn(input, 'dispatchEvent')
    const event = pressEnter()
    expect(event.defaultPrevented).toBe(true)
    const synthetic = spy.mock.calls
      .map(call => call[0] as KeyboardEvent)
      .find(e => e.shiftKey === true && e.key === 'Enter')
    expect(synthetic, '应合成一个 Shift+回车喂给宿主输入框').toBeDefined()
  })

  it('hero 阶段（新会话）无需展开也回车换行', async () => {
    content.dataset.contentPhase = 'hero'
    await render()
    const spy = vi.spyOn(input, 'dispatchEvent')
    const event = pressEnter()
    expect(event.defaultPrevented).toBe(true)
    expect(spy.mock.calls.some(call => (call[0] as KeyboardEvent).shiftKey === true)).toBe(true)
  })

  it('宿主小框（非 hero、未展开）：普通回车原样放行，不拦截', async () => {
    content.dataset.contentPhase = 'composer'
    await render()
    const spy = vi.spyOn(input, 'dispatchEvent')
    const event = pressEnter()
    expect(event.defaultPrevented).toBe(false)
    expect(spy.mock.calls.some(call => (call[0] as KeyboardEvent).shiftKey === true)).toBe(false)
  })

  it('大编辑区里 Shift+回车仍放过（交给宿主 / Lexical 原生换行，不另合成）', async () => {
    await render()
    await toggle()
    const spy = vi.spyOn(input, 'dispatchEvent')
    const event = pressEnter(true)
    expect(event.defaultPrevented).toBe(false)
    // 只派发了一次（即真实事件本身），拦截器没有再合成软换行事件。
    expect(spy.mock.calls.length).toBe(1)
  })
})

describe('composer 撑高样式注入', () => {
  it('注入一次，含宿主锚点选择器与半屏高度', () => {
    injectComposerSizeCss()
    const style = document.querySelector(`style[data-plugin-css="${COMPOSER_SIZE_TAG}"]`)
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain('[data-composer-card].dshcp-big')
    expect(style?.textContent).toContain('50vh')
    // 幂等：重复注入不再加第二份。
    injectComposerSizeCss()
    expect(document.querySelectorAll(`style[data-plugin-css="${COMPOSER_SIZE_TAG}"]`).length).toBe(1)
  })
})
