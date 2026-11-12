/**
 * 会话轮次折叠与当前轮限高（DOM 控制器）。
 *
 * 宿主 0.2.2 的聊天流每行带 `data-chat-turn="<轮次号>"`，同轮多行同号；滚动容器是
 * `[data-conversation-scroll]`。宿主没有「整轮级」座位，所以轮次级的折叠与限高只能
 * 在 DOM 层做——**只加属性、插自己的元素，不移动也不改写宿主节点**（与文件树装饰、
 * 选区浮层同一路子）。
 *
 * 三条用户诉求与本模块的分工：
 * - 「思考块默认折叠、过程中展示、结束后自动折叠」由**宿主设置**实现
 *   （工作步骤收起时机＝回答结束后；收起后显示的回复＝仅最终回答），本模块不碰；
 * - 「当前轮不超过一屏」由 {@link allocateRowHeights} 按比例分摊行高上限实现；
 * - 「新请求后历史轮折叠成小块、可展开可再收起」由折叠状态机 + 摘要条实现。
 *
 * 宿主重渲染可能把插件插入的摘要条冲掉，观察器负责补回；会话切换时整套状态重置，
 * 不把上一会话的折叠状态带到新会话。
 */
import { fallbackT } from './locales.ts'
import type { RuntimeT } from './locales.ts'
import css from './turn-fold.module.css'
import { ensureComposerResize, ensureFrameResizeHandles, removeResizeHandles } from './frame-resize.ts'

/** 行元素的最小面：轮次号与文本（便于在无 DOM 环境里测试）。 */
export interface TurnRowLike {
  getAttribute(name: string): string | null
  textContent: string | null
}

/** 一个轮次分组：轮次号 + 该轮的行（按出现顺序）。 */
export interface TurnGroup {
  readonly number: number
  readonly rows: readonly TurnRowLike[]
}

/** 宿主在每行上标的轮次号。 */
export const TURN_ATTR = 'data-chat-turn'

/**
 * 按轮次号把行分组：组内保持行序，组间保持首次出现顺序。
 * 没有轮次号（或轮次号不是数字）的行不参与分组——宿主的装饰行、插件自己的条
 * 都属于这一类。
 * @param rows - 候选行（通常是滚动容器里的直接子行）。
 * @returns 轮次分组，按首次出现顺序。
 */
export function groupTurnsByNumber(rows: readonly TurnRowLike[]): TurnGroup[] {
  const groups = new Map<number, TurnRowLike[]>()
  for (const row of rows) {
    const raw = row.getAttribute(TURN_ATTR)
    if (raw === null) continue
    const value = Number(raw)
    if (!Number.isSafeInteger(value)) continue
    const bucket = groups.get(value)
    if (bucket === undefined) groups.set(value, [row])
    else bucket.push(row)
  }
  return [...groups.entries()].map(([number, groupRows]) => ({ number, rows: groupRows }))
}

/**
 * 首句摘要：取该轮第一段非空文本，压缩空白，超长截断。
 * @param rows - 该轮的行。
 * @param limit - 摘要最大字数；缺省 40。
 * @returns 摘要文本；整轮无文本时是空串。
 */
export function summarizeTurn(rows: readonly TurnRowLike[], limit = 40): string {
  for (const row of rows) {
    const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (text === '') continue
    return text.length > limit ? `${text.slice(0, limit)}…` : text
  }
  return ''
}

/**
 * 时刻格式化：本地时区的 HH:MM（摘要条上显示“这一轮发生在几点”）。
 * @param timestamp - 毫秒时间戳。
 * @returns 形如 09:05 的文本。
 */
export function formatClock(timestamp: number): string {
  const at = new Date(timestamp)
  const hours = String(at.getHours()).padStart(2, '0')
  const minutes = String(at.getMinutes()).padStart(2, '0')
  return `${hours}:${minutes}`
}

/** 可用高度的下限：再窄也要给内容留一点可视高度。 */
export const MIN_AVAILABLE_HEIGHT = 240

/** 插件给「由我们收起的思考组」加的标记（CSS 据此只隐藏组体，组头保留）。 */
export const GROUP_HIDDEN_ATTR = 'data-chat-power-group-hidden'

/** 框内页签：请求 / 过程 / 结果。默认展示结果。 */
export type TurnTab = 'request' | 'process' | 'result'

/** 框标题行页签按钮的标记（data-tab 值为页签名）。 */
export const TURN_TAB_ATTR = 'data-chat-power-turn-tab'

/** 框标题行标记。 */
export const TURN_HEADER_ATTR = 'data-chat-power-turn-header'

/** 过程页签的分页大小：每页展示的段数（思考/工具各算一段）。 */
export const PROCESS_PAGE_SIZE = 50

/** 每轮统一输出框的标记。 */
export const TURN_FRAME_ATTR = 'data-chat-power-turn-frame'
/** 框标题行里轮次标题的标记。 */
export const TURN_TITLE_ATTR = 'data-chat-power-turn-title'
/** 框标题行里「本轮文件」按钮的标记。 */
export const TURN_FILES_ATTR = 'data-chat-power-turn-files'
/** 框在文件列表展开态的标记（挂在框上）。 */
export const TURN_FILES_OPEN_ATTR = 'data-chat-power-files-open'
/** 被当前页签隐藏的宿主行标记（CSS 据此 display:none）。 */
export const TAB_HIDDEN_ATTR = 'data-chat-power-tab-hidden'
/** 过程页签「展示更多」条的标记。 */
export const SHOW_MORE_ATTR = 'data-chat-power-show-more'

/** 输入框标题栏的标记（点赞行与快捷按钮的新家）。 */
export const COMPOSER_BAR_ATTR = 'data-chat-power-composer-bar'

/** 插件插入的「请求条」标记：用户请求折成一行，点一下展开。 */
export const REQUEST_BAR_ATTR = 'data-chat-power-request-bar'

/** 插件给「被收起的用户请求行」加的标记。 */
export const REQUEST_HIDDEN_ATTR = 'data-chat-power-request-collapsed'

/**
 * 用户的行：首条用户消息、补发消息（steering），以及对模型提问的回答
 * （`question-reply`——宿主的 user-questions 界面认领渲染的行，不带 user 标记）。
 * 三者都随「请求 · 首句」条折叠，免得占着当前轮的空间把回答框往下挤。
 */
export const USER_ROW_SELECTOR =
  '[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"],[data-chat-flow-kind="question-reply"]'

/** 输出框里当前展示的内容类型（框左上角的文案）。 */
export type FrameKind = 'thinking' | 'tools' | 'answer'

/**
 * 判定输出框当前展示的是什么内容。
 *
 * 宿主把思考、工具调用、回答分别渲染成不同的行：思考行带 `data-chat-group-part`，
 * 工具调用行的 flow kind 是 `tool-call`，回答行里有我们自己的答案卡。
 *
 * @param content - 这一框里出现过的内容标记。
 * @returns 内容类型；有回答就是回答，其次工具调用，最后思考。
 */
export function frameKindOf(content: {
  readonly hasAnswer: boolean
  readonly hasToolCalls: boolean
  readonly hasReasoning: boolean
}): FrameKind {
  if (content.hasAnswer) return 'answer'
  if (content.hasToolCalls) return 'tools'
  if (content.hasReasoning) return 'thinking'
  return 'answer'
}

