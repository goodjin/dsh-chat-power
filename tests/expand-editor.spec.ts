/**
 * 输入框「大编辑区」的纯逻辑：大编辑区判定、回车改写判定。
 *
 * 只钉不依赖 DOM / React 的决策部分；整组件浮钮 / 回车拦截在
 * `expand-editor.dom.spec.ts`（真 react-dom + jsdom）里钉。
 */
import { describe, expect, it } from 'vitest'
import { isBigMode, shouldRedirectEnterToNewline } from '../src/expand-editor.tsx'

describe('isBigMode', () => {
  it('hero 阶段（新会话）天然是大编辑区，与卡片类名无关', () => {
    expect(isBigMode(null, 'hero')).toBe(true)
    expect(isBigMode({} as Element, 'hero')).toBe(true)
  })

  it('非 hero 时，只有卡片挂了展开标记才算大编辑区', () => {
    const card = { classList: { contains: (c: string) => c === 'dshcp-big' } } as unknown as Element
    expect(isBigMode(card, 'composer')).toBe(true)
    expect(isBigMode(card, 'active')).toBe(true)
  })

  it('非 hero 且卡片未展开 → 不是大编辑区（宿主小框回车行为原样保留）', () => {
    const card = { classList: { contains: () => false } } as unknown as Element
    expect(isBigMode(card, 'composer')).toBe(false)
    expect(isBigMode(card, undefined)).toBe(false)
    expect(isBigMode(null, 'composer')).toBe(false)
  })
})

describe('shouldRedirectEnterToNewline', () => {
  const base = { key: 'Enter', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false }

  it('大编辑区里的裸回车 → 改写为换行', () => {
    expect(shouldRedirectEnterToNewline(base, false)).toBe(true)
  })

  it('带修饰的回车一律放过（交给宿主 / Lexical：Shift 换行、Ctrl/Meta 发送）', () => {
    expect(shouldRedirectEnterToNewline({ ...base, shiftKey: true }, false)).toBe(false)
    expect(shouldRedirectEnterToNewline({ ...base, ctrlKey: true }, false)).toBe(false)
    expect(shouldRedirectEnterToNewline({ ...base, metaKey: true }, false)).toBe(false)
    expect(shouldRedirectEnterToNewline({ ...base, altKey: true }, false)).toBe(false)
  })

  it('输入法组词中、非回车键、已被处理的键 → 放过', () => {
    expect(shouldRedirectEnterToNewline({ ...base, isComposing: true }, true)).toBe(false)
    expect(shouldRedirectEnterToNewline(base, true)).toBe(false)
    expect(shouldRedirectEnterToNewline({ ...base, key: 'a' }, false)).toBe(false)
    expect(shouldRedirectEnterToNewline({ ...base, defaultPrevented: true }, false)).toBe(false)
  })
})
