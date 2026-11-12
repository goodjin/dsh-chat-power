/**
 * 工作区文件树的行控件：多选框（勾选 → 输入框引用）+ 悬浮编辑按钮。
 *
 * 宿主 0.2.2 起，宿主面板的座位不能被「包一层再重注册」——子座位全局只能
 * 声明一次，外层包会当场撞名，文件面板整块起不来（控制台里是
 * `slot "..." is already declared`）。于是这里不再动宿主的座位表，改为在
 * **渲染出来的目录树上直接补控件**：只认会话区工具区里的行（容器带
 * `data-chat-tools-session`），宿主右侧栏的文件树没有这个标记，不会被碰。
 *
 * 事件用捕获阶段的委托：勾选框与编辑钮必须先于宿主的「点行打开文件」
 * 收到点击，否则勾一下就会顺手把文件打开。
 */
import { fallbackT } from './locales.ts'

/** 勾选框标记。 */
export const CHECK_ATTR = 'data-chat-file-check'
/** 编辑钮标记。 */
export const EDIT_ATTR = 'data-chat-file-edit'
/** 行控件所属会话：补控件时写上，点击时据此回到对的会话。 */
export const SESSION_ATTR = 'data-chat-file-session'
/** 已补过控件的行（目录树重绘后不重复补）。 */
export const DECORATED_ATTR = 'data-chat-file-decorated'
/** 会话区工具区内容容器的标记：带这个标记的容器里才有我们的行控件。 */
export const TOOLS_SESSION_ATTR = 'data-chat-tools-session'

/** 超过这个大小的文件不允许树点击打开：宿主预览渲染巨行文件会冻结窗口
 * （2026-11-07 现场：8.8MB 单行 minified JS 一点开整个窗口卡死）。 */
export const FILE_OPEN_MAX_BYTES = 1024 * 1024
/** 行上的「文件过大」标记：值是被拦下的字节大小。 */
export const TOO_BIG_ATTR = 'data-chat-file-too-big'

/** 「编辑副本」的铅笔描边图标（与选区弹条同款风格，颜色随文字）。 */
const EDIT_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M11.2 2.2a1.6 1.6 0 0 1 2.6 2.6L6 12.5l-3.5.9.9-3.5 7.8-7.7Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'

/** 补控件与点击路由要用的最小元素面（真实 DOM 满足它，测试里的假元素也满足）。 */
export interface ElementLike {
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  prepend(node: unknown): void
  append(node: unknown): void
  after(node: unknown): void
  querySelector(selector: string): ElementLike | null
  closest(selector: string): unknown
  checked?: boolean
  innerHTML?: string
}

/** 建元素要用的最小 document 面。 */
export interface DocLike {
  createElement(tag: string): ElementLike
}

export interface AugmentHandlers {
  /** 该会话里某路径是否处于勾选状态。 */
  checked(sessionId: string, path: string): boolean
  /** 勾选状态变化：checked=true 追加引用，false 移除。 */
  onToggle(sessionId: string, path: string, checked: boolean): void
  /** 点击悬浮编辑按钮。 */
  onEdit(sessionId: string, path: string): void
  /** 订阅勾选状态变化（发送清空、跨标签改动）以回同步勾选框；可选。 */
  subscribeChanges?(listener: () => void): () => void
  /** 异步取文件字节大小；不可知回 undefined（此时不拦截）。 */
  statSize?(sessionId: string, path: string): Promise<number | undefined>
  /** 大文件打开被拦截后的提示。 */
  onBlockedOpen?(sessionId: string, path: string, sizeBytes: number): void
}

/** 行元素上的工作区相对路径（宿主写好的 data-files-path）。 */
export function filesRowPath(row: { getAttribute(name: string): string | null }): string | undefined {
  const value = row.getAttribute('data-files-path')
  return value === null || value === '' ? undefined : value
}

/** 会话内容相位 → 是否有历史：hero 是空新会话；settling/未知时不判定。 */
export function hasHistoryForPhase(phase: string | null | undefined): boolean | undefined {
  if (phase === 'hero') return false
  if (phase === 'active') return true
  return undefined
}

/**
 * 给一行文件补上勾选框与编辑钮。
 *
 * @returns 是否补了（已补过或不是文件行则不补）。
 */
export function decorateRow(row: ElementLike, sessionId: string, handlers: AugmentHandlers, doc: DocLike): boolean {
  if (row.hasAttribute(DECORATED_ATTR)) return false
  const path = filesRowPath(row)
  if (path === undefined) return false
  const check = doc.createElement('input')
  check.setAttribute('type', 'checkbox')
  check.setAttribute(CHECK_ATTR, '')
  check.setAttribute('data-chat-file-path', path)
  check.setAttribute(SESSION_ATTR, sessionId)
  check.setAttribute('aria-label', fallbackT('fileTree.reference', { path }))
  check.checked = handlers.checked(sessionId, path)
  const edit = doc.createElement('button')
  edit.setAttribute('type', 'button')
  edit.setAttribute(EDIT_ATTR, '')
  edit.setAttribute('data-chat-file-path', path)
  edit.setAttribute(SESSION_ATTR, sessionId)
  edit.setAttribute('aria-label', fallbackT('fileTree.editCopy', { path }))
  edit.setAttribute('title', fallbackT('fileTree.editCopy', { path }))
  edit.innerHTML = EDIT_ICON_SVG
  const open = row.querySelector('button:first-of-type')
  if (open !== null) open.prepend(check)
  else row.prepend(check)
  if (open !== null) open.after(edit)
  else row.append(edit)
  row.setAttribute(DECORATED_ATTR, '')
  // 大文件预拦截：decorate 时异步 stat，超过上限就给行打标记。点击时
  // handleRowControl 见标记即截停，宿主预览根本不会开始渲染。
  if (handlers.statSize !== undefined) {
    void handlers.statSize(sessionId, path).then((size) => {
      if (size !== undefined && size > FILE_OPEN_MAX_BYTES && row.hasAttribute(DECORATED_ATTR)) {
        row.setAttribute(TOO_BIG_ATTR, String(size))
        row.setAttribute(SESSION_ATTR, sessionId)
      }
    }).catch(() => {})
  }
  return true
}