/**
 * 把某一轮的顶端对齐到滚动容器的顶端所需的 scrollTop。
 *
 * 历史轮次折成摘要条后仍排在流里，会和最后一轮挤在同一屏。滚到「当前轮从顶端
 * 开始」的位置，历史轮次就被顶到屏幕外——往上滚还能看回去。
 *
 * @param rowTop - 目标轮次顶端在视口里的位置。
 * @param containerTop - 滚动容器顶端在视口里的位置。
 * @param scrollTop - 容器当前的 scrollTop。
 * @returns 目标 scrollTop（不小于 0）。
 */
export function scrollTopForTurnTop(rowTop: number, containerTop: number, scrollTop: number): number {
  return Math.max(0, Math.round(rowTop - containerTop + scrollTop))
}

/**
 * 摘要条文本：轮次号 · 时刻 · 首句摘要（没有摘要时省掉末段）。
 * @param number - 轮次号。
 * @param clock - 时刻（HH:MM）。
 * @param summary - 首句摘要。
 * @param format - 词典函数；缺省用本地词典（中文）。
 * @returns 摘要条文本。
 */
export function turnStripText(
  number: number,
  clock: string,
  summary: string,
  format?: (key: string, params?: Record<string, string | number>) => string,
): string {
  const t = format ?? fallbackT
  const key = summary === '' ? 'turnFold.label' : 'turnFold.labelWithSummary'
  return t(key, { turn: number, clock, summary })
}

/** 插件给被限高的行加的标记（CSS 据此开启内部滚动）。 */
export const CAPPED_ATTR = 'data-chat-power-capped'

/** 插件插在输出框左上角的文案（思考 / 工具调用 / 回答）。 */
export const FRAME_LABEL_ATTR = 'data-chat-power-frame-label'

/** 限高时给会话区留的余量（框底到输入框之间的间距）。 */
const HEIGHT_MARGIN = 42

/**
 * 输出框的可用高度预算：可视区 − 输入框 − 余量 − 框下面的小行。
 *
 * 框**上面**的内容（请求条、过程行、提问与回答）不参与预算——框的高度固定，
 * 上面的块被吸顶对齐顶出屏幕上方，而不是把框压矮（2026-11-12 的挤压故障）。
 */
export function frameBudgetHeight(viewport: number, composerHeight: number, belowHeight: number): number {
  if (viewport <= 0) return 0
  return Math.max(0, Math.floor(viewport - composerHeight - HEIGHT_MARGIN - belowHeight))
}

/** 心跳间隔：聊天区晚挂载或被换掉时的重试节奏。 */
const RETRY_INTERVAL_MS = 500

/** 一轮的状态：行、首见时刻、框与页签。 */
interface TurnRecord {
  number: number
  rows: HTMLElement[]
  firstSeenAt: number
  summary: string
  /** 本轮的统一输出框（每轮一框）。 */
  frame?: HTMLElement
  /** 当前展示的页签：request / process / result。 */
  tab: TurnTab
  /** 过程页签已展开的段数（分页）。 */
  processShown: number
  /** 标题行元素（页签与文件按钮的宿主）。 */
  header?: HTMLElement
  /** 文件按钮（历史轮没有本轮文件时不存在）。 */
  filesBtn?: HTMLElement
}

/** 折叠控制器的可注入面（便于测试与宿主差异适配）。 */

/** 一条快捷信息：发送到会话的文本 + 稳定 id（删除 / 修改按 id 定位）。 */
export interface QuickMessage {
  readonly id: string
  readonly text: string
}

/** 快捷信息的存储键（localStorage；值为 JSON 数组）。 */
export const QUICK_MESSAGES_KEY = 'chat-power.quick-messages'

/** 内置快捷信息（用户没存过或存储读不下来时用）。 */
const BUILTIN_QUICK_MESSAGES: readonly QuickMessage[] = [
  { id: 'commit', text: '请将当前改动提交到本地仓库（commit）。' },
  { id: 'merge', text: '请将当前分支合并回 main（merge）。' },
  { id: 'sync', text: '请将本地仓库与远程同步：先拉取远端更新，再推送本地提交。' },
]

/** 快捷信息存储读取面（localStorage 的最小切片，测试可注入）。 */
export type QuickStorage = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** 读存储里的快捷信息；坏 JSON / 结构不对 / 空数组都退回内置三条。 */
export function loadQuickMessages(read: (key: string) => string | null): QuickMessage[] {
  let raw: string | null = null
  try {
    raw = read(QUICK_MESSAGES_KEY)
  } catch {
    raw = null
  }
  if (raw !== null) {
    try {
      const value = JSON.parse(raw) as unknown
      if (Array.isArray(value)) {
        const messages = value.filter((item): item is QuickMessage =>
          typeof item === 'object' && item !== null &&
          typeof (item as { id?: unknown }).id === 'string' &&
          typeof (item as { text?: unknown }).text === 'string',
        )
        if (messages.length > 0) return messages
      }
    } catch {
      // 坏 JSON：落到内置。
    }
  }
  return [...BUILTIN_QUICK_MESSAGES]
}

/** 写回快捷信息：剔除空文本；id 缺失时按文本补一个稳定 id。 */
export function saveQuickMessages(messages: readonly QuickMessage[], write: (key: string, value: string) => void): void {
  const cleaned: QuickMessage[] = []
  for (const item of messages) {
    const text = item.text.trim()
    if (text === '') continue
    const id = item.id !== '' ? item.id : `q-${text}`
    cleaned.push({ id, text })
  }
  try {
    write(QUICK_MESSAGES_KEY, JSON.stringify(cleaned))
  } catch {
    // 存不了（隐私模式）就只影响本页。
  }
}

/** 页面 localStorage 读取面（jsdom / 浏览器都有；隐私模式可能抛错）。 */
function quickStorageOf(): QuickStorage | undefined {
  if (typeof localStorage === 'undefined') return undefined
  return {
    getItem: key => localStorage.getItem(key),
    setItem: (key, value) => { localStorage.setItem(key, value) },
  }
}

/** 面板与按钮之间的间距（px）。 */
const PANEL_GAP = 6
/** 面板距视口边缘的最小间距（px）。 */
const VIEWPORT_MARGIN = 8

/**
 * 面板摆放位置（纯逻辑，便于测试）：**优先上方**——列表和编辑框都出现在按钮
 * 上方才顺（按钮本来就在屏幕下部，先判「下方放不放得下」会让面板几乎总是
 * 掉到下方）。上方余量不够时才退到下方；两种摆法都把面板钳在视口内。
 * 水平方向左对齐按钮（左缘内收 8px），超出右缘时右对齐到视口右缘内 8px。
 *
 * @param anchorRect - 按钮的视口坐标（top/bottom/left/width）。
 * @param panelHeight - 面板实测高度。
 * @param panelWidth - 面板实测宽度。
 * @param viewport - 视口尺寸。
 * @returns below（是否放下方）、top、left（面板应摆的视口坐标）。
 */
