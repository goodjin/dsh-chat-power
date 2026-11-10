/**
 * 会话选区增强的**共享 store** 与多选收集面板。
 *
 * 分工（2026-11-06 起）：选中文字后那条「引用 / 添加到会话 / 发送会话 / 编辑 /
 * 多选」工具栏，本体由宿主文本交互座位 `conversation.chat.text-interaction`
 * 渲染（见 selection-toolbar.tsx）——宿主负责何时弹、弹在哪、弹条的生命周期，
 * 本包的座位项只是其中一个 occupant，key 仍是 `quote`，因此真正「占住」了官方
 * 引用钮的位置。本文件只留两块：
 *
 * - **store**：多选收藏、编辑卡状态——纯逻辑，工具栏与编辑卡都经它连接；
 * - **多选收集面板**：浮动「已收集 N 段」面板，跨多次选择续存，故不挂工具栏的
 *   挂载/卸载，单独由 {@link startMultiSelectPanel} 驱动。
 *
 * 编辑卡本体在 selection-edit-card.tsx（React，挂 overlay 座位），与本文件经
 * store 连接。
 */
import type { RuntimeT } from './locales.ts'

/** 当前会话编号：会话根节点上框架写的 data-conversation-session。 */
export function currentSessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/** 多选收藏里的一条：捕获时的文本。 */
export interface MultiItem {
  readonly id: number
  readonly text: string
}

let multiSeq = 0
let multiItems: readonly MultiItem[] = []
let multiRanges: Range[] = []
/** 收藏归属的会话：浮动条只在当前激活会话 == 它时显示。 */
let multiSessionId: string | undefined = undefined
const multiListeners = new Set<() => void>()
const MULTI_HIGHLIGHT = 'dshca-multi'

/** 订阅多选收藏变化（浮动「编辑」钮走它）。 */
export function subscribeMultiItems(listener: () => void): () => void {
  multiListeners.add(listener)
  return () => { multiListeners.delete(listener) }
}

/** 当前多选收藏（引用稳定，可作 getSnapshot）。 */
export function getMultiItems(): readonly MultiItem[] {
  return multiItems
}

/** 把收藏里的 Range 重新刷进 Custom Highlight 注册表；API 缺席时安静跳过。 */
function applyMultiHighlight(): void {
  const holder = globalThis as {
    CSS?: { highlights?: Map<string, unknown> }
    Highlight?: unknown
  }
  if (holder.CSS?.highlights === undefined || holder.Highlight === undefined) {
    console.info('[dsh-chat-power] CSS Custom Highlight API unavailable; multi-select keeps text only')
    return
  }
  // 已失效（塌缩）的 Range 直接淘汰。
  multiRanges = multiRanges.filter(range => range.collapsed === false)
  if (multiRanges.length === 0) {
    holder.CSS.highlights.delete(MULTI_HIGHLIGHT)
    return
  }
  // Highlight 构造器的 lib.dom 签名（rest AbstractRange[]）与我们的封装
  // 对不上，这层浏览器 API 鸿沟用断言跨过；运行时是 **rest 参数**
  // new Highlight(...ranges)——不展开的话数组本身会被当成第一个 Range，
  // 构造器直接抛「not of type AbstractRange」（2026-11-05 现场）。
  const HighlightCtor = holder.Highlight as unknown as new (...ranges: Range[]) => unknown
  holder.CSS.highlights.set(MULTI_HIGHLIGHT, new HighlightCtor(...multiRanges))
}

/** 把当前选区加入多选收藏并保持高亮。 */
export function addMultiItem(text: string, range: Range, sessionId?: string): MultiItem {
  // 收藏绑定到收集时的会话：换会话收集会清掉旧会话的收藏流，重开一份。
  if (multiSessionId !== undefined && multiSessionId !== sessionId) clearMultiItems()
  if (multiSessionId === undefined) multiSessionId = sessionId
  multiSeq += 1
  const item: MultiItem = { id: multiSeq, text }
  multiItems = [...multiItems, item]
  multiRanges = [...multiRanges, range]
  applyMultiHighlight()
  for (const listener of multiListeners) listener()
  return item
}

