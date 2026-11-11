import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 「本轮文件」入口在点赞栏那排、文件列表展开在点赞栏下方的样式契约。纯 CSS 串断言，
 * 防回归；实际观感以界面为准。
 */
const css = readFileSync(new URL('../src/markdown-turn.module.css', import.meta.url).pathname, 'utf8')

describe('本轮文件 / 已编辑文件 排布', () => {
  it('本轮文件块排到点赞栏（MessageIconActions）之后', () => {
    expect(css).toMatch(/\[data-turn-tail\][^{]*\[data-files-block\][^{]*\{[^}]*order:\s*1/)
  })

  it('宿主改动卡（已编辑文件）排在本轮文件块之后、同样在点赞栏下方', () => {
    expect(css).toMatch(/\[data-turn-tail\][^{]*\[data-changed-files\]:has\(> ul\)[^}]*\{[^}]*order:\s*2/)
  })

  it('藏掉宿主改动卡自己的按钮（标题行 + 折叠钮），只留文件行', () => {
    expect(css).toMatch(/\[data-turn-tail\]\s*\[data-changed-files\] > button\s*\{\s*display:\s*none/)
  })

  it('单文件改动卡（无文件行）整卡收起，避免空壳', () => {
    expect(css).toMatch(/\[data-turn-tail\]\s*\[data-changed-files\]:not\(:has\(> ul\)\)\s*\{\s*display:\s*none/)
  })

  it('已编辑文件行冠不同颜色，与本轮文件区分', () => {
    expect(css).toMatch(/\[data-changed-files\] ul button\s*\{\s*color:\s*var\(--dsw-alias-label-secondary/)
  })

  it('收起时（turnTail 无 data-files-open）已编辑文件一起收起', () => {
    expect(css).toMatch(/\[data-turn-tail\]:not\(\[data-files-open\]\) \[data-changed-files\]\s*\{\s*display:\s*none/)
  })
})
