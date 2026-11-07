/**
 * 轮次折叠与当前轮限高：纯逻辑部分。
 *
 * 仓库没有 jsdom，DOM 相关行为走源码级约束（与 bundle.spec 同路数）；
 * 这里钉住的是能脱离 DOM 验证的算法：按轮次号分组、首句摘要、时刻格式化、
 * 限高分摊。
 */

import { describe, expect, it } from 'vitest'
import {
  distributeHeightCap,
  formatClock,
  groupTurnsByNumber,
  summarizeTurn,
} from '../src/turn-fold.ts'

/** 最小行面：只要轮次号与文本，便于构造假行。 */
function row(turn: number | null, text = ''): { getAttribute(name: string): string | null; textContent: string | null } {
  return {
    getAttribute: (name: string) => (name === 'data-chat-turn' && turn !== null ? String(turn) : null),
    textContent: text,
  }
}

describe('轮次分组', () => {
  it('按 data-chat-turn 分组，组内保持行序、组间保持首次出现顺序', () => {
    const groups = groupTurnsByNumber([
      row(1, '第一轮用户'), row(2, '第二轮用户'), row(1, '第一轮回答'), row(2, '第二轮回答'),
    ])
    expect(groups.map(group => group.number)).toEqual([1, 2])
    expect(groups[0]!.rows).toHaveLength(2)
    expect(groups[1]!.rows).toHaveLength(2)
  })

  it('没有轮次标记的行不参与分组', () => {
    const groups = groupTurnsByNumber([row(null, '孤儿'), row(3, '第三轮')])
    expect(groups.map(group => group.number)).toEqual([3])
  })

  it('轮次号非法（非数字）时同样忽略', () => {
    const groups = groupTurnsByNumber([{ getAttribute: () => 'x', textContent: '坏号' }, row(4, '第四轮')])
    expect(groups.map(group => group.number)).toEqual([4])
  })
})

describe('首句摘要', () => {
  it('取该轮第一段非空文本，压缩空白', () => {
    expect(summarizeTurn([row(1, '   '), row(1, '  你好\n  世界  ')])).toBe('你好 世界')
  })

  it('过长时截断并加省略号', () => {
    const text = summarizeTurn([row(1, '啊'.repeat(60))], 10)
    expect(text).toBe(`${'啊'.repeat(10)}…`)
  })

  it('整轮没有文本时返回空串', () => {
    expect(summarizeTurn([row(1, '  '), row(1, '')])).toBe('')
  })
})

describe('时刻格式化', () => {
  it('输出 HH:MM（本地时区、零填充）', () => {
    const at = new Date(2026, 10, 7, 9, 5).getTime()
    expect(formatClock(at)).toBe('09:05')
  })
})

describe('限高分摊', () => {
  it('合计不超过可用高度', () => {
    const caps = distributeHeightCap([400, 300, 200], 600)
    expect(caps.reduce((sum, cap) => sum + cap, 0)).toBeLessThanOrEqual(600)
  })

  it('总高不超可用高度时原样返回（不压行）', () => {
    expect(distributeHeightCap([100, 120], 600)).toEqual([100, 120])
  })

  it('超出时优先压最高的行，单行不会被压成 0', () => {
    const caps = distributeHeightCap([900, 100], 300)
    expect(caps[1]).toBe(100)
    expect(caps[0]!).toBeGreaterThan(0)
    expect(caps.reduce((sum, cap) => sum + cap, 0)).toBeLessThanOrEqual(300)
  })

  it('可用高度有下限，不会把内容压没', () => {
    const caps = distributeHeightCap([900, 900], 40)
    expect(Math.min(...caps)).toBeGreaterThan(0)
  })
})