/** 移除一条多选收藏（对应的高亮一并撤掉，其余条目保持原顺序）。 */
export function removeMultiItem(id: number): void {
  const index = multiItems.findIndex(item => item.id === id)
  if (index < 0) return
  multiItems = multiItems.filter(item => item.id !== id)
  multiRanges = multiRanges.filter((_, position) => position !== index)
  applyMultiHighlight()
  for (const listener of multiListeners) listener()
}

/** 清空多选收藏（高亮与归属会话一并清掉）。 */
export function clearMultiItems(): void {
  multiItems = []
  multiRanges = []
  multiSessionId = undefined
  applyMultiHighlight()
  for (const listener of multiListeners) listener()
}

/** 多选收藏按原顺序拼接，项与项之间用一个空行隔开。 */
export function joinMultiTexts(items: readonly MultiItem[]): string {
  return items.map(item => item.text).join('\n\n')
}

/** 编辑卡状态：open 时的文本、所属会话、是否来自多选收藏、以及重挂载用的 seq。 */
export interface SelectionEditState {
  readonly text: string
  readonly sessionId: string | undefined
  readonly multi: boolean
  readonly seq: number
}

let editSeq = 0
let editState: SelectionEditState | null = null
const editListeners = new Set<() => void>()

/** 订阅编辑卡状态（React 卡片走它）。 */
export function subscribeSelectionEdit(listener: () => void): () => void {
  editListeners.add(listener)
  return () => { editListeners.delete(listener) }
}

/** 当前编辑卡状态；null 为关闭（引用稳定，可作 getSnapshot）。 */
export function getSelectionEdit(): SelectionEditState | null {
  return editState
}

/**
 * 编辑卡是否该在当前视图渲染：状态存在，且（能读到激活会话时）只属于
 * 打开时的那个会话——overlay 座位是会话作用域，不滤的话每个打开过的
 * 会话都会渲染同一张卡、盖住各自的输入框。
 * @param state - 编辑卡状态。
 * @param activeKey - 当前激活会话的 key（读不到时放行，避免整卡消失）。
 * @returns 当前视图是否应渲染编辑卡。
 */
export function selectionEditVisible(state: SelectionEditState | null, activeKey: string | undefined): boolean {
  if (state === null) return false
  return boundToActiveSession(state.sessionId, activeKey)
}

/**
 * 「绑定会话的浮层」是否该在当前视图显示：绑定会话或激活会话读不到时
 * 放行（避免整块消失），否则只在绑定会话 == 激活会话时显示。
 */
export function boundToActiveSession(boundId: string | undefined, activeKey: string | undefined): boolean {
  if (activeKey === undefined) return true
  // 绑定时读不到会话归属：无法判定，放行。
  if (boundId === undefined) return true
  return boundId === activeKey
}

/**
 * 打开编辑卡。sessionId 记录打开时的激活会话：卡片只在该会话的视图里
 * 显示（见 selectionEditVisible）。multi=true 表示内容来自多选收藏：
 * 关闭/发送后连同收藏与高亮一起清掉；单选编辑不影响收藏。
 */
export function openSelectionEdit(text: string, multi: boolean, sessionId: string | undefined): void {
  editSeq += 1
  editState = { text, sessionId, multi, seq: editSeq }
  for (const listener of editListeners) listener()
  // 编辑卡挂在输入框上方的浮层座位里：编辑标签打开时输入框被隐藏、卡片会
  // 失去锚点掉到输入框下面——广播一个事件，让工具区切回聊天、恢复输入框。
  try {
    window.dispatchEvent(new CustomEvent('chat-power:selection-edit-open', {
      detail: { sessionId: sessionId ?? '' },
    }))
  } catch { /* 非浏览器环境忽略 */ }
}

/** 关闭编辑卡；多选来源的关闭会连多选收藏与高亮一起清掉。 */
export function closeSelectionEdit(): void {
  const fromMulti = editState?.multi === true
  editState = null
  if (fromMulti) clearMultiItems()
  for (const listener of editListeners) listener()
}

/**
 * 从宿主 uiSession 服务组装「当前激活会话 key」的读取/订阅器；
 * 服务缺席时 getKey 落回 DOM 属性、订阅退化为空。
 * @param ctx - 宿主上下文（任意持有 uiSession 服务的对象）。
 * @returns getKey / subscribeKey 一对访问器。
 */
