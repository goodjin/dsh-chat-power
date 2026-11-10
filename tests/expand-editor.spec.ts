/**
 * 展开大编辑区的纯逻辑：高度夹取、草稿快照解析。
 *
 * 只钉不依赖 DOM / React 的决策部分；整组件的展开 / 换行 / 发送行为在
 * `expand-editor-dom.spec.ts`（真 react-dom + jsdom）里钉。
 */
import { describe, expect, it } from 'vitest'
import { clampEditorHeight, draftTextOf, EXPAND_EDITOR_MAX_PX, EXPAND_EDITOR_MIN_PX } from '../src/expand-editor.tsx'

describe('clampEditorHeight', () => {
  it('内容小于下限时夹到下限（约 8 行）', () => {
    expect(clampEditorHeight(10)).toBe(EXPAND_EDITOR_MIN_PX)
    expect(clampEditorHeight(0)).toBe(EXPAND_EDITOR_MIN_PX)
    expect(clampEditorHeight(-500)).toBe(EXPAND_EDITOR_MIN_PX)
  })

  it('内容在区间内时原样返回（随内容撑高）', () => {
    expect(clampEditorHeight(240)).toBe(240)
    expect(clampEditorHeight(360)).toBe(360)
  })

  it('内容超过上限时夹到上限（约 20 行，再多就内部滚动）', () => {
    expect(clampEditorHeight(2000)).toBe(EXPAND_EDITOR_MAX_PX)
    expect(clampEditorHeight(100000)).toBe(EXPAND_EDITOR_MAX_PX)
  })

  it('非有限值退回下限，不写进 NaN 高度', () => {
    expect(clampEditorHeight(Number.NaN)).toBe(EXPAND_EDITOR_MIN_PX)
    expect(clampEditorHeight(Number.POSITIVE_INFINITY)).toBe(EXPAND_EDITOR_MIN_PX)
    expect(clampEditorHeight(Number.NEGATIVE_INFINITY)).toBe(EXPAND_EDITOR_MIN_PX)
  })
})

describe('draftTextOf', () => {
  it('从 { text } 快照里取正文', () => {
    expect(draftTextOf({ text: 'hello' })).toBe('hello')
    expect(draftTextOf({ text: '', references: [] })).toBe('')
  })

  it('不是草稿形状时返回空串，不抛错', () => {
    expect(draftTextOf(null)).toBe('')
    expect(draftTextOf('hello')).toBe('')
    expect(draftTextOf({ references: [] })).toBe('')
    expect(draftTextOf(undefined)).toBe('')
  })
})
