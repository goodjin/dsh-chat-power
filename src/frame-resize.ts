/**
 * 块的上下拖拽（DOM 控制器）。
 *
 * 宿主只有「会话列宽」的左右拖拽；这里补上**上下**两个方向：
 *
 * - 每个插件输出框（回答卡 / 思考帧 / 工具帧 / 错误与重试帧）的**底边**一条把手：
 *   上下拉动直接设定这块的高度（`--chat-power-resize`，CSS 里优先于自动限高的
 *   floor / cap），可以拉到超过一屏；双击把手恢复自动高度；往上拖到最小值以下
 *   等于「回到自然高度」，也清除设定。
 * - 输入框（composer 座位）的**顶边**一条把手：向上拉加高输入区——同时放宽宿主
 *   对输入文本区的高度上限（`--dsh-composer-text-max-height`，默认 336px）并给
 *   文本区一个最小高度；高度记进 localStorage，重开页面后恢复；往下拉到最小值
 *   以下清除（记忆一并清除）。
 *
 * 纪律与轮次折叠一致：只加属性、插自己的元素、设内联样式，不移动也不改写宿主节点。
 */

/** 块底边拖拽把手的标记。 */
export const FRAME_RESIZE_ATTR = 'data-chat-power-frame-resize'
/** 输入框顶边拖拽把手的标记。 */
export const COMPOSER_RESIZE_ATTR = 'data-chat-power-composer-resize'
/** 拖拽中的标记（挂在 body 上，样式据此统一指针与禁选中文本）。 */
export const RESIZING_ATTR = 'data-chat-power-resizing'

/** 块拖拽的最小高度：低于它视为「回到自动高度」。 */
export const MIN_FRAME_HEIGHT = 120
/** 输入区拖拽的最小高度：低于它视为「回到自然高度」。 */
export const MIN_COMPOSER_HEIGHT = 64
/** 输入区加高的记忆键（localStorage，值为像素数字符串）。 */
export const COMPOSER_HEIGHT_KEY = 'chat-power.composer-min-height'

/** 拖拽规格：起点高度、方向（下边缘向下为正 / 上边缘向上为正）、应用函数。 */
interface DragSpec {
  readonly direction: 1 | -1
  readonly minHeight: number
  readonly startHeight: () => number
  readonly apply: (next: number | undefined) => void
}

/**
 * 给把手接上拖拽：按下记住起点，移动实时套用，松手结束。
 *
 * 拖到最小值以下 → apply(undefined)（回到自动高度）。double-click 的复原由
 * 调用方自己接（语义不同：块是去掉设定，输入框还要清记忆）。
 */
function attachDrag(handle: HTMLElement, spec: DragSpec): void {
  handle.addEventListener('pointerdown', (event: PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    const startY = event.clientY
    const base = spec.startHeight()
    if (typeof handle.setPointerCapture === 'function') {
      try {
        handle.setPointerCapture(event.pointerId)
      } catch {
        // 没有捕获能力（jsdom 等）不影响拖拽：移动监听在 window 上兜底。
      }
    }
    document.body?.setAttribute(RESIZING_ATTR, '')
    handle.setAttribute('data-chat-power-resize-active', '')
    const move = (moveEvent: PointerEvent): void => {
      const next = Math.round(base + spec.direction * (moveEvent.clientY - startY))
      spec.apply(next < spec.minHeight ? undefined : next)
    }
    const up = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body?.removeAttribute(RESIZING_ATTR)
      handle.removeAttribute('data-chat-power-resize-active')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  })
}

/** 套用 / 清除块的用户设定高度（undefined = 回到自动限高）。 */
function applyFrameHeight(box: HTMLElement, next: number | undefined): void {
  if (next === undefined) box.style.removeProperty('--chat-power-resize')
  else box.style.setProperty('--chat-power-resize', `${next}px`)
}

/** 输入文本区：编辑器（contenteditable / textarea）往外第一个可滚动的祖先。 */
function composerTextRegionOf(seat: HTMLElement): HTMLElement | undefined {
  const editor = seat.querySelector<HTMLElement>('[contenteditable="true"], textarea')
  let node = editor?.parentElement ?? null
  while (node !== null && node !== seat) {
    const overflow = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : ''
    if (overflow === 'auto' || overflow === 'scroll') return node
    node = node.parentElement
  }
  return undefined
}

/** 套用 / 清除输入区的加高（undefined = 回到自然高度，记忆一并清除）。 */
function applyComposerHeight(seat: HTMLElement, next: number | undefined): void {
  const region = composerTextRegionOf(seat)
  if (next === undefined) {
    seat.style.removeProperty('--dsh-composer-text-max-height')
    region?.style.removeProperty('min-height')
    try {
      localStorage.removeItem(COMPOSER_HEIGHT_KEY)
    } catch {
      // localStorage 缺席（隐私模式）就没有记忆可清。
    }
    return
  }
  seat.style.setProperty('--dsh-composer-text-max-height', `${next}px`)
  region?.style.setProperty('min-height', `${next}px`)
  try {
    localStorage.setItem(COMPOSER_HEIGHT_KEY, String(next))
  } catch {
    // 存不了（隐私模式）就只影响本页，加高照常生效。
  }
}

