import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 「已编辑文件」（宿主改动卡 data-changed-files）与「本轮文件」（data-files-group）
 * 合并成单一标题的样式契约。纯 CSS 串断言，防回归；实际观感以界面为准。
 */
const css = readFileSync(new URL('../src/markdown-turn.module.css', import.meta.url).pathname, 'utf8')

describe('本轮文件 / 已编辑文件合并', () => {
  it('把本轮文件块排到宿主改动卡之前（单一标题在顶）', () => {
    expect(css).toMatch(/\[data-turn-tail\][^{]*\[data-files-group\][^{]*\{[^}]*order:\s*-1/)
  })

  it('收掉宿主改动卡自己的标题行（多文件留文件行，单文件保留）', () => {
    expect(css).toMatch(/\[data-changed-files\]:has\(> ul\) > :first-child\s*\{\s*display:\s*none/)
  })

  it('已编辑文件行冠不同颜色，与本轮文件区分', () => {
    expect(css).toMatch(/\[data-changed-files\] ul button\s*\{\s*color:\s*var\(--dsw-alias-label-secondary/)
  })

  it('收起本轮文件时已编辑文件一起收起', () => {
    expect(css).toMatch(/body:has\(\[data-files-toggle\]\[aria-expanded='false'\]\) \[data-changed-files\]\s*\{\s*display:\s*none/)
  })
})
