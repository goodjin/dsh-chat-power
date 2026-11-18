/**
 * 大编辑区时藏掉「整个收起输入框」按钮（2026-11-18）。
 *
 * 标题栏那一行里有两个向下箭头：
 * - 「收起输入框」按钮（图标是一条向下的折线）；
 * - 撑大浮钮在大编辑区时翻成向下箭头（收回半屏）。
 *
 * 两个同形状的箭头并排会让人以为点错了；而且「半屏」与「整块收走」是两种
 * 不同的收起，混在一处更糊。所以大编辑区时把前者藏起来——收起半屏有浮钮，
 * 整块收走等回到小框再做。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const cssText = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8')
const sourceText = (name: string): string => cssText(name)

describe('大编辑区藏掉「收起输入框」按钮', () => {
  it('收起按钮有专门的标记（便于样式与测试定位）', () => {
    const source = sourceText('composer-header.tsx')
    expect(source).toMatch(/data-composer-collapse/)
  })

  it('大编辑区时该按钮不显示', () => {
    const css = cssText('composer-header.module.css')
    // 源码里整条包在 :global(...) 里（宿主类名不能被 CSS module 改写）。
    expect(css).toMatch(
      /:global\(\[data-composer-card\]\.dshcp-big\)\s+\[data-composer-collapse\]\s*\{[^}]*display:\s*none/,
    )
  })

  it('大编辑区的标记就是卡片上的 dshcp-big（浮钮撑大时挂上它）', () => {
    const source = sourceText('expand-editor.tsx')
    expect(source).toMatch(/BIG_CLASS = 'dshcp-big'/)
    expect(source).toMatch(/card\.classList\.add\(BIG_CLASS\)|classList\.toggle\(BIG_CLASS\)/)
  })

  it('收起按钮的图标确实是向下箭头（与大编辑区时的浮钮撞形）', () => {
    const source = sourceText('composer-header.tsx')
    // collapse: 向下的折线；大编辑区时浮钮用 ChevronDown。
    expect(source).toMatch(/collapse:\s*'M4 9l8 8 8-8'/)
  })
})
