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

/** 单行限高后的最小可读高度：再挤也不能把一块内容压成一条缝。 */
export const MIN_ROW_HEIGHT = 180

/**
 * 行高分摊（按比例）：把可用高度按各行的内容高度比例分下去。
 *
 * 与「只压最高的一行」不同——那会把结果卡片压成几十像素的一条缝。这里按比例
 * 分摊，每行再保留下限（{@link MIN_ROW_HEIGHT} 与可用高度的三成取大），
 * 所以长块拿到的是它应得的那一份，而不是被牺牲掉。
 *
 * @param heights - 各行的内容高度。
 * @param available - 可用高度（会话区可视高度减去输入框与余量）。
 * @returns 与 heights 等长的上限数组；未超出的行保持原值。
 */
export function allocateRowHeights(heights: readonly number[], available: number): number[] {
  const floor = Math.max(MIN_AVAILABLE_HEIGHT, Math.floor(available))
  const total = heights.reduce((sum, height) => sum + height, 0)
  if (total <= floor) return heights.slice()
  const scale = floor / total
  const readableFloor = Math.max(MIN_ROW_HEIGHT, Math.floor(floor * 0.28))
  return heights.map(height => {
    if (height <= 0) return height
    const proportional = height * scale
    const readable = Math.min(height, readableFloor)
    return Math.min(height, Math.max(Math.floor(proportional), readable))
  })
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
  const applyCaps = (record: TurnRecord, available: number): void => {
    if (available <= 0) {
      clearCaps(record)
      return
    }
    const heights = record.rows.map(row => {
      const content = row.scrollHeight
      return content > 0 ? content : row.getBoundingClientRect().height
    })
    const caps = allocateRowHeights(heights, available)
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
      for (const row of record.rows) {
        row.removeAttribute(COLLAPSED_ATTR)
        row.removeAttribute(CAPPED_ATTR)
        row.style.removeProperty('--chat-power-cap')
      }
    }
    records = new Map()
  }
}