export function sessionKeyAccessorsOf(ctx: unknown): {
  getKey: () => string | undefined
  subscribeKey: (listener: () => void) => () => void
} {
  type UiSessionHolder = {
    uiSession?: {
      adapter?: {
        current?: {
          getSnapshot?: () => { key?: string }
          subscribe?: (listener: () => void) => () => void
        }
      }
    }
  }
  const holder = (): UiSessionHolder | undefined => {
    // 宿主契约：ctx.get 只允许读入口 inject 声明过的服务；未声明时直接抛错
    // 而不是返回 undefined——这里吞掉并落回 undefined，调用方走 DOM 兜底。
    try {
      return ctx as UiSessionHolder | undefined
    } catch {
      return undefined
    }
  }
  return {
    getKey: () => {
      const key = holder()?.uiSession?.adapter?.current?.getSnapshot?.()?.key
      if (key !== undefined && key !== '') return key
      return currentSessionIdFromDom()
    },
    subscribeKey: listener => {
      const subscribe = holder()?.uiSession?.adapter?.current?.subscribe
      return typeof subscribe === 'function' ? subscribe(listener) : () => {}
    },
  }
}

/** 多选收集面板的样式；类名带 dshca- 前缀避免与页面样式冲突。材质走宿主语义 token。 */
const PANEL_CSS = [
  // 多选高亮：CSS Custom Highlight API（Chromium），不动宿主 DOM；缺席时
  // 只收藏文本、不做视觉标记。品牌色 30% 透明版（color-mix 从宿主 token 调出）。
  `::highlight(dshca-multi){background-color:color-mix(in srgb,var(--dsw-alias-state-business-primary,rgb(59 130 246)) 30%,transparent)}`,
  // 多选收集面板：单一容器（宽度为会话区域一半），条目纵向堆叠（间距 4px），
  // 超过 40vh 限高、面板内部滚动——不再无限覆盖正文。
  '.dshca-panel{position:fixed;z-index:90;display:flex;flex-direction:column;gap:4px;box-sizing:border-box;',
  'max-height:min(40vh,320px);overflow-y:auto;padding:6px;border-radius:10px;',
  'background:var(--dsw-alias-bg-overlay,rgb(255 255 255 / 96%));',
  'border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.2));box-shadow:0 4px 16px rgb(0 0 0 / 16%)}',
  // 面板里的一条收藏：32px 行高，预览 + 24px 移除热区。
  '.dshca-bar{display:flex;align-items:center;gap:8px;flex:none;height:32px;padding:0 10px;border-radius:8px;',
  'background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08))}',
  '.dshca-bar-dot{width:8px;height:8px;border-radius:50%;flex:none;',
  'background:var(--dsw-alias-state-business-primary,rgb(59 130 246))}',
  '.dshca-bar-text{text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-primary,inherit);',
  'flex:1;min-width:0;font-size:12px;line-height:20px;overflow:hidden}',
  '.dshca-bar-remove{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary,inherit);cursor:pointer;background:0 0;border:none;',
  'border-radius:6px;flex:none;width:24px;height:24px;font-size:14px;line-height:1}',
  '.dshca-bar-remove:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary,inherit)}',
  // 面板脚注：收集计数 + 「编辑 (n)」入口。
  '.dshca-panel-foot{display:flex;align-items:center;gap:8px;flex:none;height:28px;padding:0 6px;',
  'font-size:12px;color:var(--dsw-alias-label-secondary,inherit)}',
  '.dshca-bar-edit{margin-left:auto;border:1px solid var(--dsw-alias-border-l4,rgba(127,127,127,.25));',
  'border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary,inherit);',
  'font:inherit;font-size:12px;line-height:18px;padding:2px 10px;cursor:pointer;white-space:nowrap}',
  '.dshca-bar-edit:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12))}',
  '.dshca-bar-edit:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary,var(--dsw-alias-brand-primary,currentColor));outline-offset:1px}',
  // 轻提示（toast）：中性深底浮层，只用于「没有找到输入框」等短反馈。
  '.dshca-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:70;',
  'padding:6px 14px;border-radius:8px;background:var(--dsw-alias-toast-bg,rgb(48 48 54 / 94%));',
  'color:var(--dsw-alias-toast-label,#fff);font-size:12px;pointer-events:none}',
].join('')

