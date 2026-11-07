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
/** 插件给折叠中的轮次行加的标记（CSS 据此隐藏该行）。 */
export const COLLAPSED_ATTR = 'data-chat-power-collapsed'
/** 插件插入的摘要条 / 收起药丸的标记。 */
export const STRIP_ATTR = 'data-chat-power-turn-strip'

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

/** 插件插入的「请求条」标记：用户请求折成一行，点一下展开。 */
export const REQUEST_BAR_ATTR = 'data-chat-power-request-bar'

/** 插件给「被收起的用户请求行」加的标记。 */
export const REQUEST_HIDDEN_ATTR = 'data-chat-power-request-collapsed'

/** 用户的请求行（首条用户消息、补发消息）。 */
const USER_ROW_SELECTOR = '[data-chat-flow-kind="user"],[data-chat-flow-kind="steering"]'

/**
 * 结果块限高：给**最高的那一行**整屏高度，其余行保持原样。
 *
 * 早先的版本把超出高度按比例分给所有行，结果卡片被挤成一条缝；再早的版本只压
 * 最高行但压得太狠（只留 60px）。现在的前提是：思考块已收起、改动文件列表已折成
 * 小块，当前轮里最高的那个行就是结果块——给它整屏高度、内容在行内滚动即可。
 *
 * @param heights - 各行的内容高度。
 * @param available - 可用高度（会话区可视高度减去输入框与余量）。
 * @returns 与 heights 等长的上限数组；其余行保持原值。
 */
