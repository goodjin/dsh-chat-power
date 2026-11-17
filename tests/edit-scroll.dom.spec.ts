// @vitest-environment jsdom
/**
 * 编辑打开时的滚动落点（2026-11-17 现场：打开文件编辑默认落在底部）。
 *
 * 编辑区是宿主输入框内部的滚动层（`[data-input-scroll]`）：内容灌进去之后
 * 浏览器把滚动位置留在末尾，顶部看不见。打开编辑时把它拨回顶部。
 */
import { describe, expect, it } from 'vitest'
import { scrollEditToTop } from '../src/edit-scroll.ts'

describe('编辑区滚动落点', () => {
  it('把编辑区滚动到顶部', () => {
    document.body.innerHTML = '<div data-composer-card><div data-input-scroll><div>文件内容</div></div></div>'
    const scroller = document.querySelector<HTMLElement>('[data-input-scroll]')!
    scroller.scrollTop = 320
    scrollEditToTop(document.querySelector('[data-composer-card]'))
    expect(scroller.scrollTop).toBe(0)
  })

  it('没有编辑区时不报错', () => {
    document.body.innerHTML = '<div data-composer-card></div>'
    expect(() => scrollEditToTop(document.querySelector('[data-composer-card]'))).not.toThrow()
    expect(() => scrollEditToTop(null)).not.toThrow()
  })
})
