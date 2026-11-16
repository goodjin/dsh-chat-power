import { afterEach, describe, expect, it } from 'vitest'
import { injectTablePadCss, TABLE_PAD_TAG } from '../src/table-pad.ts'

afterEach(() => { document.querySelectorAll(`style[data-plugin-css="${TABLE_PAD_TAG}"]`).forEach(node => node.remove()) })

describe('宽表格在本包的每轮框里', () => {
  it('注入一条样式：末列右内边距补回 16px', () => {
    injectTablePadCss()
    const style = document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`)
    expect(style).not.toBeNull()
    const css = style?.textContent ?? ''
    expect(css).toContain('md-table-wide td:last-child')
    expect(css).toContain('th:last-child')
    expect(css).toContain('padding-right:16px')
  })

  it('首列左内边距也补回 16px（左右两端都不贴边）', () => {
    injectTablePadCss()
    const css = document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`)?.textContent ?? ''
    expect(css).toContain('md-table-wide td:first-child')
    expect(css).toContain('th:first-child')
    expect(css).toContain('padding-left:16px')
  })

  it('宽表横向滚动常开：平时被裁掉的列随时能滚到', () => {
    injectTablePadCss()
    const css = document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`)?.textContent ?? ''
    expect(css).toContain('md-table-wide{overflow-x:auto}')
  })

  it('框内收回宿主的「两侧出血」：表格不再探出回答框', () => {
    injectTablePadCss()
    const css = document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`)?.textContent ?? ''
    // 宿主的出血由这两个变量驱动；框内归零，宿主的宽度/位移公式自会算回框内。
    expect(css).toContain('[data-chat-power-answer-ready] .md-table-wide')
    expect(css).toContain('--dsh-table-lead:0px')
    expect(css).toContain('--dsh-table-spare:0px')
    // 归零要压过宿主那条规则（同等权重时靠顺序），所以用 !important。
    expect(css).toContain('--dsh-table-lead:0px!important')
    expect(css).toContain('--dsh-table-spare:0px!important')
  })

  it('只作用宽表：窄表（tableFill）不受影响', () => {
    injectTablePadCss()
    const css = document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`)?.textContent ?? ''
    for (const rule of css.split('}')) {
      if (rule.includes('tableScroll') && !rule.includes('@')) {
        expect(rule).toContain('md-table-wide')
      }
    }
    expect(css).not.toContain('tableFill')
  })

  it('重复注入只有一份', () => {
    injectTablePadCss()
    injectTablePadCss()
    expect(document.querySelectorAll(`style[data-plugin-css="${TABLE_PAD_TAG}"]`).length).toBe(1)
  })
})
