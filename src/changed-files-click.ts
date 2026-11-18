/**
 * 宿主「改动文件卡」的点击认领：改成在会话区打开。
 *
 * 宿主每轮末尾有一张官方的改动文件卡（`dsh-client-ui-deliverables` 画的，
 * 容器带 `data-changed-files`）：卡头与每一行点下去都会在**右侧 Sidebar** 打开
 * 本轮的 review 对比（2026-11-18 现场：每轮「已编辑的文件」点开都在右侧栏）。
 *
 * 会话区里本来就有等价的呈现——每轮文件块（可展开正文、可编辑、写回原文件），
 * 所以这里把这张官方卡的点击认领下来，改由会话区打开对应文件；宿主那条通往
 * 右侧栏的路走不通。
 *
 * 路径从行里取：官方行显示的是**绝对路径**（工作区根 + 相对路径），据此还原
 * 出工作区相对路径；根之外的路径原样给出（宿主拒绝工作区根之外的路径，
 * 交由上层报错，别自己拼一个假的）。
 */

/** 官方改动文件卡的容器标记。 */
export const CHANGED_FILES_SELECTOR = '[data-changed-files]'

/**
 * 元素是否在官方改动卡里。
 *
 * @param node - 元素。
 * @returns 是否在改动卡里。
 */
export function isChangedFilesCard(node: Element | null): boolean {
  return node !== null && node.closest(CHANGED_FILES_SELECTOR) !== null
}

/**
 * 去掉路径尾部的分隔符。
 *
 * @param path - 路径。
 * @returns 去掉尾部分隔符的路径。
 */
function trimTrailingSeparator(path: string): string {
  return path.replace(/[/\\]+$/, '')
}

/**
 * 把绝对路径还原成工作区相对路径。
 *
 * @param display - 行里显示的路径（可能是绝对路径）。
 * @param root - 会话的工作区根。
 * @returns 工作区相对路径；不在根之内时原样给出。
 */
export function relativeToRoot(display: string, root: string | undefined): string {
  if (root === undefined || root === '') return display
  const base = trimTrailingSeparator(root)
  if (display === base) return ''
  const prefix = base + '/'
  if (display.startsWith(prefix)) return display.slice(prefix.length)
  // Windows 盘符不区分大小写，其余按大小写敏感（与宿主一致）。
  if (/^[a-zA-Z]:/.test(base) && display.toLowerCase().startsWith(prefix.toLowerCase())) {
    return display.slice(prefix.length)
  }
  return display
}

/**
 * 从官方改动卡的一行里取出要打开的路径。
 *
 * @param target - 点击处（或其任意祖先）。
 * @param root - 会话的工作区根；没有时按显示路径原样给出。
 * @returns 工作区相对路径；不在这张卡里时 undefined。
 */
export function changedFilePathAt(target: Element, root: string | undefined): string | undefined {
  const card = target.closest(CHANGED_FILES_SELECTOR)
  if (card === null) return undefined
  // 行里的路径文字：官方放在一个 span 里（class 带 path 记号），文本是绝对路径。
  const text = pathTextAt(target, card)
  if (text === undefined || text === '') return undefined
  return relativeToRoot(text, root)
}

/**
 * 在卡里找出点击处对应的路径文本。
 *
 * 官方为每一行渲染了一个隐藏元素，内容是这一文件的绝对路径，行上的
 * `aria-describedby` 指向它——这是稳定的路径来源（不靠本地化文案，也不靠
 * 编译后会变的 class 名）。找不到时退回行里的路径文字。
 *
 * @param target - 点击处。
 * @param card - 改动卡容器。
 * @returns 路径文本；找不到时 undefined。
 */
function pathTextAt(target: Element, card: Element): string | undefined {
  const button = target.closest('button')
  if (button !== null) {
    const describedBy = button.getAttribute('aria-describedby')
    if (describedBy !== null && describedBy !== '') {
      // 一行可能描述多个元素（aria-describedby 是空格分隔的列表）。
      for (const id of describedBy.split(/\s+/)) {
        if (id === '') continue
        const described = card.querySelector(`[id="${cssEscape(id)}"]`)
        const text = described?.textContent?.trim()
        if (text !== undefined && text !== '') return text
      }
    }
  }
  // 退回：行里的路径文字（官方放在一个 span 里，文本是绝对路径）。
  const own = target.closest('span')
  if (own !== null && own !== card) {
    const text = own.textContent?.trim()
    if (text !== undefined && text !== '') return text
  }
  return undefined
}

/**
 * 把 id 里的引号转义掉，好放进属性选择器里。
 *
 * @param value - id。
 * @returns 转义后的字符串。
 */
function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}
