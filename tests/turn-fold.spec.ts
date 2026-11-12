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
  formatClock,
  frameBudgetHeight,
  frameKindOf,
  groupTurnsByNumber,
  loadQuickMessages,
  middleFoldRange,
  MIDDLE_FOLD_THRESHOLD,
  panelPlacement,
  saveQuickMessages,
  scrollTopForTurnTop,
  summarizeTurn,
  turnStripText,
  USER_ROW_SELECTOR,
} from '../src/turn-fold.ts'
import type { QuickMessage } from '../src/turn-fold.ts'

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

describe('请求条的形态', () => {
  it('当前轮的请求条靠右显示，不用整轮折叠的横条样式', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('css.requestBar')
    expect(source).not.toContain('bar.className = css.strip')
  })
  it('样式上：请求条靠右、宽度自适应；整轮折叠条仍是整行', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    const requestBar = css.slice(css.indexOf('.requestBar'), css.indexOf('.requestBar') + 600)
    expect(requestBar).toMatch(/margin-left:\s*auto/)
    expect(requestBar).toMatch(/width:\s*fit-content/)
    // 整轮折叠条仍占满一行
    const strip = css.slice(css.indexOf('.strip {'), css.indexOf('.strip {') + 400)
    expect(strip).not.toMatch(/margin-left:\s*auto/)
  })
})

describe('输出外框', () => {
  it('框内不出现滚动条：超出的一屏向上裁掉（历史消失，输出继续贴底）', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    const box = css.slice(css.indexOf('[data-chat-power-frame-box]'), css.indexOf('[data-chat-power-frame-box]') + 400)
    expect(box).toMatch(/overflow-y:\s*hidden/)
    expect(box).not.toMatch(/overflow-y:\s*auto/)
  })
  it('框上左侧按内容显示 思考 / 工具调用 / 回答', () => {
    expect(frameKindOf({ hasAnswer: false, hasToolCalls: false, hasReasoning: true })).toBe('thinking')
    expect(frameKindOf({ hasAnswer: false, hasToolCalls: true, hasReasoning: true })).toBe('tools')
    expect(frameKindOf({ hasAnswer: true, hasToolCalls: true, hasReasoning: true })).toBe('answer')
    expect(frameKindOf({ hasAnswer: false, hasToolCalls: false, hasReasoning: false })).toBe('answer')
  })
  it('DOM 层认得出三种内容（宿主的行标记）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-group-part')
    expect(source).toContain('tool-call')
    expect(source).toContain('data-answer-body')
    expect(source).toContain('data-chat-power-frame-label')
  })
  it('回答完成后才出现编辑/复制按钮（宿主给 running/settled）', () => {
    const card = readFileSync(new URL('../src/answer-card.tsx', import.meta.url), 'utf8')
    expect(card).toContain("status")
    expect(card).toContain('running')
    const wrapper = readFileSync(new URL('../src/conversation-surfaces.tsx', import.meta.url), 'utf8')
    expect(wrapper).toContain('status')
  })
})

describe('输出框的固定顶栏与底部间距', () => {
  it('顶栏固定：框上的文案与答案卡头都吸顶', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    const cardCss = readFileSync(new URL('../src/answer-card.module.css', import.meta.url), 'utf8')
    expect(css).toMatch(/position:\s*sticky/)
    expect(cardCss).toMatch(/position:\s*sticky/)
  })
  it('流式输出时裁切、回答完成后框内可滚动（出滚动条）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-scroll')
    expect(source).toContain('data-answer-status')
    expect(css).toContain("data-chat-power-scroll='auto'")
    // 答案卡把宿主给的状态透出来，DOM 层据此判断是否还在流式输出
    const card = readFileSync(new URL('../src/answer-card.tsx', import.meta.url), 'utf8')
    expect(card).toContain('data-answer-status')
  })
  it('框底与输入框之间留出间距', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const margin = source.match(/HEIGHT_MARGIN\s*=\s*(\d+)/)
    expect(margin).not.toBeNull()
    expect(Number(margin?.[1] ?? 0)).toBeGreaterThanOrEqual(24)
  })
})

