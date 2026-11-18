/**
 * 「当前文件」：正在编辑或预览的那个工作区文件。
 *
 * 关掉编辑回到工作区文件，那一行要标出来——否则几十个文件里找不到刚改的是哪个。
 * 两个来源：
 * - **编辑中**：编辑标签的内容标识是 `edit://<路径>`（工作区相对路径）。
 * - **预览中**：文档预览标签的内容标识是文件地址
 *   （`dsh-resource://file/session/<会话>/<编码路径>`）。
 */

/** 编辑标签的内容标识前缀。 */
export const EDIT_CONTENT_PREFIX = 'edit://'

/** 文档预览的内容标识前缀。 */
export const RESOURCE_CONTENT_PREFIX = 'dsh-resource://file/'

/**
 * 从内容标识里取出工作区相对路径。
 *
 * @param contentId - 标签的内容标识。
 * @returns 工作区相对路径；不是文件类标识时 undefined。
 */
export function pathOfContent(contentId: string | undefined): string | undefined {
  if (contentId === undefined || contentId === '') return undefined
  if (contentId.startsWith(EDIT_CONTENT_PREFIX)) {
    const path = contentId.slice(EDIT_CONTENT_PREFIX.length)
    return path === '' ? undefined : decodeURIComponent(path)
  }
  if (contentId.startsWith(RESOURCE_CONTENT_PREFIX)) {
    // dsh-resource://file/session/<sessionId>/<encoded path relative to the root>
    // 前缀之后是 session/<会话>/<路径>：跳过前两段才是路径。
    const rest = contentId.slice(RESOURCE_CONTENT_PREFIX.length)
    const parts = rest.split('/')
    if (parts.length < 3) return undefined
    const path = parts.slice(2).join('/')
    return path === '' ? undefined : decodeURIComponent(path)
  }
  return undefined
}

/** 一个标签的最小面。 */
export interface TabLike {
  readonly id: string
  readonly kind: string
  readonly contentId: string
}

/**
 * 找出当前正在编辑或预览的文件路径。
 *
 * @param tabs - 该会话的标签。
 * @param activeId - 当前激活的标签 id。
 * @returns 工作区相对路径；没有则 undefined。
 */
export function currentFilePath(tabs: readonly TabLike[], activeId: string | undefined): string | undefined {
  const active = tabs.find(tab => tab.id === activeId)
  if (active !== undefined) {
    const path = pathOfContent(active.contentId)
    if (path !== undefined) return path
  }
  // 激活的不是文件时，退回最近一个文件类标签（编辑在别处打开时仍能定位）。
  for (const tab of tabs) {
    if (tab.kind !== 'local' && tab.kind !== 'text') continue
    const path = pathOfContent(tab.contentId)
    if (path !== undefined) return path
  }
  return undefined
}