export function panelPlacement(
  anchorRect: { top: number, bottom: number, left: number, width: number },
  panelHeight: number,
  panelWidth: number,
  viewport: { width: number, height: number },
): { below: boolean, top: number, left: number } {
  // 上方余量：按钮顶到视口顶的距离（再扣面板与按钮的间距）。
  const aboveFits = anchorRect.top - PANEL_GAP >= panelHeight
  // 下方余量：按钮底到视口底的距离。
  const belowFits = viewport.height - anchorRect.bottom - PANEL_GAP >= panelHeight
  // 上方优先：上方放得下（或上下都放不下、上方余量更大）就摆上方。
  const below = !aboveFits && belowFits
  const top = below
    ? Math.min(anchorRect.bottom + PANEL_GAP, viewport.height - panelHeight - VIEWPORT_MARGIN)
    : Math.max(VIEWPORT_MARGIN, anchorRect.top - panelHeight - PANEL_GAP)
  let left = anchorRect.left - VIEWPORT_MARGIN
  if (left + panelWidth > viewport.width - VIEWPORT_MARGIN) {
    left = viewport.width - panelWidth - VIEWPORT_MARGIN
  }
  left = Math.max(VIEWPORT_MARGIN, left)
  return { below, top, left }
}

/** 编辑浮层的铅笔图标。 */
const PENCIL_SVG = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.2 2.2a1.6 1.6 0 0 1 2.6 2.6L6 12.5l-3.5.9.9-3.5 7.8-7.7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'

/** 插件插入的「快捷信息」按钮标记（点赞行里，替代原三个 git 按钮）。 */
export const QUICK_BTN_ATTR = 'data-chat-power-quick-btn'
/** 插件插入的「快捷信息」面板标记（挂在按钮内、绝对定位在上方）。 */
export const QUICK_PANEL_ATTR = 'data-chat-power-quick-panel'
/** 快捷方式图标（闪电形，与宿主 primitives 的 bolt 图标同形）。 */
export const QUICK_BTN_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8.9 1.5 3.4 8.2a.6.6 0 0 0 .46.98h2.9l-1.1 4.6a.6.6 0 0 0 1.05.53l5.5-6.7a.6.6 0 0 0-.46-.98h-2.9l1.1-4.6a.6.6 0 0 0-1.05-.53Z" fill="currentColor"/></svg>'

export interface TurnFoldOptions {
  /** 聊天滚动容器；缺省按 `[data-conversation-scroll]` 查。 */
  root?: () => Element | null
  /** 文案词典。 */
  t?: RuntimeT
  /** 注入 DOM 观察。 */
  observe?: (target: Element, callback: () => void) => () => void
  /** 注入时钟。 */
  now?: () => number
  /** 点快捷信息条：把文本发送到指定会话。 */
  onSendQuick?: (sessionId: string, text: string) => void
}

/**
 * 启动轮次折叠：新一轮出现时把历史轮折叠成摘要条，当前轮保持展开。
 *
 * 只做两件事：给宿主行加/去折叠属性、在该轮第一行前插入插件自己的摘要条。
 * 不移动宿主节点、不改写宿主内容；宿主重渲染冲掉摘要条时由观察器补回。
 *
 * @param options - 可注入的依赖与文案。
 * @returns 停止函数（移除摘要条、清掉折叠属性）。
 */