describe('已编辑文件并入本轮文件列表', () => {
  it('宿主改动卡整卡隐藏，改动文件由本轮文件列表同样式渲染', () => {
    const css = readFileSync(new URL('../src/markdown-turn.module.css', import.meta.url), 'utf8')
    expect(css).toContain('data-changed-files')
    // 宿主改动卡整卡 display:none，避免它样式不一致、排在折叠钮下面
    expect(css).toMatch(/\[data-turn-tail\]\s*\[data-changed-files\]\s*\{\s*display:\s*none/)
  })
  it('点赞栏那排的入口带标记，供样式联动', () => {
    const source = readFileSync(new URL('../src/markdown-turn-chip.tsx', import.meta.url), 'utf8')
    expect(source).toContain('data-files-chip')
    expect(source).toContain('aria-expanded')
  })
})

describe('框顶栏只在本轮', () => {
  it('历史轮次不再显示吸顶的「回答」标题', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('data-chat-power-frame')
    expect(css).toContain('data-answer-title')
  })
  it('答案卡标题带标记，便于按框的状态显隐', () => {
    const source = readFileSync(new URL('../src/answer-card.tsx', import.meta.url), 'utf8')
    expect(source).toContain('data-answer-title')
  })
  it('DOM 层标出哪个框是当前轮', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-frame')
  })
})

describe('回答框只有一层', () => {
  it('答案卡就是框本体（只一层框）', () => {
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('[data-chat-power-frame-box]')
    const card = readFileSync(new URL('../src/answer-card.tsx', import.meta.url), 'utf8')
    expect(card).toContain('data-answer-card')
    expect(card).toContain('data-chat-power-frame-box')
  })
  it('「已完成 · 用时」搬进回答栏，只作提示、不再独占一行、也不可展开', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-hint')
    expect(source).toContain('data-chat-power-hint-text')
    expect(css).toContain('[data-chat-power-hint]')
    const card = readFileSync(new URL('../src/answer-card.tsx', import.meta.url), 'utf8')
    expect(card).toContain('data-answer-header')
  })
})

describe('提示与可用高度', () => {
  it('「已完成 · 用时」在整轮里找得到（宿主把它渲染成独立节点行）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('captureProcessHint'), source.indexOf('captureProcessHint') + 1200)
    expect(body).toContain("'[data-turn-process]'")
    // 不能只在「工作步骤组」里找：那组可能是独立的一行
    expect(body).not.toContain("matches('[data-step-process]')")
    // 只取按钮里那段文字（后面跟着折叠箭头）
    expect(body).toContain("querySelector('span')")
  })
  it('框的可用高度只扣输入框与框下面的行；上面的内容不再扣（被顶出屏幕）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    // 预算函数存在且被 availableHeight 使用。
    expect(source).toContain('frameBudgetHeight')
    expect(source).toContain('frameBudgetHeight(viewport, measureComposerHeight(container), below)')
    // 框下面的行仍然要扣（否则框底伸到输入框下面）。
    expect(source).toContain('belowFrameHeight')
  })
})

describe('框选哪一行', () => {
  it('有答案卡时以答案那行为框（否则思考行更高会让框套错地方）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('const applyCaps'), source.indexOf('const applyCaps') + 2000)
    expect(body).toContain('data-answer-body')
  })
  it('框底与输入框的间距按要求加大 10px', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const margin = source.match(/HEIGHT_MARGIN\s*=\s*(\d+)/)
    expect(Number(margin?.[1] ?? 0)).toBe(42)
  })
})

describe('思考逐行展开', () => {
  it('流式中的思考由我们的帧展开成全文（宿主默认只给一行摘要）', () => {
    const frame = readFileSync(new URL('../src/think-frame.tsx', import.meta.url), 'utf8')
    expect(frame).toContain('MarkdownText')
    expect(frame).toContain('streaming={props.running}')
  })
  it('「思考」+ 图标用官方那行（组头让位给思考行的头）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-group-head-hidden')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('data-chat-power-group-head-hidden')
  })
})

