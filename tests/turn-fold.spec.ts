/**
 * 轮次折叠与当前轮限高：纯逻辑部分。
 *
 * 仓库没有 jsdom，DOM 相关行为走源码级约束（与 bundle.spec 同路数）；
 * 这里钉住的是能脱离 DOM 验证的算法：按轮次号分组、首句摘要、时刻格式化、
 * 限高分摊。
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  allocateRowHeights,
  formatClock,
  groupTurnsByNumber,
  summarizeTurn,
  turnStripText,
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

describe('行高分摊（按比例，不压扁长块）', () => {
  it('总高不超可用高度时不压任何行', () => {
    expect(allocateRowHeights([30, 100], 600)).toEqual([30, 100])
  })
  it('超出时按比例分摊，最高的行不会被压成一条缝', () => {
    const caps = allocateRowHeights([40, 800, 900], 600)
    expect(caps[1]!).toBeGreaterThanOrEqual(200)
    expect(caps[2]!).toBeGreaterThanOrEqual(200)
    // 短行不受影响
    expect(caps[0]).toBe(40)
  })
  it('没有行触底时合计不超过可用高度', () => {
    const caps = allocateRowHeights([500, 500], 600)
    expect(caps[0]).toBe(300)
    expect(caps[1]).toBe(300)
    expect(caps.reduce((sum, cap) => sum + cap, 0)).toBeLessThanOrEqual(600)
  })
  it('空间极紧时每行仍保留可读高度', () => {
    const caps = allocateRowHeights([900, 900], 300)
    expect(Math.min(...caps)).toBeGreaterThanOrEqual(160)
  })
})

describe('折叠条', () => {
  it('摘要条文本含轮次号、时刻与首句摘要', () => {
    expect(turnStripText(3, '17:31', '把工具栏收进更多')).toBe('第 3 轮 · 17:31 · 把工具栏收进更多')
  })

  it('没有摘要时只留轮次号与时刻', () => {
    expect(turnStripText(3, '17:31', '')).toBe('第 3 轮 · 17:31')
  })

  it('折叠只加属性、插自有元素，不改写宿主行的内容', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-turn')
    expect(source).toContain('data-chat-power-collapsed')
    expect(source).toContain('data-chat-power-turn-strip')
    expect(source).not.toContain('replaceChildren')
    expect(source).not.toContain('innerHTML')
  })

  it('限高：按行分摊上限，超出的行内部滚动并保持贴底', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    // 可用高度要扣掉输入框；上限以 CSS 变量给出，样式在 CSS 模块里。
    expect(source).toContain('data-composer-seat')
    expect(source).toContain('--chat-power-cap')
    expect(source).toContain('data-chat-power-capped')
    expect(source).toContain('scrollHeight')
    expect(css).toContain('max-height')
    expect(css).toContain('overflow-y: auto')
  })

  it('容器晚挂载也要能起来：轮询重试并跟随容器更换', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('setInterval')
    expect(source).toContain('observedContainer')
  })

  it('插件启动处调用轮次折叠，且包在 try/catch 里（失败不拖累启动）', () => {
    const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    expect(source).toContain('startTurnFold')
    expect(source).toMatch(/try \{[\s\S]{0,400}startTurnFold/)
    expect(source).toMatch(/catch \(error[\s\S]{0,200}turn fold/)
  })

  it('README 写明思考块折叠走宿主设置的哪两项', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
    expect(readme).toContain('工作步骤收起时机')
    expect(readme).toContain('收起后显示的回复')
  })

  it('摘要条整条可点（点击即折叠/展开），不再有独立按钮', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(source).not.toContain('stripToggle')
    expect(css).not.toContain('stripToggle')
    // 折叠与展开都走同一条横条
    expect(source).toContain('data-state')
  })

  it('限高按内容高度计算，避免越滚越小', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('scrollHeight')
    expect(source).toContain('allocateRowHeights')
  })
})
