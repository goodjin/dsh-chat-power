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
 * - 「当前轮不超过一屏」由 {@link distributeHeightCap} 分摊行高上限实现；
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

/**
 * 限高分摊：把“超出可用高度”的部分优先压到最高的行上。
 *
 * 不给宿主行包容器（那要移动宿主节点），改为逐行限高：最高的行先让出空间，
 * 必要时次高的行也让。返回每行的上限（等于原高度表示不限）。
 *
 * @param heights - 各行当前高度。
 * @param available - 可用高度（视口高减去输入框与余量）。
 * @returns 与 heights 等长的上限数组。
 */
export function distributeHeightCap(heights: readonly number[], available: number): number[] {
  // 上限始终是有限值：未让出空间的行保持原高度（等于不限），合计可直接比较。
  const caps = heights.slice()
  const floor = Math.max(MIN_AVAILABLE_HEIGHT, Math.floor(available))
  let total = heights.reduce((sum, height) => sum + height, 0)
  if (total <= floor) return caps
  let overflow = total - floor
  // 从高到矮依次让出空间；每行至少留 MIN_AVAILABLE_HEIGHT/4 的可视高度。
  const order = heights.map((height, index) => ({ height, index })).sort((a, b) => b.height - a.height)
  const perRowFloor = Math.max(1, Math.floor(MIN_AVAILABLE_HEIGHT / 4))
  for (const { height, index } of order) {
    if (overflow <= 0) break
    const give = Math.min(height - perRowFloor, overflow)
    if (give <= 0) continue
    caps[index] = height - give
    overflow -= give
  }
  return caps
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

/** 限高时给会话区留的余量（输入框上沿到视口顶的呼吸位）。 */
const HEIGHT_MARGIN = 24

/** 一轮的状态：行、首见时刻、摘要、是否折叠、摘要条元素。 */
interface TurnRecord {
  number: number
  rows: HTMLElement[]
  firstSeenAt: number
  summary: string
  collapsed: boolean
  strip?: HTMLElement
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
  let records = new Map<number, TurnRecord>()
  let stopObserving: (() => void) | undefined
  let composerObserver: ResizeObserver | undefined
  const onViewportChange = (): void => { sync() }

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
      for (const row of record.rows) row.removeAttribute(COLLAPSED_ATTR)
    }
    records = new Map()
    currentTurn = 0
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
    strip.appendChild(label)
    if (record.collapsed) {
      strip.setAttribute('data-state', 'collapsed')
      strip.setAttribute('role', 'button')
      strip.setAttribute('tabindex', '0')
      strip.setAttribute('aria-label', `${label.textContent}（${t('turnFold.expandAria')}）`)
      const expand = (): void => { setCollapsed(record, false); renderStrip(strip, record) }
      strip.addEventListener('click', expand)
      strip.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        expand()
      })
      return
    }
    strip.setAttribute('data-state', 'expanded')
    strip.removeAttribute('role')
    strip.removeAttribute('tabindex')
    const toggle = document.createElement('button')
    toggle.type = 'button'
    toggle.className = css.stripToggle ?? '' 
    toggle.textContent = t('turnFold.collapse')
    toggle.setAttribute('aria-label', t('turnFold.collapseAria'))
    toggle.addEventListener('click', () => { setCollapsed(record, true); renderStrip(strip, record) })
    strip.appendChild(toggle)
  }

  const ensureStrip = (record: TurnRecord, firstRow: HTMLElement): void => {    const parent = firstRow.parentElement
    if (parent === null) return
    let strip = record.strip
    if (strip === undefined || !strip.isConnected || strip.parentElement !== parent) {
      strip = document.createElement('div')
      strip.className = css.strip ?? '' 
      strip.setAttribute(STRIP_ATTR, '')
      strip.setAttribute('data-chat-power-turn', String(record.number))
      parent.insertBefore(strip, firstRow)
      record.strip = strip
    }
    renderStrip(strip, record)
  }

  /**
   * 可用高度：视口高减去输入框高度与余量——当前轮的内容不超过这一块，
   * 输入框与轮首始终留在视野里。
   */
  const availableHeight = (container: Element): number => {
    const composer = container.querySelector('[data-composer-seat]')
    const composerHeight = composer === null ? 0 : composer.getBoundingClientRect().height
    const viewport = typeof window === 'undefined' ? 0 : window.innerHeight
    return viewport - composerHeight - HEIGHT_MARGIN
  }

  /**
   * 给这一轮的行分摊高度上限：超出的部分压到最高的行上，该行内部滚动。
   * 内容增长时若该行原本贴着底部，就继续贴底（用户手动上滚后不再抢滚动）。
   */
  const applyCaps = (record: TurnRecord, available: number): void => {
    const heights = record.rows.map(row => row.getBoundingClientRect().height)
    const caps = distributeHeightCap(heights, available)
    record.rows.forEach((row, index) => {
      const height = heights[index] ?? 0
      const cap = caps[index] ?? height
      if (cap >= height) {
        row.removeAttribute(CAPPED_ATTR)
        row.style.removeProperty('--chat-power-cap')
        return
      }
      const atBottom = row.scrollTop + row.clientHeight >= row.scrollHeight - 4
      row.style.setProperty('--chat-power-cap', `${Math.floor(cap)}px`)
      row.setAttribute(CAPPED_ATTR, '')
      if (atBottom) row.scrollTop = row.scrollHeight
    })
  }

  /** 收起折叠态的行不需要限高（它们不可见），清掉之前的限高痕迹。 */
  const clearCaps = (record: TurnRecord): void => {
    for (const row of record.rows) {
      row.removeAttribute(CAPPED_ATTR)
      row.style.removeProperty('--chat-power-cap')
    }
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
    }
    for (const record of records.values()) {
      const firstRow = record.rows[0]
      if (firstRow === undefined) continue
      if (record.number === currentTurn) {
        record.strip?.remove()
        record.strip = undefined
        if (record.collapsed) setCollapsed(record, false)
        applyCaps(record, availableHeight(container))
        continue
      }
      ensureStrip(record, firstRow)
      setCollapsed(record, record.collapsed)
      if (record.collapsed) clearCaps(record)
      else applyCaps(record, availableHeight(container))
    }
  }

  const attach = (): void => {
    const container = scroller()
    if (container === null) return
    stopObserving = observe(container, () => { sync() })
    // 窗口与输入框高度变化都会改变可用高度，重新分摊上限。
    if (typeof window !== 'undefined') window.addEventListener('resize', onViewportChange)
    const composer = container.querySelector('[data-composer-seat]')
    if (composer !== null && typeof ResizeObserver !== 'undefined') {
      composerObserver = new ResizeObserver(() => { sync() })
      composerObserver.observe(composer)
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
    if (typeof window !== 'undefined') window.removeEventListener('resize', onViewportChange)
    for (const record of records.values()) {
      record.strip?.remove()
      for (const row of record.rows) {
        row.removeAttribute(COLLAPSED_ATTR)
        row.removeAttribute(CAPPED_ATTR)
        row.style.removeProperty('--chat-power-cap')
      }
    }
    records = new Map()
  }
}