describe('思考与框的关系', () => {
  it('外层会话不在底部时，框里不再贴底（文字不闪）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('viewAtBottom')
    expect(source).toContain('if (atBottom && viewAtBottom)')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    expect(css).toContain('overflow-anchor: none')
  })
  it('DOM 层不再替宿主点控件（帧由我们渲染，DOM 层只管布局）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('data-disclosure-row')
    expect(source).not.toContain('.click()')
    expect(source).not.toContain('expandRunningThinking')
  })
  it('不再注入框顶文案行（各帧自带标题行）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('ensureFrameLabel')
    expect(source).not.toContain('framed.insertBefore')
  })
  it('结果出来后，思考块（不管它在哪一行）都收起', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('const collapseThinking'), source.indexOf('const collapseThinking') + 1800)
    expect(body).toContain('data-variant="think"')
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

  it('限高：可用高度扣掉输入框，上限以 CSS 变量给出，内容贴底跟随', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    const css = readFileSync(new URL('../src/turn-fold.module.css', import.meta.url), 'utf8')
    // 可用高度要扣掉输入框；上限以 CSS 变量给出，样式在 CSS 模块里。
    expect(source).toContain('data-composer-seat')
    expect(source).toContain('--chat-power-cap')
    expect(source).toContain('data-chat-power-capped')
    expect(source).toContain('scrollHeight')
    expect(css).toContain('max-height')
    // 框内不出滚动条：超出的一屏向上裁掉。
    expect(css).toContain('overflow-y: hidden')
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
    expect(source).toContain('data-answer-body')
  })

  it('本轮文件列表读共享展开态（入口在点赞栏那排）', () => {
    const source = readFileSync(new URL('../src/markdown-turn.tsx', import.meta.url), 'utf8')
    expect(source).toContain('getFilesOpen')
    const chip = readFileSync(new URL('../src/markdown-turn-chip.tsx', import.meta.url), 'utf8')
    expect(chip).toContain('setFilesOpen')
    expect(chip).toContain('markdownTurn.filesGroup')
  })
})

describe('会话区排布', () => {
  it('不再往框里注入「思考/回答」那行文案（会闪，且各帧自带标题行）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('ensureFrameLabel')
  })
  it('限高时把框下面那截（文件块、点赞行）的高度也算进来', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('belowFrameHeight')
  })
  it('点赞行被认出来并留在原位（不再挪进标题栏——本轮文件入口靠它展开）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-feedback')
    expect(source).not.toContain('header.append(holder)')
  })
})

describe('快捷信息按钮', () => {
  it('点赞行里挂一个快捷信息按钮（快捷方式图标），三个 git 按钮删掉', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).toContain('data-chat-power-quick-btn')
    expect(source).toContain('QUICK_BTN_SVG')
    // 三个 git 按钮及其指令库彻底移除
    expect(source).not.toContain('data-chat-power-git-')
    expect(source).not.toContain('GIT_LABELS')
    expect(source).not.toContain('gitInstructionStore')
    expect(source).not.toContain('onGitAction')
    const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
    expect(index).not.toContain('onGitAction')
    expect(index).not.toContain('getGitInstruction')
  })
})

describe('快捷信息库（纯逻辑）', () => {
  it('loadQuickMessages：无存储时返回内置三条，均为非空文本', () => {
    const messages = loadQuickMessages(() => null)
    expect(messages.length).toBeGreaterThanOrEqual(3)
    expect(messages.every(m => m.id !== '' && m.text.trim() !== '')).toBe(true)
  })
  it('readStore 合法 JSON 时原样返回', () => {
    const stored = [{ id: 'a', text: '测试' }]
    const messages = loadQuickMessages(() => JSON.stringify(stored))
    expect(messages).toEqual(stored)
  })
  it('readStore 坏 JSON / 结构不对时退回内置', () => {
    expect(loadQuickMessages(() => 'not json').length).toBeGreaterThanOrEqual(3)
    expect(loadQuickMessages(() => JSON.stringify([{ id: '', text: 1 }])).length).toBeGreaterThanOrEqual(3)
  })
  it('saveQuickMessages 写回存储并剔除空文本', () => {
    let saved: string | null = null
    const write = (_key: string, value: string): void => { saved = value }
    saveQuickMessages([
      { id: 'a', text: '保留' },
      { id: 'b', text: '   ' },
      { id: 'c', text: '也保留' },
    ], write)
    const parsed = JSON.parse(saved as unknown as string) as QuickMessage[]
    expect(parsed.map(m => m.text)).toEqual(['保留', '也保留'])
    expect(parsed.every(m => m.id !== '')).toBe(true)
  })
})

