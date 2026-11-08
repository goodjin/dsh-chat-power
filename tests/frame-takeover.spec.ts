import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/** 读插件源码（用于钉住实现约束）。 */
function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('帧接管', () => {
  it('思考节点由我们的帧渲染：官方标题行 + 官方 Markdown 正文', () => {
    const wrapper = source('../src/conversation-surfaces.tsx')
    expect(wrapper).toContain('ThinkFrame')
    expect(wrapper).toContain("groupPart === 'reasoning'")
    const frame = source('../src/think-frame.tsx')
    // 标题行照抄官方：DisclosureRow + 官方图标 + 官方 Markdown 渲染
    expect(frame).toContain('DisclosureRow')
    expect(frame).toContain('IconThinkOutlineRegular')
    expect(frame).toContain('MarkdownText')
  })

  it('思考帧有自己的标记，DOM 层据此认出并收起它', () => {
    const frame = source('../src/think-frame.tsx')
    expect(frame).toContain('data-chat-power-think-frame')
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('data-chat-power-think-frame')
  })

  it('框顶那行文案在有官方思考帧时不再另加', () => {
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('data-chat-power-think-frame')
  })

  it('回答帧由我们的元素当外框（不再把框挂在宿主行上）', () => {
    const card = source('../src/answer-card.tsx')
    expect(card).toContain('data-chat-power-frame-box')
    const dom = source('../src/turn-fold.ts')
    // 限高与裁切落在我们的框元素上
    expect(dom).toContain('frameBoxOf')
    expect(dom).toContain('data-chat-power-frame-box')
  })

  it('思考帧也是同一套框', () => {
    const frame = source('../src/think-frame.tsx')
    expect(frame).toContain('data-chat-power-frame-box')
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

  it('标题栏：左边文案、右边按钮（提示跟在标题后面）', () => {
    const css = source('../src/answer-card.module.css')
    expect(css).toContain('justify-content: space-between')
    expect(css).toMatch(/\.answerHeaderActions[\s\S]*?flex:\s*none/)
    const turnCss = source('../src/turn-fold.module.css')
    expect(turnCss).toContain('[data-answer-title][data-chat-power-hint-text]::after')
  })
})

describe('工具调用帧', () => {
  it('工具调用节点由我们的帧接管（原生内容 + 我们的框与标题）', () => {
    const wrapper = source('../src/conversation-surfaces.tsx')
    expect(wrapper).toContain('ToolsFrame')
    expect(wrapper).toContain("'tool-call'")
    const frame = source('../src/tools-frame.tsx')
    expect(frame).toContain('data-chat-power-frame-box')
    expect(frame).toContain('data-chat-power-tools-frame')
  })
  it('框里有工具调用帧时，DOM 层不再另加一行文案', () => {
    const dom = source('../src/turn-fold.ts')
    expect(dom).toContain('data-chat-power-tools-frame')
  })
})