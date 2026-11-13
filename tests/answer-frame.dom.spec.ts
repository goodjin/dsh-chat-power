import { afterEach, expect, it } from 'vitest'
import { ANSWER_FRAME_SELECTOR, installAnswerFrame } from '../src/answer-frame.ts'

afterEach(() => { document.body.innerHTML = ''; document.head.innerHTML = '' })

it('只框住原生回答：保留图片、思考/工具节点、宿主隐藏态和节点位置', () => {
  document.body.innerHTML = `<main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="reasoning"><div data-slot="conversation.chat.node">思考</div></div>
    <div data-chat-flow-kind="assistant-step" data-turn-process-member="true" hidden><div data-slot="conversation.chat.node">中间回复</div></div>
    <div data-chat-flow-kind="tool-call"><div data-slot="conversation.chat.node">工具</div></div>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="response" id="answer"><div data-slot="conversation.chat.node" style="display:contents">回答<img src="data:," /></div></div>
  </main>`
  const before = document.body.innerHTML
  const answer = document.getElementById('answer')!
  const stop = installAnswerFrame(document)
  expect([...document.querySelectorAll(ANSWER_FRAME_SELECTOR)]).toEqual([answer])
  expect(getComputedStyle(answer).borderTopWidth).toBe('1px')
  expect(document.body.innerHTML).toBe(before)
  // 流式替换正文无需插件观察器或搬运；同一原生槽位继续承载内容。
  answer.append('继续输出')
  expect(document.querySelector(ANSWER_FRAME_SELECTOR)).toBe(answer)
  stop()
  expect(document.head.querySelector('style')).toBeNull()
  expect(answer.textContent).toBe('回答继续输出')
})

it('历史整页、最后一轮扣输入框；输入框变化、新轮开始和卸载均正确处理', async () => {
  const { vi } = await import('vitest')
  vi.useFakeTimers()
  let notifyResize: () => void = () => {}
  const previousResize = window.ResizeObserver
  const disconnect = vi.fn()
  window.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { notifyResize = () => callback([], this) }
    observe() {}
    unobserve() {}
    disconnect = disconnect
  }
  let stop: (() => void) | undefined
  try {
    document.body.innerHTML = `<main data-conversation-scroll>
      <div data-chat-flow-kind="assistant-step" data-chat-turn="1" id="old"><div>历史回答</div></div>
      <div data-chat-flow-kind="assistant-step" data-chat-turn="2" id="latest"><div>最新回答<img src="data:," /></div></div>
      <div data-composer-seat></div>
    </main>`
    const container = document.querySelector('main')!
    Object.defineProperty(container, 'clientHeight', { value: 800, configurable: true })
    let composerHeight = 200
    const composer = document.querySelector<HTMLElement>('[data-composer-seat]')!
    composer.getBoundingClientRect = () => ({ height: composerHeight }) as DOMRect
    const old = document.getElementById('old')!
    const latest = document.getElementById('latest')!
    const native = latest.firstElementChild
    const height = (el: HTMLElement) => el.style.getPropertyValue('--chat-power-answer-height')
    stop = installAnswerFrame(document)
    expect(height(old)).toBe('776px')
    expect(height(latest)).toBe('576px')
    expect(getComputedStyle(latest).overflowY).toBe('auto')
    composerHeight = 320
    notifyResize()
    await vi.advanceTimersByTimeAsync(20)
    expect(height(latest)).toBe('456px')
    expect(height(old)).toBe('776px')
    const user = document.createElement('div')
    user.setAttribute('data-chat-turn', '3')
    container.insertBefore(user, composer)
    await vi.advanceTimersByTimeAsync(20)
    expect(height(latest)).toBe('776px')
    // 重新归为过程的节点立即解除插件高度约束。
    latest.setAttribute('data-turn-process-member', 'true')
    await vi.advanceTimersByTimeAsync(20)
    expect(height(latest)).toBe('')
    expect(latest.firstElementChild).toBe(native)
    expect(container.scrollTop).toBe(0)
    stop()
    expect(height(old)).toBe('')
    expect(disconnect).toHaveBeenCalled()
  } finally {
    stop?.()
    window.ResizeObserver = previousResize
    vi.useRealTimers()
  }
})

it('标题栏编辑绑定所在会话和节点，保留原生子树，失败就地提示并可清理', () => {
  document.body.innerHTML = `<section data-conversation-session="s1"><main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-node-key="answer-1" data-chat-turn="3" id="answer"><div data-slot="conversation.chat.node">正文</div></div>
  </main></section>`
  Object.defineProperty(document.querySelector('main'), 'clientHeight', { value: 800 })
  const row = document.getElementById('answer')!
  const native = row.firstElementChild!
  const calls: string[][] = []
  const stop = installAnswerFrame(document, (sessionId, key) => {
    calls.push([sessionId, key])
    throw new Error('请先完成当前编辑')
  })
  const button = row.querySelector<HTMLButtonElement>('[data-chat-power-answer-edit]')!
  expect(button.type).toBe('button')
  expect(button.querySelector('svg')).not.toBeNull()
  expect(button.textContent).toBe('')
  expect(button.getAttribute('aria-label')).toBe('编辑回答副本')
  expect(row.querySelector('[data-chat-power-answer-title]')?.textContent).toBe('第 3 轮 · 用时未知')
  button.click()
  expect(calls).toEqual([['s1', 'answer-1']])
  expect(row.querySelector('[role="status"]')?.textContent).toBe('请先完成当前编辑')
  expect(native.parentElement).toBe(row)
  expect(native.textContent).toBe('正文')
  stop()
  expect(row.firstElementChild).toBe(native)
  expect(row.querySelector('button')).toBeNull()
})