describe('超大 turn 中段折叠（middleFoldRange）', () => {
  it('行数不超过阈值时不折叠', () => {
    expect(middleFoldRange(MIDDLE_FOLD_THRESHOLD)).toEqual({ headEnd: 0, tailStart: MIDDLE_FOLD_THRESHOLD, hidden: 0 })
    expect(middleFoldRange(10)).toEqual({ headEnd: 0, tailStart: 10, hidden: 0 })
  })

  it('超过阈值时只保留头尾，中间折起', () => {
    // 269 步的巨型 turn：头 15 + 尾 15，中间 239 折起。
    const range = middleFoldRange(269)
    expect(range.headEnd).toBe(15)
    expect(range.tailStart).toBe(254)
    expect(range.hidden).toBe(239)
  })

  it('刚好超过阈值时头尾不重叠', () => {
    // 51 行：头 15 + 尾 15 = 30，中间 21 折起。
    const range = middleFoldRange(51)
    expect(range.headEnd).toBe(15)
    expect(range.tailStart).toBe(36)
    expect(range.hidden).toBe(21)
  })

  it('头尾之和接近总长时中间只剩少量', () => {
    // 32 行（turn 3 那种规模）：不折叠（低于阈值 50）。
    expect(middleFoldRange(32).hidden).toBe(0)
  })
})

describe('输出框固定高度：可用高度不再扣「上面的内容」', () => {
  it('预算 = 可视区 − 输入框 − 余量(42) − 框下小行；上面的块多高都不影响', () => {
    expect(frameBudgetHeight(800, 60, 30)).toBe(800 - 60 - 42 - 30)
    expect(frameBudgetHeight(800, 0, 0)).toBe(758)
  })

  it('可视区为 0（隐藏的标签页）时不给预算', () => {
    expect(frameBudgetHeight(0, 60, 30)).toBe(0)
  })

  it('扣完不剩（负数）时归零', () => {
    expect(frameBudgetHeight(100, 60, 30)).toBe(0)
  })

  it('源码约束：availableHeight 不再读框上面的高度（aboveFrameHeight 已移除）', () => {
    const source = readFileSync(new URL('../src/turn-fold.ts', import.meta.url), 'utf8')
    expect(source).not.toContain('aboveFrameHeight')
  })
})

describe('用户行识别覆盖「模型提问，用户回答」', () => {
  it('USER_ROW_SELECTOR 含 question-reply', () => {
    expect(USER_ROW_SELECTOR).toContain('question-reply')
  })
})

describe('快捷信息面板的定位（panelPlacement）', () => {
  const viewport = { width: 1280, height: 800 }

  it('上方放得下 → 优先上方（面板底 = 按钮顶 − 间距）', () => {
    // 按钮在屏幕中部，面板 300px 高：上方余量 400 > 300 + 6。
    const place = panelPlacement({ top: 400, bottom: 424, left: 600, width: 24 }, 300, 320, viewport)
    expect(place.below).toBe(false)
    expect(place.top).toBe(400 - 300 - 6)
  })

  it('上方放不下 → 退到下方（面板顶 = 按钮底 + 间距）', () => {
    // 按钮在屏幕顶部附近：上方余量不足。
    const place = panelPlacement({ top: 20, bottom: 44, left: 600, width: 24 }, 300, 320, viewport)
    expect(place.below).toBe(true)
    expect(place.top).toBe(44 + 6)
  })

  it('点赞行在屏幕下部时也放上方（面板顶钳到 0，不出屏幕）', () => {
    // 按钮在 600px 处，面板 300px：上方余量 600 > 306 够放。
    const place = panelPlacement({ top: 600, bottom: 624, left: 600, width: 24 }, 300, 320, viewport)
    expect(place.below).toBe(false)
    expect(place.top).toBe(600 - 300 - 6)
  })

  it('水平方向：左对齐按钮，超右缘时右对齐且不出屏', () => {
    const clamped = panelPlacement({ top: 100, bottom: 124, left: 1100, width: 24 }, 300, 320, viewport)
    // 1100 + 320 > 1280 − 8 → 右对齐到视口右缘内 8px。
    expect(clamped.left).toBe(1280 - 320 - 8)
    const normal = panelPlacement({ top: 100, bottom: 124, left: 600, width: 24 }, 300, 320, viewport)
    expect(normal.left).toBe(600 - 8)
  })
})
