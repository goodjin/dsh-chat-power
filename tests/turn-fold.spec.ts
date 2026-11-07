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
  capTallestRow,
  formatClock,
  groupTurnsByNumber,
  scrollTopForTurnTop,
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

describe('结果块占满整屏', () => {
  it('最高的一行拿整屏高度，其余行保持原样（不再按比例互挤）', () => {
    const caps = capTallestRow([40, 800, 900], 600)
    expect(caps[2]).toBe(600)
    expect(caps[1]).toBe(800)
    expect(caps[0]).toBe(40)
  })
  it('可用高度为 0（会话区没布局）时不压任何行', () => {
    expect(capTallestRow([400, 900], 0)).toEqual([400, 900])
  })
  it('没有行时返回空数组', () => {
    expect(capTallestRow([], 600)).toEqual([])
  })
})

describe('思考块一律收起', () => {
  it('按宿主自己的组标记收起思考块，不改宿主状态', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-step-process')
    expect(source).toContain('data-answer-body')
    expect(source).toContain('data-chat-power-group-hidden')
  })
  it('样式只隐藏思考行，组头保留（用户还能点开看）', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('data-chat-power-group-hidden')
  })
})

describe('用户请求条', () => {
  it('请求行折成一行会话条，可点开与收起', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-request-bar')
    expect(source).toContain('data-chat-power-request-collapsed')
    expect(source).toContain('data-chat-flow-kind="user"')
  })
  it('样式里收起请求行、条本身只占一行', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('data-chat-power-request-collapsed')
    expect(css).toContain('data-chat-power-request-bar')
  })
  it('文案里有请求条', () => {
    const locales = readFileSync(new URL('../src/locales.ts', import.meta.url), 'utf8')
    expect(locales).toContain('turnFold.requestLabel')
  })
})

describe('历史轮次顶到屏幕外', () => {
  it('新的一轮出现时把当前轮顶到容器顶部，历史轮被顶出屏幕', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('scrollTopForTurnTop')
    expect(source).toContain('scrollTop')
  })
  it('换算：轮次顶端对齐容器顶端', () => {
    // 轮次顶端在容器顶端下方 300px，容器已滚 200px → 需要滚到 500
    expect(scrollTopForTurnTop(500, 200, 200)).toBe(500)
    // 已经在目标位置上方则不再往回滚
    expect(scrollTopForTurnTop(100, 200, 40)).toBe(0)
  })
  it('结果块那行至少占满一屏（否则历史条会被拉回屏内）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(source).toContain('--chat-power-floor')
    expect(css).toContain('min-height')
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
    expect(source).toContain('capTallestRow')
  })

  it('改动文件列表默认折成一块，可点开与收起', () => {
    const source = readFileSync(new URL('../src/markdown-turn.tsx', import.meta.url), 'utf8')
    expect(source).toContain('filesOpen')
    expect(source).toContain('markdownTurn.filesToggle')
    expect(source).toContain('markdownTurn.filesCollapse')
  })
})
