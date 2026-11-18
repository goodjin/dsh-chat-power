// @vitest-environment jsdom
/**
 * 会话列宽拖拽边在工具标签界面里要藏起来（2026-11-18）。
 *
 * 宿主的 DOM 结构（从宿主产物核对）：
 *   [data-conversation-content]
 *     ├── [data-conversation-scroll]        ← 工具正文挂在这里面
 *     │     └── [data-chat-tools-mount][data-chat-strip-live]
 *     └── [data-width-handle=left|right]    ← 两条把手（滚动层的兄弟）
 *
 * 样式据此写：滚动层里有激活态工具正文时，同层的把手不显示。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cssText = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8')

/** 按宿主结构搭一份 DOM。 */
function buildDom(toolActive: boolean): void {
  document.body.innerHTML = `
    <div data-conversation-content data-content-phase="active">
      <div data-conversation-scroll>
        <div data-chat-tools-mount ${toolActive ? 'data-chat-strip-live' : ''}></div>
        <div data-composer-seat></div>
      </div>
      <div data-width-handle="left"></div>
      <div data-width-handle="right"></div>
    </div>`
}

describe('列宽拖拽边的显隐', () => {
  it('工具标签激活时，把手与工具正文是兄弟关系（选择器能命中）', () => {
    buildDom(true)
    const content = document.querySelector('[data-conversation-content]')!
    const scroll = content.querySelector('[data-conversation-scroll]')!
    const tool = content.querySelector('[data-chat-tools-mount]')!
    const handles = content.querySelectorAll('[data-width-handle]')
    // 工具正文在滚动层里。
    expect(scroll.contains(tool)).toBe(true)
    expect(tool.hasAttribute('data-chat-strip-live')).toBe(true)
    // 把手是滚动层的兄弟、与滚动层同属内容容器。
    expect(handles.length).toBe(2)
    for (const handle of handles) {
      expect(handle.parentElement).toBe(content)
      expect(handle.parentElement === scroll).toBe(false)
    }
  })

  it('选择器与实际 DOM 结构对得上', () => {
    const css = cssText('conversation-tools.module.css')
    const rule = css.match(
      /\[data-conversation-content\]:has\(\[data-conversation-scroll\] \[data-chat-strip-live\]\)\s*>\s*\[data-width-handle\]\s*\{([^}]*)\}/,
    )
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/display:\s*none/)
  })

  it('回到对话标签时标记撤掉、把手的显隐回到宿主手里', () => {
    buildDom(false)
    const tool = document.querySelector('[data-chat-tools-mount]')!
    expect(tool.hasAttribute('data-chat-strip-live')).toBe(false)
  })
})
