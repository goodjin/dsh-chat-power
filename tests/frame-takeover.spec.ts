import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/** 读插件源码（用于钉住实现约束）。 */
function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('帧接管', () => {
  // 思考节点与答案步不再由插件帧接管：原生 AssistantNodeView 声明了子座位
  // （reasoning.body / message.images），遮蔽 wrap 两条路都死（2026-11-13），
  // 留给原生渲染。DOM 层用宿主行标记识别思考分部并收起。
  it('思考节点留给原生：不再有 ThinkFrame，DOM 层按宿主标记识别思考分部', () => {
    const wrapper = source('../src/conversation-surfaces.tsx')
    expect(wrapper).not.toContain('ThinkFrame')
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('[data-chat-group-part="reasoning"]')
  })

  it('回答帧由我们的元素当外框（不再把框挂在宿主行上）', () => {
    const dom = source('../src/turn-fold.ts')
    // 限高与裁切落在我们的框元素上
    expect(dom).toContain('frameBoxOf')
    expect(dom).toContain('data-chat-power-frame-box')
  })

  // 思考帧已随 assistant-step wrap 拆除（原生带子座位无法合法遮蔽，2026-11-13）：
  // 思考分部由原生 ReasoningRow 渲染，DOM 层按宿主标记识别后收进过程页签。
  it('思考分部不再有插件帧组件，DOM 层用宿主标记识别', () => {
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('data-chat-group-part="reasoning"')
    expect(dom).not.toContain('data-chat-power-think-frame')
  })
})

describe('帧类型补全', () => {
  it('宿主其余节点类型也各成一帧（错误、重试、压缩、上下文、上限、提问、工作流）', () => {
    const wrapper = source('../src/conversation-surfaces.tsx')
    for (const key of ['turn-error', 'model-retry', 'compaction', 'context', 'turn-max-tokens', 'question-reply', 'workflow-run']) {
      expect(wrapper).toContain(`'${key}'`)
    }
    const locales = source('../src/locales.ts')
    expect(locales).toContain('turnFold.frameError')
    expect(locales).toContain('turnFold.frameWorkflow')
  })

  it('标题栏：左边文案、右边按钮（轮次框标题行的布局约束）', () => {
    const turnCss = source('../src/turn-fold.module.css')
    expect(turnCss).toContain('[data-chat-power-turn-header]')
    expect(turnCss).toContain('[data-chat-power-turn-title]')
  })
})

describe('吸顶的是标题栏', () => {
  it('每个框的标题行都吸顶（内容从标题栏下面过去，不直接顶到框顶）', () => {
    for (const file of ['../src/tools-frame.module.css', '../src/turn-fold.module.css']) {
      const css = source(file)
      expect(css).toMatch(/\.[Hh]eader[^{]*\{|\[data-chat-power-turn-header\][^{]*\{/)
    }
    const turnCss = source('../src/turn-fold.module.css')
    expect(turnCss).toMatch(/\[data-chat-power-turn-header\][^{]*\{[^}]*position:\s*sticky/)
  })
})

describe('框的类型与状态', () => {
  it('每种帧有自己的类型标记，边框颜色按类型区分', () => {
    const css = source('../src/turn-fold.module.css')
    expect(css).toContain("data-chat-power-kind='thinking'")
    expect(css).toContain("data-chat-power-kind='tools'")
    expect(css).toContain("data-chat-power-kind='answer'")
    expect(css).toContain("data-chat-power-kind='error'")
    // 答案步走原生渲染后，answer 类型标记由轮次框（DOM 层）承担。
    expect(css).toContain("data-chat-power-kind='answer'")
  })

  it('输出中时，标题栏挂「进行中」徽标（各帧一致）', () => {
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('markFrameState')
    expect(dom).toContain('data-chat-power-state')
    expect(dom).toContain('turnFold.frameRunning')
    expect(source('../src/tools-frame.tsx')).toContain('data-chat-power-state')
  })
})

describe('工具框（ToolsFrame）', () => {
  it('ToolsFrame 仍用于其余节点帧；tool-call 留给原生（行为断言见 conversation-surfaces.spec）', () => {
    const wrapper = source('../src/conversation-surfaces.tsx')
    expect(wrapper).toContain('ToolsFrame')
    expect(wrapper).toContain('EXTRA_FRAMES')
    const frame = source('../src/tools-frame.tsx')
    expect(frame).toContain('data-chat-power-frame-box')
    expect(frame).toContain('data-chat-power-tools-frame')
  })
  it('DOM 层不再另加文案行（各帧自带标题行）', () => {
    const dom = source('../src/turn-fold.ts')
    expect(dom).not.toContain('ensureFrameLabel')
  })
})