export function capTallestRow(heights: readonly number[], available: number): number[] {
  const caps = heights.slice()
  if (available <= 0 || heights.length === 0) return caps
  let tallest = -1
  heights.forEach((height, index) => {
    if (height <= 0) return
    if (tallest === -1 || height > (heights[tallest] ?? 0)) tallest = index
  })
  if (tallest === -1) return caps
  caps[tallest] = Math.min(heights[tallest] ?? 0, available)
  return caps
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
const HEIGHT_MARGIN = 32

/** 心跳间隔：聊天区晚挂载或被换掉时的重试节奏。 */
const RETRY_INTERVAL_MS = 500

/** 一轮的状态：行、首见时刻、摘要、是否折叠、摘要条元素。 */
interface TurnRecord {
  number: number
  rows: HTMLElement[]
  firstSeenAt: number
  summary: string
  collapsed: boolean
  strip?: HTMLElement
  requestBar?: HTMLElement
  frameLabel?: HTMLElement
  requestCollapsed: boolean
  requestSummary: string
}

/** 折叠控制器的可注入面（便于测试与宿主差异适配）。 */
export interface TurnFoldOptions {
  /** 聊天滚动容器；缺省按 `[data-conversation-scroll]` 查。 */
  root?: () => Element | null
  /** 文案词典。 */
  t?: RuntimeT
  /** 注入 DOM 观察。 */
  observe?: (target: Element, callback: () => void) => () => void
  /** 注入时钟。 */
  now?: () => number
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
      record.strip?.remove()
      record.requestBar?.remove()
      for (const row of record.rows) {
        row.removeAttribute(COLLAPSED_ATTR)
        row.removeAttribute(REQUEST_HIDDEN_ATTR)
      }
    }
    records = new Map()
    currentTurn = 0
    // 刚打开一个会话：历史轮次同样顶到屏幕外，屏幕里只留最后一轮。
    pendingAlign = true
    sessionKey = key
  }

  const setCollapsed = (record: TurnRecord, collapsed: boolean): void => {
    record.collapsed = collapsed
    for (const row of record.rows) {
      if (collapsed) row.setAttribute(COLLAPSED_ATTR, '')
      else row.removeAttribute(COLLAPSED_ATTR)
    }
  }

  /** 摘要条的稳定签名：内容没变就不重画，避免观察器自激。 */
  const signatureOf = (record: TurnRecord): string =>
    `${record.number}|${record.collapsed ? 'c' : 'e'}|${record.firstSeenAt}|${record.summary}`

  const renderStrip = (strip: HTMLElement, record: TurnRecord): void => {
    const signature = signatureOf(record)
    if (strip.dataset['signature'] === signature) return
    strip.dataset['signature'] = signature
    while (strip.firstChild !== null) strip.removeChild(strip.firstChild)
    const label = document.createElement('span')
    label.className = css.stripLabel ?? ''
    label.textContent = turnStripText(record.number, formatClock(record.firstSeenAt), record.summary, t)
    const chevron = document.createElement('span')
    chevron.className = css.stripChevron ?? ''
    chevron.setAttribute('aria-hidden', 'true')
    chevron.textContent = record.collapsed ? '▸' : '▾'
    strip.append(chevron, label)
    strip.setAttribute('data-state', record.collapsed ? 'collapsed' : 'expanded')
    strip.setAttribute('role', 'button')
    strip.setAttribute('tabindex', '0')
    strip.setAttribute('aria-expanded', record.collapsed ? 'false' : 'true')
    strip.setAttribute('aria-label', record.collapsed
      ? `${label.textContent}（${t('turnFold.expandAria')}）`
      : `${label.textContent}（${t('turnFold.collapseAria')}）`)
  }

  const ensureStrip = (record: TurnRecord, firstRow: HTMLElement): void => {
    const parent = firstRow.parentElement
    if (parent === null) return
    let strip = record.strip
    if (strip === undefined || !strip.isConnected || strip.parentElement !== parent) {
      strip = document.createElement('div')
      strip.className = css.strip ?? ''
      strip.setAttribute(STRIP_ATTR, '')
      strip.setAttribute('data-chat-power-turn', String(record.number))
      // 整条横条就是开关：点击即折叠/展开（键盘 Enter / 空格同样可用）。
      strip.addEventListener('click', () => {
        setCollapsed(record, !record.collapsed)
        renderStrip(strip!, record)
      })
      strip.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        setCollapsed(record, !record.collapsed)
        renderStrip(strip!, record)
      })
      parent.insertBefore(strip, firstRow)
      record.strip = strip
    }
    renderStrip(strip, record)
  }

  /**
   * 可用高度：会话区可视高度减去输入框高度与余量——当前轮的内容不超过这一块，
   * 输入框与轮首始终留在视野里。会话区本身没有布局（隐藏的标签）时返回 0，
   * 表示「先别限高」。
   */
  const availableHeight = (container: Element): number => {
    const viewport = typeof HTMLElement === 'undefined' ? 0 : (container as HTMLElement).clientHeight
    if (viewport === 0) return 0
    const composer = container.querySelector('[data-composer-seat]')
    const composerHeight = composer === null ? 0 : composer.getBoundingClientRect().height
    return viewport - composerHeight - HEIGHT_MARGIN
  }

  /**
   * 给这一轮的行分摊高度上限：超出的部分按比例分下去，该行内部滚动。
   * 高度取**内容高度**（scrollHeight）——用盒子高度会把已被限高的行越量越小。
   * 内容增长时若该行原本贴着底部，就继续贴底（用户手动上滚后不再抢滚动）。
   */
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

  const applyCaps = (record: TurnRecord, available: number): void => {
    if (available <= 0) {
      clearCaps(record)
      return
    }
    const heights = record.rows.map(row => {
      const content = row.scrollHeight
      return content > 0 ? content : row.getBoundingClientRect().height
    })
    const caps = capTallestRow(heights, available)
    let tallest = -1
    heights.forEach((height, index) => {
      if (height <= 0) return
      if (tallest === -1 || height > (heights[tallest] ?? 0)) tallest = index
    })
    record.rows.forEach((row, index) => {
      const height = heights[index] ?? 0
      const cap = caps[index] ?? height
      if (index !== tallest) {
        row.removeAttribute(CAPPED_ATTR)
        row.style.removeProperty('--chat-power-cap')
        row.style.removeProperty('--chat-power-floor')
        return
      }
      // 输出框：至少占满一屏，超出的部分向上裁掉（不出现滚动条，历史直接消失）。
      row.style.setProperty('--chat-power-floor', `${Math.floor(available)}px`)
      row.setAttribute(CAPPED_ATTR, '')
      // 标出这是不是当前轮的框：历史轮不再显示吸顶的「回答」标题。
      row.setAttribute('data-chat-power-frame', record.number === currentTurn ? 'current' : 'history')
      // 还在流式输出：裁切、不出滚动条；回答完成：允许在框内滚动（出滚动条）。
      row.setAttribute('data-chat-power-scroll', isLiveOutput() ? 'clip' : 'auto')
      if (cap >= height) {
        row.style.removeProperty('--chat-power-cap')
        return
      }
      // 贴着底部才跟着长；用户手动上滚过就不再抢滚动。
      const atBottom = row.scrollTop + row.clientHeight >= row.scrollHeight - 4
      row.style.setProperty('--chat-power-cap', `${Math.floor(cap)}px`)
      if (atBottom) row.scrollTop = row.scrollHeight
    })
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

  /** 在输出框上方插入（或更新）左上角文案；框不在了就撤掉。 */
  const ensureFrameLabel = (record: TurnRecord): void => {
    const framed = record.rows.find(row => row.hasAttribute(CAPPED_ATTR))
    // 只有当前轮的框才另加一行文案：历史轮不再出现吸顶的「回答」；
    // 框里已经有答案卡时也不加——卡片自己的头就是那一行（左边标题、右边按钮）。
    const needLabel = framed !== undefined
      && record.number === currentTurn
      && framed.querySelector('[data-answer-body]') === null
    if (!needLabel) {
      record.frameLabel?.remove()
      record.frameLabel = undefined
      return
    }
    if (framed === undefined) return
    const parent = framed.parentElement
    if (parent === null) {
      record.frameLabel?.remove()
      record.frameLabel = undefined
      return
    }
    let label = record.frameLabel
    if (label === undefined || !label.isConnected || label.parentElement !== parent) {
      label = document.createElement('div')
      label.className = css.frameLabel ?? ''
      label.setAttribute(FRAME_LABEL_ATTR, '')
      parent.insertBefore(label, framed)
      record.frameLabel = label
    }
    const kind = frameLabelOf(framed)
    const text = kind === 'thinking'
      ? t('turnFold.frameThinking')
      : kind === 'tools' ? t('turnFold.frameTools') : t('turnFold.frameAnswer')
    if (label.textContent !== text) label.textContent = text
    label.setAttribute('data-kind', kind)
  }

  /** 收起折叠态的行不需要限高（它们不可见），清掉之前的限高痕迹。 */
  const clearCaps = (record: TurnRecord): void => {
    for (const row of record.rows) {
      row.removeAttribute(CAPPED_ATTR)
      row.style.removeProperty('--chat-power-cap')
      row.style.removeProperty('--chat-power-floor')
    }
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
   * 用户请求条：把这一轮的用户请求折成一行（标题条 + 首句摘要），点一下展开。
   *
   * 请求本身常常好几行，占掉本该给结果块的空间；折成一行后，当前轮里占地方的
   * 就只剩结果块。展开时恢复原样，再点一下收起。
   */
  const ensureRequestBar = (record: TurnRecord): void => {
    const userRow = record.rows.find(row => row.matches(USER_ROW_SELECTOR))
    if (userRow === undefined) return
    const parent = userRow.parentElement
    if (parent === null) return
    if (record.requestSummary === '') record.requestSummary = summarizeTurn([userRow])
    let bar = record.requestBar
    if (bar === undefined || !bar.isConnected || bar.parentElement !== parent) {
      bar = document.createElement('div')
      bar.className = css.requestBar ?? ''
      bar.setAttribute(REQUEST_BAR_ATTR, '')
      bar.addEventListener('click', () => {
        record.requestCollapsed = !record.requestCollapsed
        applyRequestBar(record)
      })
      parent.insertBefore(bar, userRow)
      record.requestBar = bar
    }
    applyRequestBar(record)
  }

  /** 请求条与请求行的状态同步（收起 / 展开、文案、指示箭头）。 */
  const applyRequestBar = (record: TurnRecord): void => {
    const bar = record.requestBar
    const userRow = record.rows.find(row => row.matches(USER_ROW_SELECTOR))
    if (bar === undefined || userRow === undefined) return
    if (record.requestCollapsed) userRow.setAttribute(REQUEST_HIDDEN_ATTR, '')
    else userRow.removeAttribute(REQUEST_HIDDEN_ATTR)
    const signature = `${record.requestCollapsed ? 'c' : 'e'}|${record.requestSummary}`
    if (bar.dataset['signature'] === signature) return
    bar.dataset['signature'] = signature
    while (bar.firstChild !== null) bar.removeChild(bar.firstChild)
    const chevron = document.createElement('span')
    chevron.className = css.stripChevron ?? ''
    chevron.setAttribute('aria-hidden', 'true')
    chevron.textContent = record.requestCollapsed ? '▸' : '▾'
    const label = document.createElement('span')
    label.className = css.stripLabel ?? ''
    label.textContent = t('turnFold.requestLabel', { summary: record.requestSummary })
    bar.append(chevron, label)
    bar.setAttribute('role', 'button')
    bar.setAttribute('tabindex', '0')
    bar.setAttribute('aria-expanded', record.requestCollapsed ? 'false' : 'true')
    bar.setAttribute('aria-label', record.requestCollapsed
      ? `${label.textContent}（${t('turnFold.requestExpand')}）`
      : `${label.textContent}（${t('turnFold.requestCollapse')}）`)
  }

  /**
   * 把当前轮顶到滚动容器顶端：历史轮次的摘要条被顶到屏幕外，屏幕里只剩当前轮。
   * 只在「新的一轮出现」和「刚打开会话」时做一次，用户自己往回滚不会被拽回去。
   */
  const alignCurrentTurnToTop = (record: TurnRecord, container: Element): void => {
    const scrollable = container as HTMLElement
    if (typeof scrollable.scrollTop !== 'number') return
    const anchor = record.requestBar ?? record.rows[0]
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
    const rows = rowsOf(container)
    if (rows.length === 0) return
    const groups = groupTurnsByNumber(rows)
    if (groups.length === 0) return
    for (const group of groups) {
      const existing = records.get(group.number)
      if (existing === undefined) {
        records.set(group.number, {
          number: group.number,
          rows: group.rows as HTMLElement[],
          firstSeenAt: now(),
          summary: summarizeTurn(group.rows),
          collapsed: false,
          requestCollapsed: true,
          requestSummary: '',
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
      // 新一轮开始：此前的轮次折叠成摘要条，只有当前轮留在主屏。
      for (const record of records.values()) {
        if (record.number < currentTurn) setCollapsed(record, true)
      }
      // 历史轮次被顶到屏幕外，屏幕里只剩当前轮。
      pendingAlign = true
    }
    for (const record of records.values()) {
      const firstRow = record.rows[0]
      if (firstRow === undefined) continue
      if (record.number === currentTurn) {
        record.strip?.remove()
        record.strip = undefined
        if (record.collapsed) setCollapsed(record, false)
        ensureRequestBar(record)
        collapseThinking(record)
        applyCaps(record, availableHeight(container))
        ensureFrameLabel(record)
        continue
      }
      ensureStrip(record, firstRow)
      setCollapsed(record, record.collapsed)
      if (record.collapsed) {
        clearCaps(record)
        // 整轮折成摘要条时，请求条也一起藏起来。
        record.requestBar?.setAttribute(REQUEST_HIDDEN_ATTR, '')
      } else {
        record.requestBar?.removeAttribute(REQUEST_HIDDEN_ATTR)
        ensureRequestBar(record)
        collapseThinking(record)
        applyCaps(record, availableHeight(container))
      }
      ensureFrameLabel(record)
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
    for (const record of records.values()) {
      record.strip?.remove()
      record.requestBar?.remove()
      for (const row of record.rows) {
        row.removeAttribute(COLLAPSED_ATTR)
        row.removeAttribute(CAPPED_ATTR)
        row.removeAttribute(REQUEST_HIDDEN_ATTR)
        row.style.removeProperty('--chat-power-cap')
      }
    }
    records = new Map()
  }
}
