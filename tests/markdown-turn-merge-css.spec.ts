import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 「已编辑文件」并入本轮文件列表的样式契约。纯 CSS 串断言，防回归；实际观感以界面为准。
 */
const css = readFileSync(new URL('../src/markdown-turn.module.css', import.meta.url).pathname, 'utf8')

describe('已编辑文件并入本轮文件列表', () => {
  it('宿主改动卡整卡隐藏（避免样式不一致、排在折叠钮下面）', () => {
    expect(css).toMatch(/\[data-turn-tail\]\s*\[data-changed-files\]\s*\{\s*display:\s*none/)
  })

  it('已编辑文件在卡片里染不同色、并显示 +X -X', () => {
    expect(css).toMatch(/\.bar\[data-changed\] \.nameMain/)
    expect(css).toMatch(/\.deltaAdd/)
    expect(css).toMatch(/\.deltaDel/)
  })
})
