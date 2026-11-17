/**
 * 编辑打开时的滚动落点。
 *
 * 2026-11-17 现场：打开文件编辑时视图默认落在底部——文件正文停在末尾，
 * 上面的内容看不见。用户要的是**从顶部开始看**。
 *
 * 两处滚动各管各的：
 * - **会话滚动容器**（`[data-conversation-scroll]`）：编辑打开时不写它的
 *   scrollTop（原先写 scrollHeight 把会话拽到底），保持用户原来的位置。
 * - **编辑区自身**（`[data-input-scroll]`，宿主输入框的滚动层）：内容灌进去
 *   之后浏览器会把滚动位置留在末尾，这里拨回顶部。
 *
 * 只拨滚动位置，不动光标：光标在哪儿是宿主的语义（setDraft 之后光标落在
 * 末尾，用户想接着末尾写就还在末尾），我们只保证**看到**的是开头。
 */

/** 编辑区滚动层（宿主输入框内部那层）。 */
export const EDIT_SCROLL_SELECTOR = '[data-input-scroll]'

/**
 * 把编辑区滚动到顶部。
 *
 * @param card - 编辑卡所在的 composer 卡片（宿主输入框的祖先）。
 */
export function scrollEditToTop(card: Element | null): void {
  if (card === null) return
  const scroller = card.querySelector<HTMLElement>(EDIT_SCROLL_SELECTOR)
  if (scroller === null) return
  if (typeof scroller.scrollTop !== 'number') return
  scroller.scrollTop = 0
}
