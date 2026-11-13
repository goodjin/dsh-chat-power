import { afterEach, expect, it } from 'vitest'
import { ANSWER_FRAME_SELECTOR, answerFrameHeight, installAnswerFrame } from '../src/answer-frame.ts'

afterEach(() => { document.body.innerHTML = ''; document.head.innerHTML = '' })

it('隐藏视图不加框：保留图片、思考/工具节点、宿主隐藏态和节点位置', () => {
  document.body.innerHTML = `<main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="reasoning"><div data-slot="conversation.chat.node">思考</div></div>
    <div data-chat-flow-kind="assistant-step" data-turn-process-member="true" hidden><div data-slot="conversation.chat.node">中间回复</div></div>
    <div data-chat-flow-kind="tool-call"><div data-slot="conversation.chat.node">工具</div></div>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="response" id="answer"><div data-slot="conversation.chat.node" style="display:contents">回答<img src="data:," /></div></div>
  <div data-turn-tail="1"></div><div data-turn-tail="2"></div><div data-turn-tail="3"></div></main>`
  const before = document.body.innerHTML
  const answer = document.getElementById('answer')!
  const stop = installAnswerFrame(document)
  expect([...document.querySelectorAll(ANSWER_FRAME_SELECTOR)]).toEqual([answer])
  expect(getComputedStyle(answer).borderTopWidth).not.toBe('1px')
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
    <div data-turn-tail="1"></div><div data-turn-tail="2"></div><div data-turn-tail="3"></div></main>`
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
  <div data-turn-tail="1"></div><div data-turn-tail="2"></div><div data-turn-tail="3"></div></main></section>`
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

it('复制图标反馈成功及剪贴板拒绝，始终恢复按钮可用状态', async () => {
  const { vi } = await import('vitest')
  vi.useFakeTimers()
  document.body.innerHTML = `<section data-conversation-session="s1"><main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-node-key="answer-1" data-chat-turn="1" id="answer">正文</div>
  <div data-turn-tail="1"></div><div data-turn-tail="2"></div><div data-turn-tail="3"></div></main></section>`
  Object.defineProperty(document.querySelector('main'), 'clientHeight', { value: 800 })
  const calls: string[][] = []
  let denied = false
  const stop = installAnswerFrame(document, () => {}, undefined, async (id, key) => {
    calls.push([id, key])
    if (denied) throw new Error('剪贴板访问被拒绝')
  })
  try {
    const copy = document.querySelector<HTMLButtonElement>('[data-chat-power-answer-copy]')!
    expect(copy.querySelector('svg')).not.toBeNull()
    copy.click()
    await Promise.resolve()
    expect(calls).toEqual([['s1', 'answer-1']])
    expect(copy.getAttribute('aria-label')).toBe('已复制')
    expect(copy.querySelector('rect')).toBeNull()
    expect(copy.disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(1500)
    expect(copy.querySelector('rect')).not.toBeNull()
    expect(copy.getAttribute('aria-label')).toBe('复制结果')
    denied = true
    copy.click()
    await Promise.resolve()
    expect(document.querySelector('[role="status"]')?.textContent).toBe('剪贴板访问被拒绝')
    expect(copy.querySelector('rect')).not.toBeNull()
    expect(copy.disabled).toBe(false)
  } finally { stop(); vi.useRealTimers() }
})

it('整框预算包含标题与内边距，最后一轮再为原生尾部操作栏留位', () => {
  expect(answerFrameHeight(800, 200, true, 48)).toBe(528)
  expect(answerFrameHeight(800, 200, false, 48)).toBe(776)
  document.body.innerHTML = `<section data-conversation-session="s1"><main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-turn="1" id="answer">正文</div>
    <div data-chat-flow-kind="turn-tail" id="tail">原生操作栏</div>
    <div data-composer-seat></div>
  <div data-turn-tail="1"></div><div data-turn-tail="2"></div><div data-turn-tail="3"></div></main></section>`
  const main = document.querySelector('main')!
  Object.defineProperty(main, 'clientHeight', { value: 800 })
  const answer = document.getElementById('answer')!
  answer.getBoundingClientRect = () => ({ bottom: 600, height: 500 }) as DOMRect
  document.getElementById('tail')!.getBoundingClientRect = () => ({ bottom: 648, height: 32 }) as DOMRect
  document.querySelector<HTMLElement>('[data-composer-seat]')!.getBoundingClientRect = () => ({ height: 200 }) as DOMRect
  const stop = installAnswerFrame(document, () => {})
  try {
    expect(answer.style.getPropertyValue('--chat-power-answer-height')).toBe('528px')
    expect(getComputedStyle(answer).boxSizing).toBe('border-box')
    expect(getComputedStyle(answer).paddingTop).toBe('0px')
    const header = answer.querySelector<HTMLElement>('[data-chat-power-answer-header]')!
    expect(getComputedStyle(header).top).toBe('0px')
    expect(getComputedStyle(header).marginTop).toBe('0px')
  } finally { stop() }
})

it('流式时无框和标题，只有整轮结束才装饰；结束事件先到也会补查，切会话不串状态', async () => {
  const { vi } = await import('vitest')
  vi.useFakeTimers()
  document.body.innerHTML = `<section data-conversation-session="s1"><main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-turn="1" data-chat-node-key="a"><p>正在输出</p></div>
  </main></section>`
  const main = document.querySelector('main')!
  Object.defineProperty(main, 'clientHeight', { value: 800 })
  const row = document.querySelector<HTMLElement>('[data-chat-node-key]')!
  const native = row.firstElementChild
  let ended = false
  const readEnded = vi.fn((id: string, turn: number) => id === 's1' && turn === 1 && ended)
  const stop = installAnswerFrame(document, () => {}, undefined, undefined, undefined, readEnded)
  try {
    expect(row.querySelector('[data-chat-power-answer-header]')).toBeNull()
    expect(getComputedStyle(row).borderTopWidth).not.toBe('1px')
    expect(row.style.getPropertyValue('--chat-power-answer-height')).toBe('')
    native!.textContent = '更多文字，不代表结束'
    await vi.advanceTimersByTimeAsync(30)
    expect(row.querySelector('[data-chat-power-answer-header]')).toBeNull()
    ended = true // 无 DOM 变动的结束事件也能触发加框
    await vi.advanceTimersByTimeAsync(1020)
    expect(row.querySelector('[data-chat-power-answer-header]')).not.toBeNull()
    expect(getComputedStyle(row).borderTopWidth).toBe('1px')
    expect(native!.parentElement).toBe(row)
    document.querySelector('section')!.setAttribute('data-conversation-session', 's2')
    await vi.advanceTimersByTimeAsync(30)
    expect(row.querySelector('[data-chat-power-answer-header]')).toBeNull()
    expect(row.hasAttribute('data-chat-power-answer-ready')).toBe(false)
    expect(native!.parentElement).toBe(row)
  } finally { stop(); vi.useRealTimers() }
})
