/**
 * 宽表格在本包「每轮一框」里的表现。
 *
 * 宿主给宽表做了两件事，两件在本包的框里都会出问题：
 *
 * 1. **两侧出血**：宿主把宽表的滚动容器加宽到超出居中正文列（`--dsh-table-lead`
 *    / `--dsh-table-spare`），让表格用上聊天区正文列两侧的空当。这在宿主的
 *    裸布局里是对的，在本包的框里则是：表格探出框外，把框的左右边框盖住，
 *    框自己还多出一条横向滚动条——「左右两边的框溢出了看不到」。
 * 2. **平时关掉横向滚动**：宽表（渲染器打 `md-table-wide` 记号）的
 *    `overflow-x` 是 `hidden`，只在悬停/聚焦时才换成 `scroll`。不悬停时，
 *    被裁到容器外的列根本够不着；首列左、末列右的内边距又被清零（那是给
 *    「贴正文边」的窄表设计的），于是两端的文字紧贴裁切边，看着像被切掉一截。
 *
 * 这里注入一条全局覆盖：
 * - 框内把出血收回（只改两个变量，宿主的宽度/位移公式自己会跟着算回去）；
 * - 宽表横向滚动常开，两端的列随时能滚到；
 * - 首列左、末列右补回 16px 内边距（表头 th 与单元格 td 一起补：只补 td
 *   时，表头末列文字与下方的单元格会错位）。
 *
 * 选择器用 `[class*="tableScroll"]` 而不是编译后的哈希类名——CSS module 的
 * 哈希随构建变化，子串匹配对哈希稳定；`md-table-wide` 是渲染器写在同一个
 * 元素上的原样类，直接可用。窄表格（tableFill）不受影响：贴边对齐保持原样，
 * 也不给它开滚动条。
 */
const TABLE_PAD_CSS = '[data-chat-power-answer-ready] .md-table-wide{--dsh-table-lead:0px!important;--dsh-table-spare:0px!important}[class*="tableScroll"].md-table-wide{overflow-x:auto}[class*="tableScroll"].md-table-wide td:first-child,[class*="tableScroll"].md-table-wide th:first-child{padding-left:16px}[class*="tableScroll"].md-table-wide td:last-child,[class*="tableScroll"].md-table-wide th:last-child{padding-right:16px}'

/** 本条注入在 head 里的标记，重复注入与诊断都靠它。 */
export const TABLE_PAD_TAG = 'dsh-chat-power/table-pad'

/** 往页面 head 注入覆盖样式；已注入过则跳过，非浏览器环境安静返回。 */
export function injectTablePadCss(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css="${TABLE_PAD_TAG}"]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = 'dsh-chat-power'
  tag.dataset.pluginCss = TABLE_PAD_TAG
  tag.textContent = TABLE_PAD_CSS
  document.head.appendChild(tag)
}
