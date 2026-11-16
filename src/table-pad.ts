/**
 * 宽表格的两端留白与横向可达性。
 *
 * 官方 markdown 表格样式（`MarkdownText.module.css` 的 `.tableScroll`）对宽表
 * （渲染器打 `md-table-wide` 标记、比容器宽的那些）有两处让用户看不见东西：
 *
 * 1. **两端内边距被清零**：首列 `padding-left:0`、末列 `padding-right:0`。
 *    那是给「占满列宽、与正文右缘对齐」的窄表格设计的；宽表却要横向滚动，
 *    于是首列文字紧贴容器左缘、末列文字紧贴右缘，看上去像被外框切掉一截。
 * 2. **平时横向滚动被关掉**：`md-table-wide` 的 `overflow-x:hidden`，只有
 *    hover / 聚焦时才换成 `scroll`。没悬停时，被裁到容器外的列根本够不着——
 *    表格左右两端的边框和文字就这么"消失"了。
 *
 * 这里注入一条全局覆盖，只针对宽表：
 * - 首列左内边距、末列右内边距补回 16px（表头 th 与单元格 td 一起补：
 *   只补 td 时，表头末列文字与下方的单元格会错位）；
 * - `overflow-x:auto` 让横向滚动常开，两端的内容随时能滚到。
 *
 * 选择器用 `[class*="tableScroll"]` 而不是编译后的哈希类名——CSS module
 * 的哈希随构建变化，子串匹配对哈希稳定；`md-table-wide` 是渲染器写在
 * 同一元素上的原样类，直接可用。窄表格（tableFill）不受影响：贴边对齐
 * 保持原样，也不给它开滚动条。
 */
const TABLE_PAD_CSS = '[class*="tableScroll"].md-table-wide{overflow-x:auto}[class*="tableScroll"].md-table-wide td:first-child,[class*="tableScroll"].md-table-wide th:first-child{padding-left:16px}[class*="tableScroll"].md-table-wide td:last-child,[class*="tableScroll"].md-table-wide th:last-child{padding-right:16px}'

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
