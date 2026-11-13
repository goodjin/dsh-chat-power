/**
 * 原生回答的纯外观装饰。0.2.2-rc.1 ChatNodeSeat 标出 process member 与 reasoning
 * 分部；不接管 assistant-step，不重新挂载子座位，不移动或隐藏任何宿主节点。
 * 这些 DOM 属性是版本相关的实现细节，升级时需要浏览器验收。
 */
export const ANSWER_FRAME_SELECTOR = '[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"]):not([data-turn-process-member])'
export const ANSWER_FRAME_CSS = `
${ANSWER_FRAME_SELECTOR} {
  box-sizing: border-box;
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
`

/** 生命周期随插件卸载；无浏览器环境时无需安装。 */
export function installAnswerFrame(doc?: Document): () => void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (!target) return () => {}
  const style = target.createElement('style')
  style.dataset.pluginCss = 'chat-power-native-answer-frame'
  style.textContent = ANSWER_FRAME_CSS
  target.head.append(style)
  return () => style.remove()
}
