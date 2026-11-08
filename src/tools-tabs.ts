/**
 * 工具标签并入宿主「对话 / 轨迹」所在行。
 *
 * 宿主的 conversation.view 条目是全局的：标签行对每个会话渲染同一份条目、
 * label 不带会话上下文，装不下「每个会话各自打开的文件标签」。所以沿用
 * 文件树行控件的同款做法——不动宿主的座位表，在宿主渲染出来的标签行
 * （`[data-conversation-tabs]`，role=tablist）里补挂自己的标签：
 *
 * - 会话视图（文件 / 浏览器 / 终端）与打开的文件标签排在宿主标签之后；
 * - 文件标签带关闭钮（退出编辑 = 丢弃草稿，由调用方路由）；
 * - 有工具标签激活时给宿主行做 `data-chat-tools-live` 标记（样式据此把宿主
 *   自己的标签压成未选中，避免一行里出现两个高亮）；
 * - 宿主行缺席（未开开发者工具时没有轨迹行、标签行整行不渲染）就在会话
 *   内容区前自建一行（`data-chat-tools-row`），并带自己的「对话」标签；
 *   宿主行一旦出现就摘掉自建行，改挂宿主行。
 *
 * 选中状态仍归 toolsState：补挂只是把入口画进宿主那一行，点击路由走调用方
 * 注入的处理器。事件用捕获阶段委托：我们的标签要先于宿主的视图切换拿到点击。
 */

/** 我们补挂在行内的标签组容器标记。 */
export const GROUP_ATTR = 'data-chat-tools-group'
/** 单个工具标签标记（我们的）。 */
export const TAB_ATTR = 'data-chat-tools-tab'
/** 标签上的工具标签 id（toolsState 里的 tab.id）。 */
export const TAB_ID_ATTR = 'data-chat-tools-tab-id'
/** 标签上的工具种类（kind 启动器才有）。 */
export const TAB_KIND_ATTR = 'data-chat-tools-tab-kind'
/** 标签的关闭钮标记。 */
export const TAB_CLOSE_ATTR = 'data-chat-tools-tab-close'
/** 自建行（宿主行缺席时）的标记。 */
export const ROW_ATTR = 'data-chat-tools-row'
/** 行容器上的「工具标签激活」标记：样式据此压暗宿主自己的标签。 */
export const LIVE_ATTR = 'data-chat-tools-live'

/** 会话视图种类：与 toolsState 的 kind 一致。 */
export type ToolRowKind = 'files' | 'browser' | 'terminal'

/** 行补挂要用的最小快照（toolsState.get 的形状）。 */
export interface ToolsRowTab {
  readonly id: string
  readonly kind: string
  readonly title: string
}
export interface ToolsRowSnapshot {
  readonly active?: string
  readonly tabs: readonly ToolsRowTab[]
}

/** 点击与状态路由；由 conversation-tools 按 toolsState / adapter 实现。 */
export interface ToolsRowHandlers {
  snapshot(sessionId: string): ToolsRowSnapshot
  /** 回到对话标签（点宿主「对话」或轨迹时，先把工具收起来）。 */
  activateChat(sessionId: string): void
  /** 选中一个已打开的标签。 */
  selectTab(sessionId: string, tabId: string): void
  /** 打开（或聚焦）一个会话视图。 */
  openKind(sessionId: string, kind: ToolRowKind): void
  /** 关闭标签（文件标签走丢弃草稿的关闭）。 */
  closeTab(sessionId: string, tabId: string): void
  /** 工具状态变化通知（toolsState.subscribe）。 */
  subscribe(listener: () => void): () => void
  /** 文案由调用方注入，模块不写死语言。 */
  labels: { chat: string; kinds: Record<ToolRowKind, string> }
  /** 每个入口的图标（SVG 源码）；没有就不画图标。 */
  icons?: Partial<Record<ToolRowKind, string>> & { chat?: string }
}

