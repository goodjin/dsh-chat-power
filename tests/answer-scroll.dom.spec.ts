import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createAnswerScrollMemory } from '../src/answer-scroll.ts'

let stop: (() => void) | undefined
beforeEach(() => vi.useFakeTimers())
afterEach(() => { stop?.(); stop = undefined; document.body.innerHTML = ''; vi.useRealTimers() })
function scene(id: string) {
  document.body.innerHTML = `<section data-conversation-session="${id}"><main data-conversation-scroll><article data-answer data-chat-node-key="answer-1"></article></main></section>`
  const outer = document.querySelector('main')!
  const inner = document.querySelector('article')!
  let total = 2000
  Object.defineProperties(outer, { clientHeight: { value: 600 }, scrollHeight: { get: () => total } })
  Object.defineProperties(inner, { clientHeight: { value: 300 }, scrollHeight: { value: 1000 } })
  return { outer, inner, grow: (value: number) => { total = value } }
}
function scroll(el: HTMLElement, top: number) { el.scrollTop = top; el.dispatchEvent(new Event('scroll')) }

it('切回后在框高变化及宿主延迟恢复之后保持外层底部和框内底部', async () => {
  const memory = createAnswerScrollMemory(document, '[data-answer]'); stop = memory.dispose
  let a = scene('a'); memory.refresh()
  scroll(a.outer, 1400); scroll(a.inner, 700)
  const b = scene('b'); memory.refresh(); scroll(b.outer, 300)
  a = scene('a'); memory.refresh()
  expect(a.outer.scrollTop).toBe(1400)
  expect(a.inner.scrollTop).toBe(700)
  a.grow(2400)
  scroll(a.outer, 500) // 宿主还在以旧布局恢复位置，不能覆盖保存的贴底意图。
  memory.refresh()
  await vi.advanceTimersByTimeAsync(250)
  expect(a.outer.scrollTop).toBe(1800)
  expect(a.inner.scrollTop).toBe(700)
})
it('中间阅读位置交给宿主，框内位置按会话分别恢复', () => {
  const memory = createAnswerScrollMemory(document, '[data-answer]'); stop = memory.dispose
  let a = scene('a'); memory.refresh(); scroll(a.outer, 400); scroll(a.inner, 250)
  let b = scene('b'); memory.refresh(); scroll(b.outer, 700); scroll(b.inner, 100)
  a = scene('a'); a.outer.scrollTop = 410; memory.refresh()
  expect(a.outer.scrollTop).toBe(410)
  expect(a.inner.scrollTop).toBe(250)
  b = scene('b'); b.outer.scrollTop = 710; memory.refresh()
  expect(b.outer.scrollTop).toBe(710)
  expect(b.inner.scrollTop).toBe(100)
})
it('主动向上滚动会取消恢复，复用容器时旧事件不会污染另一会话', async () => {
  const memory = createAnswerScrollMemory(document, '[data-answer]'); stop = memory.dispose
  let a = scene('a'); memory.refresh(); scroll(a.outer, 1400)
  document.querySelector('section')!.setAttribute('data-conversation-session', 'b')
  scroll(a.outer, 0) // 容器已换会话，旧 binding 尚未刷新。
  memory.refresh()
  a = scene('a'); memory.refresh()
  expect(a.outer.scrollTop).toBe(1400)
  a.outer.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }))
  scroll(a.outer, 1000)
  await vi.advanceTimersByTimeAsync(300)
  expect(a.outer.scrollTop).toBe(1000)
})
