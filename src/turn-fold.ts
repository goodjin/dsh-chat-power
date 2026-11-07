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
 * 必要时次高的行也让。返回每行的上限（`Infinity` 表示不限）。
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
