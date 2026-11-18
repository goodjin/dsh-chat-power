/**
 * 工具标签激活期间的会话滚动位置保管。
 *
 * 现场（2026-11-18）：打开文件标签时宿主视图被收起，会话滚动层内容塌缩、
 * scrollTop 被钳到 0；退出时视图恢复，但没人把滚动位置写回去——会话停在
 * 历史开头。保管器在收起前记下位置，退出后写回去。
 *
 * 刻度用普通对象测（jsdom 没有布局，clientHeight/scrollHeight 恒为 0，
 * 钳制数学测不了）；会话归属用 closest 假件。
 */
import { describe, expect, it } from 'vitest'
import { createConversationScrollKeeper, type ConversationScrollTarget } from '../src/tools-scroll.ts'

/** 最小滚动层假件：刻度可设，会话归属可换。 */
function target(sessionId: string, dims: { top: number; scrollHeight: number; clientHeight: number }): ConversationScrollTarget & { session: string } {
  const el = {
    scrollTop: dims.top,
    scrollHeight: dims.scrollHeight,
    clientHeight: dims.clientHeight,
    session: sessionId,
    getAttribute(name: string): string | null {
      return name === 'data-conversation-session' ? el.session : null
    },
    closest(selector: string): { getAttribute(name: string): string | null } | null {
      if (selector !== '[data-conversation-session]') return null
      return { getAttribute: (name: string) => el.getAttribute(name) }
    },
  }
  return el
}

describe('createConversationScrollKeeper', () => {
  it('收起前记下的刻度，退出后原样写回（中间位置）', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 500, scrollHeight: 3000, clientHeight: 600 })
    keeper.capture(el, 's1')
    // 塌缩期间 scrollTop 被钳到 0（浏览器行为，这里直接模拟结果）。
    el.scrollTop = 0
    expect(keeper.restore(el)).toBe(true)
    expect(el.scrollTop).toBe(500)
  })

  it('原先贴底：退出后仍贴底（哪怕期间内容长高了）', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 2400, scrollHeight: 3000, clientHeight: 600 })
    keeper.capture(el, 's1') // 距底 0 ≤ 24 → 贴底
    el.scrollTop = 0
    el.scrollHeight = 4000 // 期间来了新消息
    expect(keeper.restore(el)).toBe(true)
    expect(el.scrollTop).toBe(3400) // 新内容下的最底
  })

  it('在中间：内容变矮时钳到可见范围，不写出界', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 500, scrollHeight: 3000, clientHeight: 600 })
    keeper.capture(el, 's1')
    el.scrollHeight = 900
    expect(keeper.restore(el)).toBe(true)
    expect(el.scrollTop).toBe(300) // max = 900 - 600
  })

  it('滚动层已换属别的会话（激活期间切了会话）：不写旧刻度', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 500, scrollHeight: 3000, clientHeight: 600 })
    keeper.capture(el, 's1')
    el.scrollTop = 123
    el.session = 's2'
    expect(keeper.restore(el)).toBe(false)
    expect(el.scrollTop).toBe(123)
  })

  it('没有记过刻度（直接回到会话）：不写', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 0, scrollHeight: 3000, clientHeight: 600 })
    expect(keeper.restore(el)).toBe(false)
  })

  it('写回是一次性的：同一元素再 restore 不重复写', () => {
    const keeper = createConversationScrollKeeper()
    const el = target('s1', { top: 500, scrollHeight: 3000, clientHeight: 600 })
    keeper.capture(el, 's1')
    expect(keeper.restore(el)).toBe(true)
    el.scrollTop = 7
    expect(keeper.restore(el)).toBe(false)
    expect(el.scrollTop).toBe(7)
  })
})
