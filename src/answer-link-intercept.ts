/**
 * 回答块里「文档链接」的认领：点击落在哪个路径上，就打开哪个文件。
 *
 * 宿主把 markdown 里的工作区文件链接渲染成
 * `<button type="button" class="…fileLink…" title="{路径}">`——不是 `<a>`，也没有
 * 任何资源地址属性。点它走宿主 openFile → 右侧文档预览。用户要的是「在会话区域
 * 打开，像打开工作区文件一样」，所以这里把点击认领下来，交给会话区处理。
 *
 * 认领有三种形态：
 * 1. **宿主文件链接按钮**：class 带 `fileLink` 记号（见 answer-file-links.ts）。
 * 2. **markdown 相对路径链接**：`<a href="相对路径">`。
 * 3. **文档卡片**（CSV 等）：地址可能放在任意层的属性里——从点击处向上逐层扫属性，
 *    命中文件资源地址即认领。
 *
 * 范围：**回答内容**。宿主回答行是插件那个「每轮一框」的**兄弟节点**（框只承载
 * 标题行，行本身留在原位），先前把认领限定在框内等于这项功能从未生效。
 */
import { answerFileLinkPathAt } from './answer-file-links.ts'

/**
 * 回答内容的范围选择器。
 *
 * - `assistant-step`：宿主自己的回答行（宿主给 flow 行打 `data-chat-flow-kind`）。
 * - `turn-tail`：轮次尾巴，宿主与本包的文件块都挂在这下面。
 * - `files-block` / `markdown-turn`：本包展开的文件阅读区。
 *
 * 会话区里其它位置的相对链接未必是工作区文件（例如插件自己的工具区），不在此列。
 */
export const ANSWER_LINK_SCOPE = '[data-chat-flow-kind="assistant-step"], [data-turn-tail], [data-files-block], [data-markdown-turn]'

/** 从资源地址里取出路径：`dsh-resource://file/…` / `file://…` → 相对路径。 */
export function pathFromAddress(value: string): string {
  let path = value
  const idx = path.indexOf('dsh-resource://file/')
  if (idx >= 0) path = path.slice(idx + 'dsh-resource://file/'.length)
  else if (path.startsWith('file://')) path = path.slice('file://'.length)
  try { path = decodeURIComponent(path) } catch { /* 保留原文 */ }
  // 前导 `./` 去掉（会话文件地址的拼装约定），前导 `/` 去掉（相对工作区根）。
  return path.replace(/^(?:\.\/)+/, '').replace(/^\/+/, '')
}

/** 元素自身是否带着指向文件的资源地址。 */
function addressAt(node: Element): string | undefined {
  for (const attr of Array.from(node.attributes)) {
    const value = attr.value
    if (value.includes('dsh-resource://file/') || value.startsWith('file://')) return pathFromAddress(value)
    const name = attr.name.toLowerCase()
    if ((name.includes('resource') || name.includes('textpreview')) && value !== '' && !value.startsWith('#') && !value.startsWith('http')) {
      return pathFromAddress(value)
    }
  }
  return undefined
}

/**
 * markdown 相对路径链接（工作区文件）：不是网页链接、不是绝对路径、不是锚点。
 * 网页链接放行——它们有自己的一套打开方式（浏览器 / 右侧预览）。
 */
export function relativeLinkPath(href: string): string | undefined {
  if (href === '') return undefined
  if (/^(https?:|mailto:|javascript:|data:|#)/i.test(href)) return undefined
  if (href.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(href) || href.includes('://')) return undefined
  return pathFromAddress(href)
}

/**
 * 点击处是不是「回答内容里的文档链接」，是的话给出要打开的路径。
 *
 * @param target - 事件目标（或其任意祖先元素）。
 * @returns 文件路径；不是文档链接时为 undefined。
 */
export function answerLinkPathAt(target: Element): string | undefined {
  // 形态一：宿主的文件链接按钮。认领后不再走属性扫描——
  // 按钮自身的属性不该被当成文档卡片的地址。
  const answered = answerFileLinkPathAt(target)
  if (answered !== undefined) return answered
  let node: Element | null = target
  while (node !== null) {
    if (node.tagName === 'A') {
      const found = relativeLinkPath(node.getAttribute('href') ?? '')
      if (found !== undefined) return found
    }
    const found = addressAt(node)
    if (found !== undefined && found !== '') return found
    node = node.parentElement
  }
  return undefined
}

/**
 * 装上「回答块里的文档链接 → 会话区打开」的拦截层。
 *
 * 捕获阶段、`pointerdown` 与 `click` 都拦：宿主可能把 openFile 绑在任意一处。
 * 认领成功时掐断事件（`preventDefault` + `stopPropagation`），宿主那条通往
 * 右侧栏的路就断了；随后按会话区的方式打开该文件。
 *
 * 同一路径 800ms 内只开一次：一次点击会先来 pointerdown 再来 click。
 * @param open - 打开方式：给定会话与路径，由调用方决定在会话区怎么呈现。
 * @returns 清理函数。
 */
export function installAnswerLinkInterception(open: (sessionId: string, path: string) => void): () => void {
  if (typeof document === 'undefined') return () => {}
  let lastKey = ''
  let lastAt = 0
  const onOpen = (event: Event): void => {
    const target = event.target as Element | null
    if (target === null || typeof target.closest !== 'function') return
    const session = target.closest('[data-conversation-session]')
    if (session === null) return
    const sessionId = session.getAttribute('data-conversation-session') ?? ''
    if (sessionId === '') return
    // 只认领回答内容里的链接；插件工具区（工作区文件树、浏览器、终端）自己处理点击。
    if (target.closest(ANSWER_LINK_SCOPE) === null) return
    if (target.closest('[data-chat-tools]') !== null) return
    const path = answerLinkPathAt(target)
    if (path === undefined || path === '') return
    // 先掐断宿主自己的处理（它会把链接送到右侧栏），再去重打开。
    event.preventDefault()
    event.stopPropagation()
    const key = sessionId + '|' + path
    const now = Date.now()
    if (key === lastKey && now - lastAt < 800) return
    lastAt = now
    lastKey = key
    open(sessionId, path)
  }
  document.addEventListener('pointerdown', onOpen, true)
  document.addEventListener('click', onOpen, true)
  return () => {
    document.removeEventListener('pointerdown', onOpen, true)
    document.removeEventListener('click', onOpen, true)
  }
}