/** 行补挂与点击路由要用的最小元素面（真实 DOM 满足它，测试里的假元素也满足）。 */
export interface RowElementLike {
  getAttribute(name: string): string | null
  setAttribute(name: string, value: string): void
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
  append(node: unknown): void
  remove(): void
  /** 清空并按需换上新的子节点（同步时重画标签组用）。 */
  replaceChildren(...nodes: unknown[]): void
  insertBefore(node: unknown, before: unknown): void
  querySelector(selector: string): RowElementLike | null
  querySelectorAll(selector: string): Iterable<RowElementLike>
  closest(selector: string): RowElementLike | null
  /** 真实 DOM 有 children；测试假件可缺省（护栏签名比对退化到总是重画）。 */
  readonly children?: { readonly length: number }
  ownerDocument?: RowDocumentLike
  /** 图标用 SVG 源码填进去（真实 DOM 有；测试假件可缺省）。 */
  innerHTML?: string
}

/** 建元素与查页面要用的最小 document 面。 */
export interface RowDocumentLike {
  createElement(tag: string): RowElementLike
  createTextNode(text: string): unknown
  querySelectorAll(selector: string): Iterable<RowElementLike>
}

/** 当前工具标签是否处于激活（快照里 active 指着它）。 */
function isActive(snapshot: ToolsRowSnapshot, tab: ToolsRowTab): boolean {
  return snapshot.active === tab.id
}

/** 自建行的样式全走属性选择器（标记字符串本包独占），模块不依赖 CSS 类名。 */
export interface ToolsRowClasses {}