/**
 * 启动多选收集面板：注入样式、挂面板、随 store 变化重建。
 *
 * 面板**不**随工具栏的挂载/卸载走——它跨多次选择续存（收集 → 再选择 → 再
 * 收集），所以单独由本函数驱动，与 selection-toolbar 互不依赖。
 * @param options - 文案与当前激活会话 key 的读取器。
 * @returns 清理函数：摘掉样式、监听与面板元素。
 */
export function startMultiSelectPanel(options: {
  t: RuntimeT
  /** 当前激活会话 key 的读取器；面板只在收藏归属会话 == 它时显示。 */
  currentSessionKey?: () => string | undefined
}): () => void {
  if (typeof document === 'undefined') return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = 'dsh-chat-power'
  style.dataset.pluginCss = 'dsh-chat-power/multi-select-panel'
  style.textContent = PANEL_CSS
  document.head.appendChild(style)

  const BAR_TOP_GAP = 8
  const LEFT_PAD = 16
  const multiBarEls: HTMLElement[] = []
  const removeMultiBars = (): void => {
    for (const el of multiBarEls) el.remove()
    multiBarEls.length = 0
  }
  const rebuildPanel = (): void => {
    removeMultiBars()
    const items = getMultiItems()
    if (items.length === 0) return
    // 编辑卡打开中（多选模式）：浮动条让位给占满会话区域的编辑卡。
    const editing = getSelectionEdit()
    if (editing !== null && editing.multi) return
    // 会话绑定：浮动条只出现在收藏归属的那个会话视图里。
    if (!boundToActiveSession(multiSessionId, options.currentSessionKey?.())) return
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (scroller === null) return
    const rect = scroller.getBoundingClientRect()
    const left = rect.left + LEFT_PAD
    const width = Math.max((rect.width - LEFT_PAD * 2) / 2, 240)
    const panel = document.createElement('div')
    panel.className = 'dshca-panel'
    panel.dataset.dshcaPanel = ''
    panel.style.left = `${left}px`
    panel.style.top = `${rect.top + BAR_TOP_GAP}px`
    panel.style.width = `${width}px`
    for (const item of items) {
      const bar = document.createElement('div')
      bar.className = 'dshca-bar'
      bar.dataset.dshcaBar = ''
      const dot = document.createElement('span')
      dot.className = 'dshca-bar-dot'
      dot.setAttribute('aria-hidden', 'true')
      const preview = document.createElement('span')
      preview.className = 'dshca-bar-text'
      const flat = item.text.replace(/\s+/g, ' ')
      preview.textContent = flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
      preview.title = item.text
      const remove = document.createElement('button')
      remove.type = 'button'
      remove.className = 'dshca-bar-remove'
      remove.dataset.action = 'remove-multi'
      remove.setAttribute('aria-label', options.t('selection.removeItem'))
      remove.title = options.t('selection.removeItem')
      remove.textContent = '×'
      remove.addEventListener('click', () => { removeMultiItem(item.id) })
      bar.append(dot, preview, remove)
      panel.append(bar)
    }
    const foot = document.createElement('div')
    foot.className = 'dshca-panel-foot'
    const count = document.createElement('span')
    count.textContent = options.t('selection.collectedCount', { count: String(items.length) })
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'dshca-bar-edit'
    edit.dataset.action = 'edit-multi'
    edit.textContent = options.t('selection.editCount', { count: String(items.length) })
    edit.addEventListener('click', () => {
      openSelectionEdit(joinMultiTexts(getMultiItems()), true, options.currentSessionKey?.())
    })
    foot.append(count, edit)
    panel.append(foot)
    document.body.appendChild(panel)
    multiBarEls.push(panel)
  }
  rebuildPanel()
  const unsubscribeChip = subscribeMultiItems(rebuildPanel)
  const unsubscribeEdit = subscribeSelectionEdit(rebuildPanel)
  const onResize = (): void => { rebuildPanel() }
  window.addEventListener('resize', onResize)

  return () => {
    window.removeEventListener('resize', onResize)
    unsubscribeChip()
    unsubscribeEdit()
    removeMultiBars()
    style.remove()
  }
}
