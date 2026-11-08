/** Independent conversation tabs. Never calls the host sidebar controller.
 *
 * The conversation area is a tabbed workspace: the chat itself is one tab
 * (`kind: 'chat'`, stable {@link CHAT_TAB_ID}), tool tabs sit beside it. A
 * brand-new session seeds with the workspace files tab active; a session with
 * history seeds with the conversation tab active. The first send activates the
 * conversation tab; sibling tabs persist.
 */
export type ToolKind = 'chat' | 'files' | 'browser' | 'terminal' | 'text' | 'local'
export interface ToolTab {
  id: string
  kind: string
  contentId: string
  title: string
  params?: any
  /** 标签内容含未发送草稿：关闭时记忆，同 contentId 重开时恢复（不静默丢草稿）。 */
  draft?: boolean
  controller: AbortController
  commands: { refresh?: () => void }
}
export interface ToolsSnapshot { active?: string; tabs: readonly ToolTab[] }

/** Stable id of the per-session conversation tab; one session owns exactly one. */
export const CHAT_TAB_ID = 'chat-power-chat-tab'
const EMPTY: ToolsSnapshot = { tabs: [] }
const chatTab = (): ToolTab => ({ id: CHAT_TAB_ID, kind: 'chat', contentId: 'chat://session', title: '会话', controller: new AbortController(), commands: {} })
export class ToolsState {
  private sessions = new Map<string, ToolsSnapshot>()
  /** 每会话最多记一个最近关闭的草稿标签，按 contentId 重开时恢复草稿标记。 */
  private closedDrafts = new Map<string, ToolTab>()
  private listeners = new Set<() => void>()
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  get = (id: string) => this.sessions.get(id) ?? EMPTY
  private put(id: string, snapshot: ToolsSnapshot) {
    this.sessions.set(id, snapshot)
    for (const fn of this.listeners) fn()
  }
  /** 最近一次关闭的带草稿标签；没有为 undefined。 */
  closedDraft = (id: string): ToolTab | undefined => this.closedDrafts.get(id)
  /** 标记 / 清除某标签的草稿标记（草稿文本由 UI 层按 contentId 保管）。 */
  markDraft(id: string, tabId: string, draft: boolean) {
    const s = this.get(id)
    if (!s.tabs.some(t => t.id === tabId)) return
    this.put(id, { ...s, tabs: s.tabs.map(t => t.id === tabId ? { ...t, draft } : t) })
  }
  /** First-time shape of a session: history shows the chat, a blank one shows files. No-op once seeded. */
  seed(id: string, hasHistory: boolean) {
    if (this.sessions.has(id)) return
    if (hasHistory) { this.put(id, { active: CHAT_TAB_ID, tabs: [chatTab()] }); return }
    const files: ToolTab = { id: `chat-tools-${crypto.randomUUID()}`, kind: 'files', title: '工作区文件', contentId: 'sidebar://files', controller: new AbortController(), commands: {} }
    this.put(id, { active: files.id, tabs: [files] })
  }
  /** Append the conversation tab when missing (first send); never changes the active tab. */
  private ensureChat(id: string) {
    const s = this.get(id)
    if (s.tabs.some(t => t.kind === 'chat')) return
    this.put(id, { ...s, tabs: [...s.tabs, chatTab()] })
  }
  /** Ensure the conversation tab exists and make it active (send landed here). */
  activateChat(id: string) {
    this.ensureChat(id)
    this.select(id, CHAT_TAB_ID)
  }
  select(id: string, active: string) { this.put(id, { ...this.get(id), active }) }
  open(id: string, kind: string, title: string, contentId = `sidebar://${kind}`, params?: any, multiple = false) {
    const s = this.get(id)
    const found = !multiple && s.tabs.find(t => t.kind === kind && t.contentId === contentId)
    if (found) { this.select(id, found.id); return found }
    // 同 contentId 重开：恢复关闭前的草稿标记，草稿文本由 UI 层按 contentId 找回。
    const remembered = this.closedDrafts.get(id)
    const restoredDraft = remembered !== undefined && remembered.contentId === contentId
    if (restoredDraft) this.closedDrafts.delete(id)
    const tab: ToolTab = { id: `chat-tools-${crypto.randomUUID()}`, kind, title, contentId, params, controller: new AbortController(), commands: {}, ...(restoredDraft ? { draft: true } : {}) }
    this.put(id, { active: tab.id, tabs: [...s.tabs, tab] })
    return tab
  }
  close(id: string, tabId: string) {
    if (tabId === CHAT_TAB_ID) return
    const s = this.get(id)
    const tab = s.tabs.find(t => t.id === tabId)
    if (tab?.draft === true) this.closedDrafts.set(id, tab)
    const tabs = s.tabs.filter(t => t.id !== tabId)
    this.put(id, { ...s, tabs, active: s.active === tabId ? tabs.find(t => t.kind === 'chat')?.id ?? tabs.at(-1)?.id : s.active })
    tab?.controller.abort()
  }
  inventory() { return [...this.sessions].flatMap(([sessionId, s]) => s.tabs.map(tab => ({ ...tab, sessionId, tabId: tab.id }))) }
  dispose() { for (const t of this.inventory()) t.controller.abort(); this.sessions.clear(); this.closedDrafts.clear(); this.listeners.clear() }
}
export const toolsState = new ToolsState()