/** 从记忆恢复输入区加高（每轮同步调用；值没变时不重复写样式）。 */
function applyStoredComposerHeight(seat: HTMLElement): void {
  let stored: number | undefined
  try {
    const raw = localStorage.getItem(COMPOSER_HEIGHT_KEY)
    const value = raw === null ? Number.NaN : Number(raw)
    if (Number.isFinite(value) && value >= MIN_COMPOSER_HEIGHT) stored = Math.round(value)
  } catch {
    // localStorage 缺席就当没有记忆。
  }
  if (stored === undefined) return
  if (seat.style.getPropertyValue('--dsh-composer-text-max-height') === `${stored}px`) return
  applyComposerHeight(seat, stored)
}

/**
 * 给一轮里所有插件输出框补上底边拖拽把手（已有就跳过；宿主重渲染冲掉了会补回）。
 * 只处理插件自己的框（`[data-chat-power-frame-box]`），不碰裸的宿主行。
 * @param record - 这一轮的状态（只用 rows）。
 * @param title - 把手悬停提示（已按当前语言翻译）。
 */
export function ensureFrameResizeHandles(
  record: { readonly rows: readonly HTMLElement[] },
  title: string,
): void {
  for (const row of record.rows) {
    const box = row.querySelector<HTMLElement>('[data-chat-power-frame-box]')
    if (box === null) continue
    if (box.querySelector(`[${FRAME_RESIZE_ATTR}]`) !== null) continue
    const handle = document.createElement('div')
    handle.setAttribute(FRAME_RESIZE_ATTR, '')
    if (title !== '') handle.title = title
    handle.addEventListener('dblclick', (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      applyFrameHeight(box, undefined)
    })
    attachDrag(handle, {
      direction: 1,
      minHeight: MIN_FRAME_HEIGHT,
      startHeight: () => box.getBoundingClientRect().height,
      apply: next => {
        applyFrameHeight(box, next)
      },
    })
    box.appendChild(handle)
  }
}

/**
 * 给输入框补上顶边拖拽把手并恢复记忆中的加高（每轮同步调用；幂等）。
 * 把手高度为零、绝对定位在座位顶边，不占布局、不影响宿主输入卡的排布。
 * @param container - 会话滚动容器。
 * @param title - 把手悬停提示（已按当前语言翻译）。
 */
export function ensureComposerResize(container: Element, title: string): void {
  const seat = container.querySelector<HTMLElement>('[data-composer-seat]')
  if (seat === null) return
  if (seat.querySelector(`[${COMPOSER_RESIZE_ATTR}]`) === null) {
    const handle = document.createElement('div')
    handle.setAttribute(COMPOSER_RESIZE_ATTR, '')
    if (title !== '') handle.title = title
    handle.addEventListener('dblclick', (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      applyComposerHeight(seat, undefined)
    })
    attachDrag(handle, {
      direction: -1,
      minHeight: MIN_COMPOSER_HEIGHT,
      startHeight: () => seat.getBoundingClientRect().height,
      apply: next => {
        applyComposerHeight(seat, next)
      },
    })
    seat.insertBefore(handle, seat.firstChild)
  }
  applyStoredComposerHeight(seat)
}

/** 摘掉页面上所有拖拽把手与拖拽中的状态（控制器停止时调用；记忆保留）。 */
export function removeResizeHandles(): void {
  if (typeof document === 'undefined') return
  document.body?.removeAttribute(RESIZING_ATTR)
  for (const handle of document.querySelectorAll(`[${FRAME_RESIZE_ATTR}],[${COMPOSER_RESIZE_ATTR}]`)) {
    handle.remove()
  }
  // 已套用的加高也一并摘下（新控制器会从记忆恢复输入框那部分）。
  for (const box of document.querySelectorAll<HTMLElement>('[data-chat-power-frame-box]')) {
    box.style.removeProperty('--chat-power-resize')
  }
  for (const seat of document.querySelectorAll<HTMLElement>('[data-composer-seat]')) {
    seat.style.removeProperty('--dsh-composer-text-max-height')
    for (const region of composerRegionsIn(seat)) region.style.removeProperty('min-height')
  }
}

/** 座位里所有可滚动的输入文本区（移除加高时逐个清掉最小高度）。 */
function composerRegionsIn(seat: HTMLElement): HTMLElement[] {
  const regions: HTMLElement[] = []
  for (const editor of seat.querySelectorAll<HTMLElement>('[contenteditable="true"], textarea')) {
    let node = editor.parentElement
    while (node !== null && node !== seat) {
      const overflow = typeof getComputedStyle === 'function' ? getComputedStyle(node).overflowY : ''
      if (overflow === 'auto' || overflow === 'scroll') {
        regions.push(node)
        break
      }
      node = node.parentElement
    }
  }
  return regions
}