export function startTurnFold(options: TurnFoldOptions = {}): () => void {
  const t = options.t ?? fallbackT
  const now = options.now ?? (() => Date.now())
  const observe = options.observe ?? ((target: Element, callback: () => void) => {
    const observer = new MutationObserver(() => { callback() })
    observer.observe(target, { childList: true, subtree: true, attributes: true, attributeFilter: [TURN_ATTR] })
    return () => observer.disconnect()
  })

  let stopped = false
  let sessionKey: string | undefined
  let currentTurn = 0
  /** 待把当前轮顶到容器顶端（新一轮出现、或刚打开会话）。 */
  let pendingAlign = false
  /** 切换到的会话（其输出期间持续落底跟随；undefined = 不跟随）。 */
  let followTailSession: string | undefined = undefined
  /**
   * 用户的滚动意图：贴底 = 跟随输出；上滚 = 停止跟随、保持阅读位置。
   * 由会话滚动容器的 scroll 事件维护；程序化落底也经它复核（落底后恒为贴底）。
   */
  let userAtBottom = true
  let lastOrderLog = ''
  let records = new Map<number, TurnRecord>()
  let stopObserving: (() => void) | undefined
  let composerObserver: ResizeObserver | undefined
  let observedContainer: Element | undefined
  let retryTimer: number | undefined
  let syncScheduled = false
  const onViewportChange = (): void => { scheduleSync() }

  const scroller = (): Element | null => {
    if (options.root !== undefined) return options.root()
    if (typeof document === 'undefined') return null
    return document.querySelector('[data-conversation-scroll]')
  }

  /** 取滚动容器里的聊天行：只取最外层带轮次号的元素（跳过嵌套的同名标记）。 */
  const rowsOf = (container: Element): HTMLElement[] => {
    const rows: HTMLElement[] = []
    const found = container.querySelectorAll<HTMLElement>(`[${TURN_ATTR}]`)
    for (const row of Array.from(found)) {
      if (row.closest(`[${TURN_ATTR}]`) !== row) continue
      rows.push(row)
    }
    return rows
  }

  const sessionOf = (container: Element): string | undefined =>
    container.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? undefined

  const resetSession = (key: string | undefined): void => {
    for (const record of records.values()) {
      record.frame?.remove()
      for (const row of record.rows) row.removeAttribute(REQUEST_HIDDEN_ATTR)
    }
    records = new Map()
    currentTurn = 0
    // 刚打开一个会话：若它还在输出中，后续每次同步都落到底部（自动跟随 ✓），
    // 直到输出结束才停止跟随。
    followTailSession = key
    userAtBottom = true
    sessionKey = key
  }



  /**
   * 是否还在流式输出。
   *
   * 宿主在生成时挂 `[data-chat-running]` 标记；我们自己的答案卡也把宿主给的
   * 状态透出来（`data-answer-status="running"`）。两者都说明这一轮还在写。
   */
  const isLiveOutput = (): boolean => {
    if (typeof document === 'undefined') return false
    if (document.querySelector('[data-chat-running]') !== null) return true
    return document.querySelector('[data-answer-status="running"]') !== null
  }

  /**
   * 框**下面**占了多少高度：从框底到滚动内容末尾的**实测距离** ✓
   * （底部文件块、点赞行、行间距、宿主尾部空隙全在里面，不会漏 ✓）。
   * 输入框本身也排在滚动容器末尾、占位计入 scrollHeight，单独扣除 ✓。
   */
  /** 输入框的可见高度（会话可用高度要从它里面扣）。 */
  const measureComposerHeight = (container: Element): number => {
    const composer = container.querySelector('[data-composer-seat]')
    return composer === null ? 0 : composer.getBoundingClientRect().height
  }

  const belowFrameHeight = (framed: HTMLElement, container: Element): number => {
    const frameRect = framed.getBoundingClientRect()
    const viewRect = container.getBoundingClientRect()
    const contentBottom = viewRect.top + container.scrollHeight - container.scrollTop
    return Math.max(0, Math.round(contentBottom - frameRect.bottom - measureComposerHeight(container)))
  }

  /** 框本体：我们的元素（回答卡 / 思考帧）；没有就退回宿主行。 */
  const frameBoxOf = (row: HTMLElement): HTMLElement =>
    row.querySelector<HTMLElement>('[data-chat-power-frame-box]') ?? row

  /**
   * 过程组自己的组头（宿主的那句「工作步骤」摘要）让位给我们的帧。
   *
   * 组里的内容现在都由我们的帧渲染（思考帧、工具调用帧），组头是多余的，
   * 藏起来后框顶就是我们的标题行。
   */
  const yieldGroupHeadToThinking = (record: TurnRecord): void => {
    for (const row of record.rows) {
      if (!row.matches('[data-step-process]')) continue
      const head = row.firstElementChild
      if (head === null) continue
      head.setAttribute('data-chat-power-group-head-hidden', '')
    }
  }

  const markFrameState = (record: TurnRecord): void => {
    const live = isLiveOutput()
    const text = live ? t('turnFold.frameRunning') : ''
    for (const row of record.rows) {
      const box = frameBoxOf(row)
      const badge = box.querySelector('[data-chat-power-state]')
      if (badge === null) continue
      if (badge.textContent !== text) badge.textContent = text
    }
  }

  /**
   * 认出宿主那排点赞/点踩按钮，交给样式摆到回答框的标题栏里。
   *
   * 宿主把它们画在答案下面；我们只做标记（按 `aria-pressed` 认，不看文案），
   * 位置交给 CSS。
   */
  /**
   * 输入框标题栏：在 composer 座位顶部插一条插件自己的栏，把宿主画在消息底部
   * 的点赞行搬进去（不再占会话区的地方），快捷信息按钮也放这里。
   * 搬运是「移动引用」：holder 还是宿主的元素，只是换了父级；宿主重渲染会
   * 重建点赞行，观察器会再次把它搬回来。
   */
  const ensureComposerBar = (container: Element): void => {
    const seat = container.querySelector('[data-composer-seat]')
    if (seat === null) return
    // 宿主输入栈：composer seat 的第一层子元素是 composerStack（flex 列，
    // 输入卡在里面）——标题栏插进这根列的最顶上，与输入卡同宽、同宽窄变化。
    const stack = seat.firstElementChild
    if (stack === null) return
    let bar = stack.querySelector(`:scope > [${COMPOSER_BAR_ATTR}]`)
    if (bar === null) {
      bar = document.createElement('div')
      bar.setAttribute(COMPOSER_BAR_ATTR, '')
      bar.setAttribute('data-chat-power-frame-header', '')
      // 快捷信息按钮（会话号从会话根节点取）。
      const sessionId = container.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
      if (sessionId !== '') bar.append(buildQuickButton(sessionId))
      stack.insertBefore(bar, stack.firstChild)
    }
    // 宿主的点赞行容器（`[data-turn-tail]`，含 IconActions 那排）整体搬进标题栏：
    // tail 行还是宿主的元素，只是换了父级；宿主重渲染重建后观察器再搬回来。
    for (const tail of Array.from(container.querySelectorAll('[data-turn-tail]'))) {
      if (tail.parentElement === bar) continue
      if (tail.closest(`[${COMPOSER_BAR_ATTR}]`) === tail) continue
      tail.setAttribute('data-chat-power-feedback', '')
      bar.append(tail)
    }
  }

  /**
   * 快捷信息面板：挂在 body 下、按按钮视口坐标固定定位。
   *
   * 不嵌进宿主的消息 DOM——宿主随时会重渲染那块区域，嵌在里面就会被整块冲掉
   * （编辑框「总是容易消失」的根因）。一次只开一个面板。
   */
  let quickPanel: HTMLElement | undefined
  let quickPanelAnchor: HTMLElement | undefined
  /** 正在编辑的条目 id（列表态里点「编辑」）。 */
  let quickEditingId: string | undefined
  /** 「新增」草稿：尚未入库（保存时才写存储，取消即丢弃）。 */
  let quickDraft: QuickMessage | undefined

  const closeQuickPanel = (): void => {
    quickPanel?.remove()
    quickPanel = undefined
    quickPanelAnchor?.removeAttribute('data-open')
    quickPanelAnchor = undefined
    quickEditingId = undefined
    quickDraft = undefined
  }

  /**
   * 编辑态（独立界面）：整块只有编辑框与保存/取消——不渲染已有记录。
   * 「新增」与「编辑既有条目」共用这一块。
   */
  const renderQuickEditor = (panel: HTMLElement, sessionId: string, initial: string, onCommit: (text: string) => void): void => {
    const editor = document.createElement('textarea')
    editor.setAttribute('data-chat-power-quick-edit', '')
    editor.placeholder = t('turnFold.quickMessagesPlaceholder')
    editor.value = initial
    editor.addEventListener('keydown', event => {
      // Enter 提交（Shift+Enter 换行）；Escape 取消。事件不外泄。
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        onCommit(editor.value)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        closeQuickPanel()
      }
    })
    const actions = document.createElement('div')
    actions.setAttribute('data-chat-power-quick-actions', '')
    const save = document.createElement('button')
    save.setAttribute('type', 'button')
    save.textContent = t('turnFold.quickSave')
    save.addEventListener('click', event => {
      event.stopPropagation()
      onCommit(editor.value)
    })
    const cancel = document.createElement('button')
    cancel.setAttribute('type', 'button')
    cancel.textContent = t('turnFold.quickCancel')
    cancel.addEventListener('click', event => {
      event.stopPropagation()
      // 取消回到列表态（面板保持开着）：丢弃草稿 / 放弃编辑，不关整个面板。
      quickDraft = undefined
      quickEditingId = undefined
      renderQuickPanel()
    })
    actions.append(save, cancel)
    panel.append(editor, actions)
    editor.focus()
    void sessionId
  }

  /** 按视口坐标把面板定位到按钮上方；贴不下就放下方，超右缘右对齐。 */
  const positionQuickPanel = (panel: HTMLElement, anchor: HTMLElement): void => {
    const rect = anchor.getBoundingClientRect()
    panel.style.visibility = 'hidden'
    panel.style.display = 'flex'
    const place = panelPlacement(
      { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
      panel.offsetHeight,
      panel.offsetWidth,
      { width: window.innerWidth, height: window.innerHeight },
    )
    panel.style.top = `${place.top}px`
    panel.style.left = `${place.left}px`
    panel.style.visibility = ''
  }

  /** 重画面板（列表态：已有记录 + 新增钮；编辑态由 renderQuickEditor 独占整块）。 */
  const renderQuickPanel = (): void => {
    const panel = quickPanel
    if (panel === undefined) return
    while (panel.firstChild !== null) panel.removeChild(panel.firstChild)
    const sessionId = panel.dataset['session'] ?? ''
    const storage = quickStorageOf()
    const read = storage?.getItem.bind(storage) ?? (() => null)
    // 编辑态：独立界面，不显示已有记录。
    if (quickDraft !== undefined) {
      renderQuickEditor(panel, sessionId, '', text => {
        const trimmed = text.trim()
        if (trimmed !== '' && storage !== undefined) {
          const current = loadQuickMessages(storage.getItem.bind(storage))
          saveQuickMessages([...current, { id: quickDraft!.id, text: trimmed }], storage.setItem.bind(storage))
        }
        // 保存（或空文本放弃）后回到列表态：面板保持开着，可继续管理。
        quickDraft = undefined
        renderQuickPanel()
      })
      positionQuickPanel(panel, quickPanelAnchor ?? panel)
      return
    }
    if (quickEditingId !== undefined) {
      const editing = loadQuickMessages(read).find(item => item.id === quickEditingId)
      if (editing !== undefined) {
        renderQuickEditor(panel, sessionId, editing.text, text => {
          const trimmed = text.trim()
          if (storage !== undefined) {
            const current = loadQuickMessages(storage.getItem.bind(storage))
            const updated = trimmed === ''
              ? current.filter(item => item.id !== editing.id)
              : current.map(item => item.id === editing.id ? { ...item, text: trimmed } : item)
            saveQuickMessages(updated, storage.setItem.bind(storage))
          }
          quickEditingId = undefined
          renderQuickPanel()
        })
        positionQuickPanel(panel, quickPanelAnchor ?? panel)
        return
      }
      quickEditingId = undefined
    }
    // 列表态：每条一行（点条发送、右侧编辑/删除），底部新增钮。
    for (const message of loadQuickMessages(read)) {
      const row = document.createElement('button')
      row.setAttribute('type', 'button')
      row.setAttribute('data-chat-power-quick-row', '')
      row.title = message.text
      const label = document.createElement('span')
      label.setAttribute('data-chat-power-quick-text', '')
      label.textContent = message.text
      row.addEventListener('click', event => {
        event.stopPropagation()
        if (message.text.trim() === '' || sessionId === '') return
        options.onSendQuick?.(sessionId, message.text)
        closeQuickPanel()
      })
      const edit = document.createElement('span')
      edit.setAttribute('data-chat-power-quick-edit-btn', '')
      edit.setAttribute('role', 'button')
      edit.title = t('turnFold.quickEdit')
      edit.insertAdjacentHTML('afterbegin', PENCIL_SVG)
      edit.addEventListener('click', event => {
        event.stopPropagation()
        quickEditingId = message.id
        renderQuickPanel()
      })
      const remove = document.createElement('span')
      remove.setAttribute('data-chat-power-quick-remove-btn', '')
      remove.setAttribute('role', 'button')
      remove.title = t('turnFold.quickRemove')
      remove.textContent = '×'
      remove.addEventListener('click', event => {
        event.stopPropagation()
        if (storage !== undefined) {
          const current = loadQuickMessages(storage.getItem.bind(storage))
          saveQuickMessages(current.filter(item => item.id !== message.id), storage.setItem.bind(storage))
        }
        renderQuickPanel()
      })
      const tools = document.createElement('span')
      tools.setAttribute('data-chat-power-quick-tools', '')
      tools.append(edit, remove)
      row.append(label, tools)
      panel.append(row)
    }
    const add = document.createElement('button')
    add.setAttribute('type', 'button')
    add.setAttribute('data-chat-power-quick-add', '')
    add.textContent = t('turnFold.quickAdd')
    add.addEventListener('click', event => {
      event.stopPropagation()
      quickDraft = { id: `q-${Date.now()}`, text: '' }
      renderQuickPanel()
    })
    panel.append(add)
    positionQuickPanel(panel, quickPanelAnchor ?? panel)
  }

  /** 快捷信息按钮：点开面板；面板挂在 body 下，点面板外收起。 */
  const buildQuickButton = (sessionId: string): HTMLElement => {
    const btn = document.createElement('button')
    btn.setAttribute('type', 'button')
    btn.setAttribute(QUICK_BTN_ATTR, '')
    btn.setAttribute('title', t('turnFold.quickMessagesTitle'))
    btn.setAttribute('aria-label', t('turnFold.quickMessagesTitle'))
    btn.setAttribute('aria-haspopup', 'true')
    btn.insertAdjacentHTML('afterbegin', QUICK_BTN_SVG)
    btn.addEventListener('click', event => {
      event.stopPropagation()
      const reuse = quickPanelAnchor === btn && quickPanel !== undefined
      closeQuickPanel()
      if (reuse) return
      const panel = document.createElement('div')
      panel.setAttribute(QUICK_PANEL_ATTR, '')
      panel.dataset['session'] = sessionId
      // 面板内点击一律拦在面板容器上：不冒泡到宿主的监听（防止宿主重渲染冲掉面板）。
      panel.addEventListener('click', event => { event.stopPropagation() })
      if (typeof document === 'undefined') return
      document.body.appendChild(panel)
      btn.setAttribute('data-open', '')
      quickPanel = panel
      quickPanelAnchor = btn
      renderQuickPanel()
    })
    return btn
  }

  // 点面板外收起（capture：比宿主的别的处理早一步，不抢事件）。
  const onDocumentClick = (event: MouseEvent): void => {
    if (quickPanel === undefined) return
    const target = event.target
    if (target instanceof Element && (quickPanel.contains(target) || quickPanelAnchor?.contains(target) === true)) return
    closeQuickPanel()
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onDocumentClick, true)
  }

  /**
   * 给这一轮的统一框限高：最新轮 = 视口 − 输入框 − 余量 − 框下小行；
   * 历史轮 = 同款高度（也是一屏）。框内滚动查看全部内容，框高不变。
   */
  const applyCapsToFrame = (record: TurnRecord, container: Element): void => {
    const frame = record.frame
    if (frame === undefined || !frame.isConnected) return
    const viewport = (container as HTMLElement).clientHeight
    if (viewport <= 0) return
    const available = frameBudgetHeight(viewport, measureComposerHeight(container), 0)
    if (available <= 0) return
    // 框高度固定：min/max 都钉在预算上（底边拖拽把手仍可通过 --chat-power-resize 覆盖）。
    frame.style.setProperty('--chat-power-floor', `${Math.floor(available)}px`)
    frame.setAttribute(CAPPED_ATTR, '')
    // 最新轮还在流式输出：裁切；其余（历史轮/已完成）：框内滚动。
    const streaming = record.number === currentTurn && isLiveOutput()
    frame.setAttribute('data-chat-power-scroll', streaming ? 'clip' : 'auto')
  }

  /**
   * 输出框左上角的文案：按框里当前是什么内容显示 思考 / 工具调用 / 回答。
   *
   * 宿主把思考、工具调用、回答渲染成不同的行：思考行带 `data-chat-group-part`，
   * 工具调用行的 flow kind 是 `tool-call`，回答行里有我们自己的答案卡。
   */
  const frameLabelOf = (row: HTMLElement): FrameKind => frameKindOf({
    hasAnswer: row.querySelector('[data-answer-body]') !== null,
    hasToolCalls: row.querySelector('[data-chat-flow-kind="tool-call"]') !== null
      || row.querySelector('[data-chat-flow-kind="tool-calls"]') !== null,
    hasReasoning: row.querySelector('[data-chat-group-part="reasoning"]') !== null,
  })

  /**
   * 宿主的过程组头（「已完成 · 用时 3.2s」）。
   *
   * 它本来是独立一行、还能点开展开工作步骤。现在按要求把它收成一条提示：
   * 文字搬进回答栏（答案卡的头那一行），原来的按钮藏起来——不再独占一行，
   * 也不再提供展开。
   *
   * @param record - 当前轮。
   * @returns 提示文字；没有过程组时是 undefined。
   */
  const captureProcessHint = (record: TurnRecord): string | undefined => {
    for (const row of record.rows) {
      // 宿主把过程组头渲染成独立的节点行（它自己带 data-turn-process），
      // 也可能嵌在组里——两种都找。
      const button = row.matches('[data-turn-process]')
        ? row
        : row.querySelector('[data-turn-process]')
      if (button === null) continue
      // 按钮里第一个 span 才是「已完成 · 用时 3.2s」那段文字（后面是折叠箭头）。
      const label = button.querySelector('span')
      const text = ((label?.textContent ?? button.textContent) ?? '').replace(/\s+/g, ' ').trim()
      button.setAttribute('data-chat-power-hint', '')
      return text === '' ? undefined : text
    }
    return undefined
  }


  /** 在输出框上方插入（或更新）左上角文案；框不在了就撤掉。 */



  /**
   * 每轮一框：把这一轮的所有宿主行收进一个统一输出框。
   *
   * 实现方式：给该轮第一行**前面**插一个插件自己的框元素（`display: contents`
   * 包不住宿主行——宿主行是插件的兄弟节点，所以框只做「头部 + 视觉容器」，
   * 行本身留在原位，靠 CSS 把框与行并成一个视觉整体是不现实的）。
   * 取舍：框元素只承载**标题行 + 页签 + 内容视图**，宿主行按页签显示/隐藏
   * （结果=答案行可见、其余藏；请求=用户行可见；过程=思考/工具行分页可见）。
   * 框（含标题）插在该轮第一行前，行都跟在框后面。
   */
  const ensureTurnFrame = (record: TurnRecord, container: Element): void => {
    const firstRow = record.rows[0]
    if (firstRow === undefined) return
    const parent = firstRow.parentElement
    if (parent === null) return
    let frame = record.frame
    if (frame === undefined || !frame.isConnected || frame.parentElement !== parent) {
      frame?.remove()
      frame = document.createElement('div')
      frame.setAttribute(TURN_FRAME_ATTR, '')
      frame.setAttribute('data-chat-power-frame-box', '')
      frame.setAttribute('data-chat-power-kind', 'turn')
      parent.insertBefore(frame, firstRow)
      record.frame = frame
      console.info(`[chat-power] turn frame: 轮 ${record.number} 框已插入（行数 ${record.rows.length}）`)
    }
    // 行真正装进框：该轮所有行 + 本轮的文件尾行（turn-tail，不带轮次号所以
    // rowsOf 抓不到——按相邻轮次号补抓）按文档顺序移入框内（引用迁移，不复制）。
    // 宿主重渲染重建行后，观察器会在下一轮 sync 里把它们重新搬回来。
    for (const row of turnRowsWithTail(record, parent)) {
      if (row.parentElement !== frame) frame.append(row)
    }
    frame.dataset['turn'] = String(record.number)
    applyCapsToFrame(record, container)
  }

  /**
   * 这一轮应装进框的全部行：轮次行 + 紧随其后的文件尾行。
   *
   * 文件尾行（`[data-turn-tail]`）不带轮次号，宿主把它画在该轮最后一行之后；
   * 从第一行的下一个兄弟开始，连续收集 turn-tail 行（遇到下一轮的行就停）。
   */
  const turnRowsWithTail = (record: TurnRecord, parent: Element): readonly HTMLElement[] => {
    const rows = [...record.rows]
    const last = rows.at(-1)
    if (last === undefined) return rows
    let next = last.nextElementSibling
    while (next !== null) {
      if (next.hasAttribute(TURN_ATTR)) break
      if (next.hasAttribute(TURN_FRAME_ATTR)) break
      if (next.matches('[data-turn-tail]')) rows.push(next as HTMLElement)
      else break
      next = next.nextElementSibling
    }
    return rows
  }

  /**
   * 标题行：第 N 轮 · 用时 + 页签三枚（请求/过程/结果，默认结果）+ 文件按钮。
   * 挂在框元素里；宿主重渲染冲掉后由观察器补回。
   */
  const ensureTurnHeader = (record: TurnRecord): void => {
    const frame = record.frame
    if (frame === undefined) return
    let header = record.header
    if (header === undefined || !header.isConnected || header.parentElement !== frame) {
      header?.remove()
      header = document.createElement('div')
      header.setAttribute(TURN_HEADER_ATTR, '')
      header.setAttribute('data-chat-power-frame-header', '')
      // 标题文案：第 N 轮 · 用时（宿主过程组的提示文字，没有就只显轮次）。
      const title = document.createElement('span')
      title.setAttribute(TURN_TITLE_ATTR, '')
      header.append(title)
      // 页签三枚。
      for (const tab of ['request', 'process', 'result'] as const) {
        const tabBtn = document.createElement('button')
        tabBtn.setAttribute('type', 'button')
        tabBtn.setAttribute(TURN_TAB_ATTR, '')
        tabBtn.dataset['tab'] = tab
        tabBtn.textContent = tabLabelOf(tab)
        tabBtn.addEventListener('click', event => {
          event.stopPropagation()
          record.tab = tab
          applyTurnTab(record)
        })
        header.append(tabBtn)
      }
      // 文件按钮：只在最新轮放（历史轮的文件列表不一定进历史记录）。
      if (record.number === currentTurn) {
        const filesBtn = document.createElement('button')
        filesBtn.setAttribute('type', 'button')
        filesBtn.setAttribute(TURN_FILES_ATTR, '')
        filesBtn.textContent = t('turnFold.filesTab')
        filesBtn.addEventListener('click', event => {
          event.stopPropagation()
          const frameEl = record.frame
          if (frameEl === undefined) return
          const open = frameEl.hasAttribute(TURN_FILES_OPEN_ATTR)
          if (open) frameEl.removeAttribute(TURN_FILES_OPEN_ATTR)
          else frameEl.setAttribute(TURN_FILES_OPEN_ATTR, '')
          applyTurnTab(record)
        })
        header.append(filesBtn)
        record.filesBtn = filesBtn
      }
      frame.prepend(header)
      record.header = header
    }
    // 标题文案每次同步刷新（用时随输出更新）。
    const title = header.querySelector(`[${TURN_TITLE_ATTR}]`)
    const hint = captureProcessHint(record)
    if (title !== null) {
      const text = hint !== undefined
        ? t('turnFold.turnTitleWithDuration', { turn: record.number, duration: hint })
        : t('turnFold.turnTitle', { turn: record.number })
      if (title.textContent !== text) title.textContent = text
    }
  }

  /** 页签按钮文案。 */
  const tabLabelOf = (tab: TurnTab): string =>
    tab === 'request' ? t('turnFold.tabRequest')
      : tab === 'process' ? t('turnFold.tabProcess')
        : t('turnFold.tabResult')

  /**
   * 按当前页签显示/隐藏宿主行（不移动节点，只加标记；内容不预载——
   * 过程页签按 processShown 分页展示，点「展示更多」再加一页）。
   */
  const applyTurnTab = (record: TurnRecord): void => {
    const frame = record.frame
    if (frame === undefined) return
    frame.dataset['tab'] = record.tab
    frame.setAttribute('data-chat-power-frame', record.number === currentTurn ? 'current' : 'history')
    const isLive = record.number === currentTurn && isLiveOutput()
    // 结果页签（默认）：宿主的答案行可见；流式中所有行都可见（输出贴底继续）。
    const answerRows: HTMLElement[] = []
    const requestRows: HTMLElement[] = []
    const processRows: HTMLElement[] = []
    for (const row of record.rows) {
      if (row.matches(USER_ROW_SELECTOR)) requestRows.push(row)
      else if (row.querySelector('[data-answer-body]') !== null) answerRows.push(row)
      else processRows.push(row)
    }
    const hiddenAttr = TAB_HIDDEN_ATTR
    const show = (row: HTMLElement): void => row.removeAttribute(hiddenAttr)
    const hide = (row: HTMLElement): void => row.setAttribute(hiddenAttr, '')
    for (const row of record.rows) {
      if (isLive) { show(row); continue }
      if (record.tab === 'result') {
        // 结果视图：最后一条答案行**及其之后**的内容可见（答案、点赞行、文件块），
        // 之前的请求/过程行全藏（它们进各自的页签看）。
        const lastAnswer = answerRows.at(-1)
        if (lastAnswer === undefined) { show(row); continue }
        const precedes = (row.compareDocumentPosition(lastAnswer) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
        if (precedes) hide(row)
        else show(row)
      } else if (record.tab === 'request') {
        if (requestRows.includes(row)) show(row)
        else hide(row)
      } else {
        // 过程：分页展示前 processShown 段。
        const index = processRows.indexOf(row)
        if (index >= 0 && index < record.processShown) show(row)
        else hide(row)
      }
    }
    // 页签按钮选中态 + 过程页签的「展示更多」条。
    for (const btn of frame.querySelectorAll(`[${TURN_TAB_ATTR}]`)) {
      const tab = (btn as HTMLElement).dataset['tab']
      btn.setAttribute('data-active', tab === record.tab ? '' : 'false')
      btn.setAttribute('aria-selected', tab === record.tab ? 'true' : 'false')
    }
    ensureShowMoreBar(record)
    // 复制按钮针对当前展示内容：把当前页签的可见文本写进框上的标记，
    // 由答案卡/标题行的复制按钮读取。
    frame.dataset['copyText'] = visibleTextOf(record)
  }

  /** 当前页签可见内容的纯文本（复制按钮用）。 */
  const visibleTextOf = (record: TurnRecord): string => {
    const frame = record.frame
    if (frame === undefined) return ''
    if (record.tab === 'request') {
      return record.rows
        .filter(row => row.matches(USER_ROW_SELECTOR) && !row.hasAttribute(TAB_HIDDEN_ATTR))
        .map(row => (row.textContent ?? '').trim())
        .filter(text => text !== '')
        .join('\n\n')
    }
    return (frame.parentElement?.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /** 过程页签的「展示更多」条：还有未展示的段时插在框尾。 */
  const ensureShowMoreBar = (record: TurnRecord): void => {
    const frame = record.frame
    if (frame === undefined) return
    if (record.tab !== 'process') return
    const processRows = record.rows.filter(row => !row.matches(USER_ROW_SELECTOR) && row.querySelector('[data-answer-body]') === null)
    if (processRows.length <= record.processShown) return
    let bar = frame.querySelector(`[${SHOW_MORE_ATTR}]`)
    if (bar === null) {
      bar = document.createElement('button')
      bar.setAttribute('type', 'button')
      bar.setAttribute(SHOW_MORE_ATTR, '')
      bar.addEventListener('click', event => {
        event.stopPropagation()
        record.processShown += PROCESS_PAGE_SIZE
        applyTurnTab(record)
      })
      frame.append(bar)
    }
    const remaining = processRows.length - record.processShown
    bar.textContent = t('turnFold.showMore', { count: remaining })
  }

  /**
   * 流式输出时每帧都有 DOM 变动；测量与写样式合并到下一帧执行，
   * 避免在每次变动里都做布局读取（那会让长回复越输出越卡）。
   */
  const scheduleSync = (): void => {
    if (stopped || syncScheduled) return
    syncScheduled = true
    const run = (): void => { syncScheduled = false; sync() }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 16)
  }

  /**
   * 思考块（宿主的过程组）：结果出来后一律收起——不管宿主是哪种展示模式。
   *
   * 宿主自己在标准/详细模式下会把整组藏起来；完全展开模式下它永远展开。
   * 这里补上缺口：组里已经有结果时，把组内**除结果以外**的行（思考、工具调用）
   * 收起来，只留结果那一行——于是结果块自然占满整屏，组头（时长/状态）留着，
   * 用户点组头还能临时展开看。不改宿主的状态机，只加自己的标记。
   */
  const collapseThinking = (record: TurnRecord): void => {
    // 结果块可能在组外（单独一行），也可能在组内（宿主把结果步并进过程组）。
    const turnHasAnswer = record.rows.some(row => row.querySelector('[data-answer-body]') !== null)
    // 思考块有时是独立的一行（不在过程组里）：结果出来后它也得收起，
    // 否则它会跑到框下面去——框里只留结果块。
    if (turnHasAnswer) {
      for (const row of record.rows) {
        const isThinking = row.querySelector('[data-variant="think"]') !== null
          || row.querySelector('[data-chat-power-think-frame]') !== null
        if (!isThinking) continue
        // 行里同时有答案卡时不能整行藏掉（那是结果块本身）。
        if (row.querySelector('[data-answer-body]') !== null) continue
        row.setAttribute(GROUP_HIDDEN_ATTR, '')
      }
    }
    for (const row of record.rows) {
      if (!row.matches('[data-step-process]')) continue
      const members = Array.from(row.querySelectorAll<HTMLElement>(`[${TURN_ATTR}]`)).filter(el => el !== row)
      const insideAnswer = members.some(member => member.querySelector('[data-answer-body]') !== null)
      // 还没出结果：思考照常展示，不动它。
      if (!turnHasAnswer && !insideAnswer) continue
      const state = managedGroups.get(row)
      // 用户点开后保持展开，直到这一轮结束。
      if (state !== undefined && !state.collapsed) continue
      ensureGroupToggle(row)
      const hidden: HTMLElement[] = []
      for (const member of members) {
        if (member.querySelector('[data-answer-body]') !== null) continue
        member.setAttribute(GROUP_HIDDEN_ATTR, '')
        hidden.push(member)
      }
      if (state === undefined) managedGroups.set(row, { collapsed: true, hidden })
      else state.hidden = hidden
    }
  }

  /** 我们收起过的思考组：collapsed=true 表示当前是我们收起来的（可点开）。 */
  const managedGroups = new WeakMap<Element, { collapsed: boolean, hidden: HTMLElement[] }>()
  const groupListeners = new WeakSet<Element>()

  /** 组头点击：由我们收起的组，开合也由我们负责，不去抢宿主的状态机。 */
  const ensureGroupToggle = (group: Element): void => {
    if (groupListeners.has(group)) return
    groupListeners.add(group)
    group.addEventListener('click', (event: Event) => {
      const state = managedGroups.get(group)
      if (state === undefined) return
      event.preventDefault()
      event.stopPropagation()
      state.collapsed = !state.collapsed
      for (const member of state.hidden) {
        if (state.collapsed) member.setAttribute(GROUP_HIDDEN_ATTR, '')
        else member.removeAttribute(GROUP_HIDDEN_ATTR)
      }
    }, true)
  }


  /**
   * 把当前轮顶到滚动容器顶端：历史轮次的摘要条被顶到屏幕外，屏幕里只剩当前轮。
   * 只在「新的一轮出现」和「刚打开会话」时做一次，用户自己往回滚不会被拽回去。
   */
  const alignCurrentTurnToTop = (record: TurnRecord, container: Element): void => {
    const scrollable = container as HTMLElement
    if (typeof scrollable.scrollTop !== 'number') return
    // 吸顶对象：这一轮的统一框（每轮一框）。
    const anchor = record.frame ?? record.rows[0]
    if (anchor === undefined) return
    const target = scrollTopForTurnTop(
      anchor.getBoundingClientRect().top,
      container.getBoundingClientRect().top,
      scrollable.scrollTop,
    )
    if (Math.abs(target - scrollable.scrollTop) < 2) return
    scrollable.scrollTop = target
  }

  const sync = (): void => {
    if (stopped) return
    const container = scroller()
    if (container === null) return
    const key = sessionOf(container)
    if (key !== sessionKey) resetSession(key)
    // 输入框标题栏（点赞行迁移 + 快捷按钮）与拖拽把手：跟行无关，切会话/重渲染后也要补上。
    ensureComposerBar(container)
    ensureComposerResize(container, t('turnFold.composerResizeTitle'))
    const rows = rowsOf(container)
    if (rows.length === 0) return
    const groups = groupTurnsByNumber(rows)
    if (groups.length === 0) return
    // 自报状态：行序变化时输出当前轮次序列（判断宿主加载旧消息时插到头部还是尾部）。
    const orderSignature = groups.map(group => group.number).join(',')
    if (orderSignature !== lastOrderLog) {
      lastOrderLog = orderSignature
      console.info('[chat-power] turn fold: 轮次序列（文档顺序）[' + orderSignature + ']，总行数 ' + rows.length)
    }
    for (const group of groups) {
      const existing = records.get(group.number)
      if (existing === undefined) {
        records.set(group.number, {
          number: group.number,
          rows: group.rows as HTMLElement[],
          firstSeenAt: now(),
          summary: summarizeTurn(group.rows),
          tab: 'result',
          processShown: PROCESS_PAGE_SIZE,
        })
        continue
      }
      existing.rows = group.rows as HTMLElement[]
      if (existing.summary === '') existing.summary = summarizeTurn(group.rows)
    }
    for (const number of [...records.keys()]) {
      if (!groups.some(group => group.number === number)) records.delete(number)
    }
    const maxTurn = groups.reduce((max, group) => Math.max(max, group.number), 0)
    if (maxTurn > currentTurn) {
      currentTurn = maxTurn
      // 每轮一框：历史轮不再折叠，只是新一轮出现时把最新框滚进视野。
      pendingAlign = true
      console.info(`[chat-power] turn frame: 当前轮 → ${maxTurn}；总轮数 ${records.size}`)
    }
    for (const record of records.values()) {
      // 每个输出框底边的上下拖拽把手（冲掉了会补回）。
      // 每轮一框：先套框（把手挂在框上，必须先建框）。
      ensureTurnFrame(record, container)
      ensureFrameResizeHandles(record, t('turnFold.frameResizeTitle'))
      ensureTurnHeader(record)
      applyTurnTab(record)
      markFrameState(record)
    }
    if (followTailSession === key && isLiveOutput() && userAtBottom) {
      // 输出中：每次同步都落到底部（流式内容持续增长，保持跟随 ✓）。
      const scrollable = container as HTMLElement
      if (typeof scrollable.scrollTop === 'number') scrollable.scrollTop = scrollable.scrollHeight
    } else if (followTailSession === key && !isLiveOutput()) {
      // 该会话输出已结束：停止跟随（宿主恢复浏览位置）。
      followTailSession = undefined
    }
    if (pendingAlign) {
      pendingAlign = false
      const record = records.get(currentTurn)
      if (record !== undefined) {
        alignCurrentTurnToTop(record, container)
        // 宿主可能在我们之后又滚了一次（它要贴住最新内容），下一帧再对一次位。
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => {
            if (stopped) return
            const current = records.get(currentTurn)
            if (current !== undefined) alignCurrentTurnToTop(current, container)
          })
        }
      }
    }
  }

  /** 把观察器挂到当前滚动容器；容器换了（切会话/重渲染）就重挂。 */
  const attachTo = (container: Element): void => {
    stopObserving?.()
    observedContainer = container
    stopObserving = observe(container, () => { scheduleSync() })
    // 用户的滚动意图：贴底 = 跟随；上滚 = 停止跟随（保持阅读位置）。
    if (typeof container.addEventListener === 'function') {
      container.addEventListener('scroll', () => {
        const el = container as HTMLElement
        userAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24
        scheduleSync()
      }, { passive: true })
    }
    const composer = container.querySelector('[data-composer-seat]')
    composerObserver?.disconnect()
    composerObserver = undefined
    if (composer !== null && typeof ResizeObserver !== 'undefined') {
      composerObserver = new ResizeObserver(() => { scheduleSync() })
      composerObserver.observe(composer)
    }
  }

  /**
   * 心跳：聊天区可能晚于插件启动才挂载，或在切会话时被整个换掉。
   * 这里定期看一眼容器——换了就重挂观察器，没换就不做事（不做无谓的测量）。
   */
  const tick = (): void => {
    if (stopped) return
    const container = scroller()
    if (container === null) return
    if (container !== observedContainer) attachTo(container)
  }

  const attach = (): void => {
    const container = scroller()
    if (container !== null) attachTo(container)
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', onViewportChange)
      retryTimer = window.setInterval(tick, RETRY_INTERVAL_MS)
    }
    sync()
  }
  attach()

  return () => {
    stopped = true
    stopObserving?.()
    stopObserving = undefined
    composerObserver?.disconnect()
    composerObserver = undefined
    if (retryTimer !== undefined && typeof window !== 'undefined') window.clearInterval(retryTimer)
    retryTimer = undefined
    if (typeof window !== 'undefined') window.removeEventListener('resize', onViewportChange)
    if (typeof document !== 'undefined') document.removeEventListener('click', onDocumentClick, true)
    removeResizeHandles()
    // 快捷信息面板与按钮：一并摘掉（宿主重渲染后由新控制器重挂）。
    closeQuickPanel()
    for (const stale of document.querySelectorAll(`[${QUICK_BTN_ATTR}]`)) stale.remove()
    for (const record of records.values()) {
      record.frame?.remove()
      for (const row of record.rows) {
        row.removeAttribute(CAPPED_ATTR)
        row.removeAttribute(REQUEST_HIDDEN_ATTR)
        row.removeAttribute(TAB_HIDDEN_ATTR)
        row.removeAttribute(GROUP_HIDDEN_ATTR)
        row.style.removeProperty('--chat-power-cap')
        row.style.removeProperty('--chat-power-resize')
      }
    }
    records = new Map()
  }
}