/**
 * 点到我们自己的控件上时的动作路由。
 *
 * @returns 是否是我们处理了这次点击（处理过就把事件截住，别让宿主顺手打开文件）。
 */
export function handleRowControl(
  event: { target: unknown; preventDefault(): void; stopPropagation(): void },
  handlers: AugmentHandlers,
): boolean {
  const target = event.target as { closest?: (selector: string) => unknown } | null
  if (target === null || typeof target.closest !== 'function') return false
  const edit = target.closest(`[${EDIT_ATTR}]`) as ElementLike | null
  if (edit !== null) {
    const path = edit.getAttribute('data-chat-file-path')
    const sessionId = edit.getAttribute(SESSION_ATTR)
    if (path === null || sessionId === null) return false
    event.stopPropagation()
    event.preventDefault()
    handlers.onEdit(sessionId, path)
    return true
  }
  // 大文件拦截：点在我们标记过的文件行上（且不是勾选框/编辑钮）→ 截停，
  // 宿主的「点行打开文件」根本不执行。
  const tooBig = target.closest(`[${TOO_BIG_ATTR}]`) as ElementLike | null
  if (tooBig !== null) {
    event.stopPropagation()
    event.preventDefault()
    const size = Number(tooBig.getAttribute(TOO_BIG_ATTR) ?? '0')
    const path = tooBig.getAttribute('data-files-path') ?? ''
    const sessionId = tooBig.getAttribute(SESSION_ATTR) ?? ''
    handlers.onBlockedOpen?.(sessionId, path, size)
    return true
  }
  const check = target.closest(`[${CHECK_ATTR}]`) as ElementLike | null
  if (check !== null) {
    const path = check.getAttribute('data-chat-file-path')
    const sessionId = check.getAttribute(SESSION_ATTR)
    if (path === null || sessionId === null) return false
    // 只截住传播，不取消默认行为：勾选框的勾选动作由浏览器做，
    // 取消默认行为会把刚勾上的状态弹回去（看起来像「勾不上」）。
    event.stopPropagation()
    handlers.onToggle(sessionId, path, check.checked === true)
    // 写入失败时以会话状态为准回拨（成功时两者一致，重设无害）。
    check.checked = handlers.checked(sessionId, path)
    return true
  }
  return false
}

/** 勾选状态变化后，把已挂的勾选框按会话状态回拨。 */
export function syncRowChecks(checks: Iterable<ElementLike>, handlers: AugmentHandlers): void {
  for (const check of checks) {
    const path = check.getAttribute('data-chat-file-path')
    const sessionId = check.getAttribute(SESSION_ATTR)
    if (path === null || sessionId === null) continue
    check.checked = handlers.checked(sessionId, path)
  }
}

/**
 * 把行控件挂到会话区工具区的文件树上。
 *
 * 目录树重绘后新行会冒出来，所以盯着页面变化补控件；控件自己带会话与
 * 路径，点击时不必再猜是哪个会话。
 */
export function attachFilesTreeAugment(handlers: () => AugmentHandlers): () => void {
  if (typeof document === 'undefined') return () => {}
  const root = document
  const decorate = (): void => {
    for (const container of root.querySelectorAll(`[${TOOLS_SESSION_ATTR}]`)) {
      const sessionId = container.getAttribute(TOOLS_SESSION_ATTR)
      if (sessionId === null || sessionId === '') continue
      const rows = container.querySelectorAll(`li[data-files-entry="file"]:not([${DECORATED_ATTR}])`)
      for (const row of rows) decorateRow(row as unknown as ElementLike, sessionId, handlers(), root as unknown as DocLike)
    }
  }
  const sync = (): void => {
    for (const container of root.querySelectorAll(`[${TOOLS_SESSION_ATTR}]`)) {
      const checks = container.querySelectorAll(`[${CHECK_ATTR}]`)
      syncRowChecks(checks as unknown as Iterable<ElementLike>, handlers())
    }
  }
  // 捕获阶段：先于宿主的「点行打开文件」拿到事件，勾选才不会顺手打开文件。
  const onClick = (event: Event): void => { handleRowControl(event, handlers()) }
  root.addEventListener('click', onClick, true)
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(decorate)
  observer?.observe(root.body, { childList: true, subtree: true })
  const unsubscribe = handlers().subscribeChanges?.(sync)
  decorate()
  sync()
  return () => {
    root.removeEventListener('click', onClick, true)
    observer?.disconnect()
    unsubscribe?.()
  }
}
