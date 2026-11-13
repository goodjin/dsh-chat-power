import { afterEach, expect, it, vi } from 'vitest'
import { installAnswerFrame } from '../src/answer-frame.ts'
import { answerTurnUsage, type AnswerSource } from '../src/answer-edit.ts'

afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; document.head.innerHTML = '' })

it('按会话和轮次读取原生结算；不同轮次不混用', () => {
  const usage = { totalTokens: 120, uncachedInputTokens: 100, outputTokens: 20 }
  const binding = vi.fn(() => ({ target: () => ({ getSnapshot: () => ({
    nodes: new Map(), timeline: { turns: new Map([[2, { data: new Map([['turn-tail', { tokenUsage: usage }]]) }]]) },
  }) }) }))
  const source: AnswerSource = { binding }
  expect(answerTurnUsage(source, 'session-a', 2)).toBe(usage)
  expect(binding).toHaveBeenCalledWith('session-a')
  expect(answerTurnUsage(source, 'session-a', 1)).toBeUndefined()
})

it('标题展示并更新用量，隐藏原生操作但保留文件和节点，卸载恢复', async () => {
  vi.useFakeTimers()
  document.body.innerHTML = `<section data-conversation-session="s"><main data-conversation-scroll>
    <article data-chat-flow-kind="assistant-step" data-chat-turn="2">回答</article>
    <div data-turn-tail="2"><div id="files">文件</div><div data-clock="end">点赞／用量</div></div>
  </main></section>`
  const container = document.querySelector('main')!
  Object.defineProperty(container, 'clientHeight', { value: 800 })
  const native = document.querySelector('[data-clock]')!
  const parent = native.parentElement
  let available = false
  const read = vi.fn(() => available ? { totalTokens: 120, uncachedInputTokens: 80, cacheReadTokens: 20, outputTokens: 20, reasoningTokens: 5 } : undefined)
  const stop = installAnswerFrame(document, () => {}, undefined, undefined, read)
  const details = document.querySelector('details')!
  expect(details.textContent).toContain('用量未知')
  expect(getComputedStyle(native).display).toBe('none')
  expect(getComputedStyle(document.querySelector('#files')!).display).not.toBe('none')
  available = true
  details.open = true
  await vi.advanceTimersByTimeAsync(1000)
  expect(read).toHaveBeenCalledWith('s', 2)
  expect(details.textContent).toContain('120 tok')
  expect(details.textContent).toContain('其中思考：5 tok')
  expect(details.open).toBe(true)
  expect(native.parentElement).toBe(parent)
  details.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  expect(details.open).toBe(false)
  stop()
  expect(document.querySelector('details')).toBeNull()
  expect(getComputedStyle(native).display).not.toBe('none')
})
