/**
 * 回答框的高度在「视口太矮」时的表现（2026-11-19 现场）。
 *
 * 回答框按会话视口的高度固定（每轮一框）。视口够高时没问题；视口太矮时
 * 算出来的高度会变成负数、被兜底成 80px 的小条——框里只剩标题，正文被压到
 * 看不见（web 版的小窗口上，历史轮次全成了小框）。
 *
 * 修法：**太矮就不写固定高度**——框按内容自然展开（页面自己滚），内容看得见。
 * 正常高度时行为一点不变。
 */
import { describe, expect, it } from 'vitest'
import { answerFrameHeight } from '../src/answer-frame.ts'

describe('回答框高度：视口太矮时不压成小条', () => {
  it('正常视口：照旧按视口算（最新一轮再扣输入框与尾巴）', () => {
    expect(answerFrameHeight(800, 200, true, 48)).toBe(528)
    expect(answerFrameHeight(800, 200, false, 48)).toBe(776)
  })

  it('视口够高时仍按视口算', () => {
    expect(answerFrameHeight(1024, 300, false)).toBe(1000)
  })

  it('视口太矮：不算固定高度（undefined），让框按内容展开', () => {
    // 视口 120px：算出来是 96，低于可用下限。
    expect(answerFrameHeight(120, 0, false)).toBeUndefined()
  })

  it('最新一轮被输入框与尾巴吃光时同样不压成小条', () => {
    // 视口 300、输入框 349（空会话时输入框占大半屏）：算出来是负数。
    expect(answerFrameHeight(300, 349, true, 0)).toBeUndefined()
  })

  it('可用下限之内仍给固定高度（下限本身是可读的高度）', () => {
    // 视口 400 → 376，够读，就按视口算。
    expect(answerFrameHeight(400, 0, false)).toBe(376)
    // 视口 260 → 236，低于下限。
    expect(answerFrameHeight(260, 0, false)).toBeUndefined()
  })
})