/** 会话内容根上的会话 id；不是会话内容根则 undefined。 */
function sessionOfContent(root: RowElementLike): string | undefined {
  const value = root.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/** 每个会话内容根上次同步的签名：快照与行都没变就不再碰 DOM。 */
interface SyncSignature {
  readonly sig: string
  readonly row: RowElementLike
  readonly children: number
}
const lastSync = new WeakMap<RowElementLike, SyncSignature>()

/** 快照签名：标签集合与激活态（重画与否的唯一依据）。 */
function signatureOf(snapshot: ToolsRowSnapshot): string {
  return `${snapshot.active ?? ''}|${snapshot.tabs.map(tab => `${tab.id}~${tab.kind}~${tab.title}`).join(',')}`
}

/**
 * 把一个会话的工具标签同步进行容器：宿主行在场就补挂进宿主行，否则维护自建行。
 * @returns 该会话的行容器（宿主行或自建行），会话不明时 undefined。
 */
export function syncSessionToolsRow(root: RowElementLike, doc: RowDocumentLike, handlers: ToolsRowHandlers, classes: ToolsRowClasses): RowElementLike | undefined {
  const sessionId = sessionOfContent(root)
  if (sessionId === undefined) return undefined
  const snapshot = handlers.snapshot(sessionId)
  const hostRow = root.querySelector('[data-conversation-tabs]')
  let row: RowElementLike
  let ownsChatButton: boolean
  if (hostRow !== null) {
    // 宿主行在场：摘掉可能残留的自建行，改挂宿主行。
    for (const owned of root.querySelectorAll(`[${ROW_ATTR}]`)) owned.remove()
    row = hostRow
    ownsChatButton = false
  } else {
    let owned = root.querySelector(`[${ROW_ATTR}]`)
    if (owned === null) {
      owned = doc.createElement('div')
      owned.setAttribute(ROW_ATTR, '')
      owned.setAttribute('role', 'tablist')
      const chat = doc.createElement('button')
      chat.setAttribute('type', 'button')
      chat.setAttribute('role', 'tab')
      chat.setAttribute('data-chat-tools-chat-button', '')
      chat.setAttribute('aria-selected', 'true')
      const chatIcon = handlers.icons?.chat
      if (chatIcon !== undefined && chatIcon !== '') {
        const mark = doc.createElement('span')
        mark.setAttribute('aria-hidden', 'true')
        mark.setAttribute('data-chat-tools-icon', '')
        mark.innerHTML = chatIcon
        chat.append(mark)
      }
      chat.append(doc.createTextNode(handlers.labels.chat))
      owned.append(chat)
      const group = doc.createElement('div')
      group.setAttribute(GROUP_ATTR, '')
      owned.append(group)
      const scroll = root.querySelector('[data-conversation-scroll]')
      if (scroll !== null) root.insertBefore(owned, scroll)
      else root.append(owned)
    }
    row = owned
    ownsChatButton = true
  }
  // 自反馈护栏（2026-11-07 空转现场）：全量重画的 childList/attribute 变异会
  // 触发自己的 MutationObserver 再次 sync——微任务互相排队、永不排空，一核
  // 打满且饿死定时器与调试器。签名比对必须先于**任何** DOM 写（setAttribute
  // 即使写同值也会产生变异记录）：快照没变、行没换、子节点齐全就原样返回。
  const sig = signatureOf(snapshot)
  const expectedChildren = 3 + snapshot.tabs.filter(tab => !['chat', 'files', 'browser', 'terminal'].includes(tab.kind)).length * 2
  const prev = lastSync.get(root)
  const groupForCheck = row.querySelector(`[${GROUP_ATTR}]`)
  if (prev !== undefined && prev.sig === sig && prev.row === row && groupForCheck !== null && (groupForCheck.children?.length ?? -1) === expectedChildren) return row
  lastSync.set(root, { sig, row, children: expectedChildren })
  // 以下是重画路径：只在快照或行结构真的变了时走到。
  if (ownsChatButton) {
    // 自建行的「对话」标签：工具激活时它不该高亮。
    const chatButton = row.querySelector('[data-chat-tools-chat-button]')
    if (chatButton !== null) chatButton.setAttribute('aria-selected', snapshot.active === undefined || snapshot.active === '' ? 'true' : 'false')
  }
  const activeTool = snapshot.tabs.find(tab => tab.kind !== 'chat' && isActive(snapshot, tab))
  if (activeTool === undefined) row.removeAttribute(LIVE_ATTR)
  else row.setAttribute(LIVE_ATTR, '')
  let group = row.querySelector(`[${GROUP_ATTR}]`)
  if (group === null) {
    group = doc.createElement('div')
    group.setAttribute(GROUP_ATTR, '')
    row.append(group)
  }
  // 同步是全量重画：先清掉上一轮的标签，再按当前快照重建（目录树重绘、
  // 标签开关都会反复走到这里，不清空就会越叠越多）。
  group.replaceChildren()
  const render = (element: RowElementLike): void => { group!.append(element) }
  for (const kind of ['files', 'browser', 'terminal'] as const) {
    const kindTab = snapshot.tabs.find(tab => tab.kind === kind)
    const button = doc.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute('role', 'tab')
    button.setAttribute(TAB_ATTR, '')
    button.setAttribute(TAB_KIND_ATTR, kind)
    button.setAttribute('aria-selected', kindTab !== undefined && isActive(snapshot, kindTab) ? 'true' : 'false')
    button.setAttribute('title', handlers.labels.kinds[kind])
    // 入口带图标：先图标后文字（图标是纯装饰，文字才是名字）。
    const icon = handlers.icons?.[kind]
    if (icon !== undefined && icon !== '') {
      const mark = doc.createElement('span')
      mark.setAttribute('aria-hidden', 'true')
      mark.setAttribute('data-chat-tools-icon', '')
      mark.innerHTML = icon
      button.append(mark)
    }
    button.append(doc.createTextNode(handlers.labels.kinds[kind]))
    render(button)
  }
  for (const tab of snapshot.tabs) {
    if (tab.kind === 'chat' || tab.kind === 'files' || tab.kind === 'browser' || tab.kind === 'terminal') continue
    const button = doc.createElement('button')
    button.setAttribute('type', 'button')
    button.setAttribute('role', 'tab')
    button.setAttribute(TAB_ATTR, '')
    button.setAttribute(TAB_ID_ATTR, tab.id)
    button.setAttribute('aria-selected', isActive(snapshot, tab) ? 'true' : 'false')
    button.setAttribute('title', tab.title)
    button.append(doc.createTextNode(tab.title))
    if (isActive(snapshot, tab)) button.setAttribute('data-chat-tools-tab-active', '')
    else button.removeAttribute('data-chat-tools-tab-active')
    render(button)
    const close = doc.createElement('button')
    close.setAttribute('type', 'button')
    close.setAttribute(TAB_CLOSE_ATTR, '')
    close.setAttribute(TAB_ID_ATTR, tab.id)
    close.setAttribute('aria-label', tab.title)
    close.append(doc.createTextNode('×'))
    render(close)
  }
  if (ownsChatButton) row.setAttribute('data-chat-tools-owns-chat', '')
  else row.removeAttribute('data-chat-tools-owns-chat')
  return row
}

/**
 * 点击路由：点到我们的标签 / 关闭钮上时走调用方处理器并截住事件；
 * 点到宿主自己的标签上且该会话有工具激活时，先把工具收起来再放行。
 * @returns 是否是我们处理了这次点击。
 */
export function handleToolsRowClick(event: { target: unknown; preventDefault(): void; stopPropagation(): void }, handlers: ToolsRowHandlers): boolean {
  const target = event.target as { closest?: (selector: string) => unknown } | null
  if (target === null || typeof target.closest !== 'function') return false
  const content = target.closest('[data-conversation-content]') as RowElementLike | null
  const sessionId = content === null ? undefined : sessionOfContent(content)
  if (sessionId === undefined) return false
  const close = target.closest(`[${TAB_CLOSE_ATTR}]`) as RowElementLike | null
  if (close !== null) {
    const tabId = close.getAttribute(TAB_ID_ATTR)
    if (tabId === null) return false
    event.stopPropagation()
    event.preventDefault()
    handlers.closeTab(sessionId, tabId)
    return true
  }
  // 自建行自己的「对话」标签：回到对话（自建行模式下宿主对话标签不在场）。
  const chatButton = target.closest('[data-chat-tools-chat-button]') as RowElementLike | null
  if (chatButton !== null) {
    event.stopPropagation()
    handlers.activateChat(sessionId)
    return true
  }
  const tab = target.closest(`[${TAB_ATTR}]`) as RowElementLike | null
  if (tab !== null) {
    const kind = tab.getAttribute(TAB_KIND_ATTR)
    event.stopPropagation()
    if (kind !== null) handlers.openKind(sessionId, kind as ToolRowKind)
    else {
      const tabId = tab.getAttribute(TAB_ID_ATTR)
      if (tabId === null) return false
      handlers.selectTab(sessionId, tabId)
    }
    return true
  }
  // 宿主自己的标签（对话 / 轨迹）：有工具激活时先回对话，避免「点了没反应」。
  const hostTab = target.closest('[data-conversation-tabs] button[role=tab]')
  if (hostTab !== null) {
    const snapshot = handlers.snapshot(sessionId)
    const activeTool = snapshot.tabs.find(item => item.kind !== 'chat' && isActive(snapshot, item))
    if (activeTool !== undefined) handlers.activateChat(sessionId)
  }
  return false
}

/**
 * 把行补挂到页面上：目录变化后新会话 / 新行会冒出来，所以盯着页面变化同步；
 * 工具状态变化也走同一份同步。
 */
export function attachToolsRow(handlers: ToolsRowHandlers): () => void {
  if (typeof document === 'undefined') return () => {}
  const doc = document as unknown as RowDocumentLike
  const sync = (): void => {
    for (const root of doc.querySelectorAll('[data-conversation-content][data-conversation-session]')) {
      syncSessionToolsRow(root as RowElementLike, doc, handlers, {})
    }
  }
  // 捕获阶段：我们的标签先于宿主的视图切换拿到点击。
  const onClick = (event: Event): void => { handleToolsRowClick(event, handlers) }
  document.addEventListener('click', onClick, true)
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(sync)
  observer?.observe(document.body, { childList: true, subtree: true })
  const unsubscribe = handlers.subscribe(sync)
  sync()
  return () => {
    document.removeEventListener('click', onClick, true)
    observer?.disconnect()
    unsubscribe()
  }
}
