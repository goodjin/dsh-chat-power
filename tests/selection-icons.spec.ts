/**
 * 选区工具栏的图标：复制与多选必须一眼分得开，多选要用复选框语义。
 *
 * 曾经两者都是「8×8 圆角方框 + 左上一条 L 形折线」，14px 下几乎一样。
 * 这里的断言直接读组件元素树里 dangerouslySetInnerHTML 的图标 HTML（真实
 * 渲染产物），不看私有常量：
 * - 两个图标内容不同；
 * - 复制仍是「两张纸」的叠层，多选是「方框 + 勾」的复选框。
 */

import { describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconSendOutlineRegular: () => null,
  IconEditOutlineRegular: () => null,
}))

const { SelectionToolbar } = await import('../src/selection-toolbar.tsx')

/** 从工具栏元素树里取出某个按钮的图标 HTML（dangerouslySetInnerHTML.__html）。 */
function iconHtml(action: string): string | undefined {
  const element = SelectionToolbar({
    readText: () => '选中文字',
    dismiss: () => {},
    clearSelection: () => {},
    t: (key: string) => key,
  } as never)
  const props = element.props as { children: unknown[] }
  const button = (props.children as ReactElement[]).find(
    child => (child as { props?: { 'data-action'?: string } }).props?.['data-action'] === action,
  ) as ReactElement | undefined
  const children = (button?.props.children ?? []) as ReactElement[]
  const iconSpan = children.find(
    child => (child as { props?: { dangerouslySetInnerHTML?: { __html?: string } } })
      .props?.dangerouslySetInnerHTML?.__html !== undefined,
  )
  return (iconSpan as { props?: { dangerouslySetInnerHTML?: { __html?: string } } } | undefined)
    ?.props?.dangerouslySetInnerHTML?.__html
}

describe('选区工具栏图标', () => {
  it('多选不再是复制那套「叠层纸张」，两者一眼分得开', () => {
    const copy = iconHtml('copy-selection') ?? ''
    const multi = iconHtml('multi-add') ?? ''
    // 旧多选与复制共用「8×8 圆角 rect + 一条 L 形叠层折线」，14px 下分不出来。
    // 钉住多选不得再是那个叠层形状（V3.8C…h6.7 是旧折线的特征）。
    expect(multi).not.toMatch(/V3\.8C/)
    // 复制保留「两张纸」的叠层，作为对照锚点。
    expect(copy).toMatch(/<rect/)
    expect(copy).not.toBe(multi)
  })

  it('多选是复选框：圆角方框 + 一道勾线', () => {
    const multi = iconHtml('multi-add') ?? ''
    expect(multi).toContain('<rect')
    // 勾线：path 用相对折线指令画出「先下后上」的勾形（不锁死坐标，只钉形状类别）。
    expect(multi).toMatch(/<path[^>]*d="M[^"]*l[^"]*"/)
    expect(multi).toMatch(/l[\d.]+ -?[\d.]+/) // 有一段向右上收笔的勾
    // 明确记录复选框语义，避免以后又换回抽象叠层。
    expect(multi).toMatch(/checkbox|check-mark|勾选/)
  })
})
