import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * 宿主语义 token 白名单。
 *
 * 宿主的样式表由「别名 token → 静态色板」两层组成（`design-platform.css`：
 * `--dsw-alias-*: var(--dsw-static-*)`）。插件只许用别名层；写错名字时 CSS 不会
 * 报错，只会把 `var()` 的兜底值当成真值——于是一块浮层可能变成自己写死的近黑底，
 * 文字却是宿主的浅色，整块看不清。
 *
 * 这份名单取自宿主 0.2.2-rc.1（核对日期 2026-11-07）。宿主改名时，用
 * `scripts/check-host-tokens.mjs` 复核后再更新本名单。
 */
const HOST_TOKENS: readonly string[] = [
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-brand-primary',
  '--dsw-alias-button-info-fill',
  '--dsw-alias-button-info-hover',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-solid',
  '--dsw-alias-label-caption',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-settings-card-fill',
  '--dsw-alias-settings-card-stroke',
  '--dsw-alias-state-business-primary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-toast-bg',
  '--dsw-alias-toast-label',
  '--dsw-alias-tooltip-bg',
  '--dsw-font-family',
  '--dsw-font-mono',
  '--dsw-radius-lg',
  '--dsw-radius-md',
  '--dsw-radius-panel',
  '--dsw-radius-sm',
  '--dsw-radius-xs',
  '--dsw-specific-input-major',
]

/** 收集 src 下所有样式与源码里用到的 --dsw-* token。 */
function collectUsedTokens(dir: string): Map<string, string[]> {
  const used = new Map<string, string[]>()
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      for (const [token, files] of collectUsedTokens(path)) {
        used.set(token, [...(used.get(token) ?? []), ...files])
      }
      continue
    }
    if (!/\.(css|ts|tsx)$/.test(entry)) continue
    const source = readFileSync(path, 'utf8')
    for (const token of source.match(/--dsw-[a-z0-9-]+/g) ?? []) {
      // 文档里的通配写法（`--dsw-alias-*`）不是真 token，跳过。
      if (token.endsWith('-')) continue
      used.set(token, [...(used.get(token) ?? []), path])
    }
  }
  return used
}

describe('宿主主题 token', () => {
  it('只用宿主真的定义过的 token（写错名字不会报错，只会变成兜底色）', () => {
    const used = collectUsedTokens(new URL('../src', import.meta.url).pathname)
    const unknown = [...used.entries()].filter(([token]) => !HOST_TOKENS.includes(token))
    expect(unknown.map(([token, files]) => `${token}（${[...new Set(files)].join(', ')}）`)).toEqual([])
  })

  it('浮层表面的背景走宿主的前景层 token（别用不存在的容器色）', () => {
    const css = readFileSync(new URL('../src/selection-toolbar.module.css', import.meta.url), 'utf8')
    expect(css).not.toContain('--dsw-alias-bg-container')
    expect(css).toContain('--dsw-alias-bg-overlay')
  })

  it('轻提示走宿主的系统提示配色（背景与文字成对）', () => {
    const source = readFileSync(new URL('../src/selection-actions.ts', import.meta.url), 'utf8')
    expect(source).toContain('--dsw-alias-toast-bg')
    expect(source).toContain('--dsw-alias-toast-label')
    expect(source).not.toContain('--dsw-alias-tooltip-background')
  })
})
