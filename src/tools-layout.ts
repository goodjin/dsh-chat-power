/**
 * 工具正文在会话内容里的挂载位，以及「工具激活时要收起哪些节点」的判定。
 *
 * 抽成独立纯模块（不依赖 React），方便用假元素直接测挂载顺序——会话区的
 * 显示故障就出在顺序上，必须能脱离真实 DOM 复现与钉住。
 *
 * 宿主结构（已核对 app.asar 里 `dsh-client-ui-conversation` 的 ConversationContent）：
 *
 * ```text
 * [data-conversation-content]
 *   [data-chat-tools-row]        ← 我们的标签行（补挂在 content 直属、滚动层之前）
 *   [data-conversation-scroll]   ← 滚动层（flex column）
 *     [宿主视图]                 ← 对话/轨迹（激活工具时要收起）
 *     [data-composer-seat]       ← 输入框（composer，留在下方）
 * ```
 *
 * 工具正文改挂进滚动层、排在宿主视图之后、composer 之前，顺序固定为
 * 「标签行在上、正文居中、composer 在下」；不再把正文插在 `content` 之前、
 * 把标签行挤到正文下方。
 */

/**
 * 会话内容里能挂工具正文 / 被收起的最小元素面。真实 DOM 的 `Element` 与测试里的
 * 假元素都满足它；只用单属性选择器，便于假元素实现。
 */
export interface LayoutNode {
  getAttribute(name: string): string | null
  querySelector(selector: string): LayoutNode | null
  append(node: unknown): void
  insertBefore(node: unknown, before: unknown): void
  /** 真实 DOM 是 HTMLCollection、假件是数组——都用 Array.from 归一，故此处不窄类型。 */
  readonly children?: unknown
}

/** 工具正文挂载标记（与 conversation-tools 的 `data-chat-tools-mount` 一致）。 */
export const TOOLS_MOUNT_ATTR = 'data-chat-tools-mount'

/**
 * 把工具正文挂进会话内容：滚动层里、宿主视图之后、composer 之前。
 *
 * 这样激活工具标签时正文自然排在标签行之下、输入框之上；缺 composer / 缺滚动层
 * 时逐级兜底，绝不抛。
 *
 * @param content - 会话内容根（`[data-conversation-content]`）。
 * @param body - 工具正文挂载点（我们的节点）。
 */
export function mountToolBody(content: LayoutNode, body: LayoutNode): void {
  const scroll = content.querySelector('[data-conversation-scroll]')
  if (scroll === null) { content.append(body); return }
  const composer = scroll.querySelector('[data-composer-seat]')
  if (composer !== null) scroll.insertBefore(body, composer)
  else scroll.append(body)
}

/**
 * 一个节点是不是「该在工具激活时收起的宿主视图」：不是 composer、不是我们的正文。
 *
 * 滚动层直接子节点与激活期间宿主新补渲染的节点都用它判定，收起逻辑一致。
 */
export function isToolMessageNode(node: unknown, body: LayoutNode): boolean {
  if (node === null || typeof node !== 'object' || node === body) return false
  const get = (node as { getAttribute?: unknown }).getAttribute
  if (typeof get !== 'function') return false
  return (node as { getAttribute(name: string): string | null }).getAttribute('data-composer-seat') === null
}

/**
 * 工具标签激活时要收起的节点：滚动层里的宿主视图（对话/轨迹），不含我们的正文
 * 与 composer。
 *
 * @param scroll - 会话滚动层（`[data-conversation-scroll]`）。
 * @param body - 工具正文挂载点（排除自身，别把自己收起）。
 */
export function toolMessageNodes(scroll: LayoutNode, body: LayoutNode): LayoutNode[] {
  const raw = scroll.children
  const children: unknown[] = raw == null ? [] : Array.from(raw as ArrayLike<unknown>)
  return children.filter(node => isToolMessageNode(node, body)) as LayoutNode[]
}

/**
 * 某一刻工具正文该收起的宿主视图：工具标签激活才收起（露出工具正文）；回到对话 /
 * 轨迹等工具标签激活态取消时返回空——宿主视图就此恢复（切换能收回）。
 *
 * @param scroll - 会话滚动层。
 * @param body - 工具正文挂载点。
 * @param toolActive - 当前会话是否有工具标签处于激活。
 */
export function toolHiddenNodes(scroll: LayoutNode, body: LayoutNode, toolActive: boolean): LayoutNode[] {
  return toolActive ? toolMessageNodes(scroll, body) : []
}
