/**
 * 官方改动文件卡的点击拦截：改成在会话区打开。
 *
 * 宿主每轮末尾的改动文件卡（`data-changed-files`）点下去会开**右侧 Sidebar**
 * 的 review 对比（2026-11-18 现场：每轮「已编辑的文件」点开都在右侧栏）。
 * 会话区里已经有等价的呈现（每轮文件块：可展开正文、可编辑、写回原文件），
 * 所以把这张卡的点击认领下来，交由会话区打开对应文件。
 *
 * 与回答块里的文档链接拦截是**两件事**：
 * - 那边认领的是宿主渲染的文件链接按钮（靠 class 里的 fileLink 记号）；
 * - 这边认领的是官方改动卡（靠容器标记 `data-changed-files`）。
 * 两者范围不同、路径来源不同，分开做更清楚。
 *
 * 路径从官方为每行渲染的隐藏描述元素里取（内容是绝对路径），据此还原工作区
 * 相对路径——不靠本地化文案，也不靠编译后会变的 class 名。
 */
import { changedFilePathAt, isChangedFilesCard } from './changed-files-click.ts'

/**
 * 装上「官方改动卡 → 会话区打开」的拦截层。
 *
 * 捕获阶段拦下 `pointerdown` 与 `click`：宿主把打开 review 的动作绑在按钮的
 * click 上，两处都拦才断得干净（一次点击先来 pointerdown 再来 click）。
 *
 * @param options.open - 打开方式：给定会话与工作区相对路径，由调用方在会话区打开。
 * @param options.rootOf - 取会话的工作区根（还原相对路径用）。
 * @returns 清理函数。
 */
export function installChangedFilesInterception(options: {
  open: (sessionId: string, path: string) => void
  rootOf: (sessionId: string) => string | undefined
}): () => void {
  if (typeof document === 'undefined') return () => {}
  let lastKey = ''
  let lastAt = 0
  const onClick = (event: Event): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') return
    if (!isChangedFilesCard(target)) return
    const session = target.closest('[data-conversation-session]')
    if (session === null) return
    const sessionId = session.getAttribute('data-conversation-session') ?? ''
    if (sessionId === '') return
    const path = changedFilePathAt(target, options.rootOf(sessionId))
    if (path === undefined || path === '') return
    // 先掐断宿主自己的处理（它会开右侧 review），再去重打开。
    event.preventDefault()
    event.stopPropagation()
    const key = sessionId + '|' + path
    const now = Date.now()
    if (key === lastKey && now - lastAt < 800) return
    lastAt = now
    lastKey = key
    options.open(sessionId, path)
  }
  document.addEventListener('pointerdown', onClick, true)
  document.addEventListener('click', onClick, true)
  return () => {
    document.removeEventListener('pointerdown', onClick, true)
    document.removeEventListener('click', onClick, true)
  }
}
