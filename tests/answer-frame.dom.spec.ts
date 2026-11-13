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
