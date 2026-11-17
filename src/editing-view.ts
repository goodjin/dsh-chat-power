/**
 * 编辑期间的工具区落点。
 *
 * 编辑卡（回答副本 / 选区 / 工作区文件）挂在**输入框上方**，所以打开编辑时
 * 工具区必须切回对话那一格（否则输入框被收起、卡片掉到输入框下面——
 * 见 conversation-tools.tsx 里 'chat-power:selection-edit-open' 的处理）。
 *
 * 但「切回对话」是打开时的一次性动作，关闭时没人还原：用户在工作区文件里
 * 点开一个文件编辑，关掉之后停在对话，工作区文件界面没了（2026-11-17 现场）。
 *
 * 这里记下「打开编辑前那一格」，关闭时还回去：
 * - 记的是**工具标签**（工作区文件 / 浏览器 / 终端…），对话本身不用记——
 *   打开时切到对话、关闭时回到对话，等于没动过；
 * - 记下的那一格若在编辑期间被关掉了，就不动当前激活（不回退到别的标签）。
 */
import type { ToolsState } from './tools-state.ts'

/**
 * 打开编辑前激活的那一格（工具标签 id）；没有工具标签时为 undefined。
 *
 * @param state - 标签状态。
 * @param sessionId - 会话 id。
 * @returns 工具标签 id；当前不是工具标签（或没有标签）时 undefined。
 */
export function editingViewOf(state: ToolsState, sessionId: string): string | undefined {
  const snapshot = state.get(sessionId)
  const active = snapshot.tabs.find(tab => tab.id === snapshot.active)
  return active !== undefined && active.kind !== 'chat' ? active.id : undefined
}

/**
 * 关闭编辑后把落点还回去：那一格还开着就选中它，否则保持当前激活不动。
 *
 * @param state - 标签状态。
 * @param sessionId - 会话 id。
 * @param viewId - {@link editingViewOf} 记下的标签 id；没有则什么都不做。
 */
export function restoreEditingView(state: ToolsState, sessionId: string, viewId: string | undefined): void {
  if (viewId === undefined) return
  const snapshot = state.get(sessionId)
  if (!snapshot.tabs.some(tab => tab.id === viewId)) return
  state.select(sessionId, viewId)
}
