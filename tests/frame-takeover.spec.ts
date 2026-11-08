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
})
