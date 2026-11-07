/**
 * 会话区统一 UI 主题：一处注入、处处复用的样式与类名。
 *
 * 改造目标（docs/superpowers/specs/2026-11-06-chat-power-ui-unification-design.md）：
 * 各表面不再各写一套按钮 / 面板 / 状态样式，统一从这里取类名。类名带 `dshcp-`
 * 前缀、稳定不哈希——React 组件（className 字符串）与纯 DOM 功能
 * （selection-actions、mermaid 注入）都能用同一份。
 *
 * 颜色只用宿主语义 token（`--dsw-alias-*`），写死的值只作 token 缺席时的中性回退，
 * 不再维护独立的深色媒体查询（主题由宿主 token 表达）。数值基线：
 * 间距 4/8/12/16/24px、正文 14px、辅助 12px、控件圆角 6px、面板 10–12px、
 * 图标 16px、桌面点击区 32px（dense 行用 28px 变体）。
 */

/** 注入到 head 的标记；重复注入与诊断都靠它。 */
export const UI_THEME_TAG = 'dsh-chat-power/ui-theme'

/** 图标按钮：32px 点击区、透明底、hover 铺淡底、focus 可见。 */
export const uiButtonClass = 'dshcp-icon-btn'
/** dense 行（文件树行内）的 28px 变体。 */
export const uiButtonSmallClass = 'dshcp-icon-btn--sm'
/** 统一面板（编辑卡、文件卡、图表卡共用的外框）。 */
export const panelClass = 'dshcp-panel'
/** 面板头部行。 */
export const panelHeadClass = 'dshcp-panel__head'
/** 头部标题列（标题 + 可选说明，纵向排）。 */
export const panelTitleWrapClass = 'dshcp-panel__titlewrap'
/** 面板标题文字。 */
export const panelTitleClass = 'dshcp-panel__title'
/** 标题下的辅助说明（如「发送副本」提示）。 */
export const panelSubtitleClass = 'dshcp-panel__subtitle'
/** 面板底部动作行。 */
export const panelActionsClass = 'dshcp-panel__actions'
/** 动作行里的弹性占位（把主按钮推到右侧）。 */
export const panelSpacerClass = 'dshcp-panel__spacer'
/** 描边胶囊按钮（新建会话、弱文字操作）。 */
export const btnClass = 'dshcp-btn'
/** 弱文字操作（无描边，如「复制全文」）。 */
export const btnQuietClass = 'dshcp-btn--quiet'
/** 圆形发送主按钮（与输入框发送钮同款）。 */
export const sendClass = 'dshcp-send'
/** 无边框编辑输入区（面板内）。 */
export const inputClass = 'dshcp-input'
/** 状态行（错误 / 成功反馈）。 */
export const statusNoticeClass = 'dshcp-status'

export const UI_THEME_CSS = `
.${uiButtonClass}{display:inline-flex;align-items:center;justify-content:center;flex:none;width:32px;height:32px;padding:0;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer}
.${uiButtonClass}:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));color:var(--dsw-alias-label-primary,inherit)}
.${uiButtonClass}:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,currentColor));outline-offset:1px}
.${uiButtonClass}:disabled{cursor:default;opacity:.5}
.${uiButtonSmallClass}{width:28px;height:28px}
.${panelClass}{display:flex;flex-direction:column;min-width:0;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));border-radius:var(--dsw-radius-panel,12px);background:var(--dsw-specific-input-major,transparent);overflow:hidden;transition:border-color 120ms}
.${panelClass}:focus-within{border-color:var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,rgba(127,127,127,.5)))}
.${panelHeadClass}{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-block-end:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12))}
.${panelTitleWrapClass}{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.${panelTitleClass}{overflow:hidden;font-size:12px;font-weight:600;line-height:18px;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,inherit)}
.${panelSubtitleClass}{font-size:12px;font-weight:400;line-height:16px;color:var(--dsw-alias-label-secondary,inherit)}
.${panelActionsClass}{display:flex;align-items:center;gap:12px;padding:6px 10px 6px 12px;border-block-start:1px solid var(--dsw-alias-border-l1,rgba(127,127,127,.12))}
.${panelSpacerClass}{flex:1}
.${inputClass}{width:100%;resize:vertical;padding:10px 14px 4px;border:none;background:transparent;outline:none;color:var(--dsw-alias-label-primary,inherit);caret-color:var(--dsw-alias-state-business-primary,auto);font:inherit;line-height:1.6}
.${btnClass}{display:inline-flex;align-items:center;gap:4px;padding:4px 12px;border:1px solid var(--dsw-alias-border-l4,rgba(127,127,127,.25));border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:12px;line-height:18px;cursor:pointer}
.${btnClass}:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}
.${btnClass}:disabled{cursor:default;opacity:.5}
.${btnQuietClass}{border-color:transparent;padding-inline:8px;color:var(--dsw-alias-label-secondary,inherit)}
.${sendClass}{display:inline-grid;place-items:center;flex:none;width:34px;height:34px;padding:0;border:none;border-radius:999px;background:var(--dsw-alias-button-info-fill,var(--dsw-alias-brand-primary,rgba(127,127,127,.3)));color:var(--dsw-alias-label-primary-foreground,#fff);cursor:pointer;transition:background-color 100ms}
.${sendClass}:hover{background:var(--dsw-alias-button-info-hover,var(--dsw-alias-brand-primary,rgba(127,127,127,.45)))}
.${sendClass}:disabled{cursor:default;opacity:.6}
.${statusNoticeClass}{margin:4px 12px 0;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary,inherit)}
.${statusNoticeClass}[data-variant="error"]{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-primary,inherit))}
.${statusNoticeClass}[data-variant="success"]{color:var(--dsw-alias-state-success-primary,var(--dsw-alias-label-primary,inherit))}
`.trim() + '\n'

/**
 * 把统一样式注入页面 head；已注入过则跳过，非浏览器环境安静返回。
 * 与 table-pad.ts 同一套 data 标记约定，便于诊断与去重。
 * @param doc - 页面文档；缺省用全局 document（测试注入假件）。
 */
export function injectUiThemeCss(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (target === undefined) return
  if (target.querySelector(`style[data-plugin-css="${UI_THEME_TAG}"]`) !== null) return
  const style = target.createElement('style')
  style.dataset.plugin = 'dsh-chat-power'
  style.dataset.pluginCss = UI_THEME_TAG
  style.textContent = UI_THEME_CSS
  target.head.appendChild(style)
}
