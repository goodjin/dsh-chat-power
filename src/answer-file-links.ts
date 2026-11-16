/**
 * 回答块里宿主渲染的文件链接：认领规则。
 *
 * 宿主把 markdown 里的工作区文件链接渲染成
 * `<button type="button" class="…fileLink…" title="{路径}">`（title 是路径，也是
 * 按钮的悬停提示），点它走宿主 openFile → 右侧文档预览。这正是用户报的
 * 「回答块里的文档链接还是会在右侧打开」。
 *
 * 认领规则（不依赖宿主的哈希类名全文，跨宿主版本稳定）：
 * 1. **宿主形态**：向上找到第一个 `<button type="button">`，其 class 里带
 *    `fileLink` 记号（编译后形如 `_fileLink_1ypvv_59`，哈希会变、记号不变），
 *    title 非空 → 这就是文件链接，路径取 title。
 *    行内代码里的 mention 按钮只带 `fileMention` 记号、且在 `<code>` 里并带
 *    aria-label；代码块复制钮完全不带记号——两者都天然不误伤。
 * 2. **清单形态**（保留）：回答卡若写进了 `data-answer-file-links`
 *    （每行一个路径），按钮 title 命中清单也算数。
 */

/** 回答卡正文上的清单标记：值是每行一个路径。 */
export const ANSWER_FILE_LINKS_ATTR = 'data-answer-file-links'

/**
 * 宿主文件链接按钮的 class 记号。
 *
 * 编译包的 CSS module 类名形如 `_fileLink_1ypvv_59`：哈希随构建变，前缀稳定。
 * 用子串匹配而不是等值匹配——编译后的完整类名每次构建都不同。
 */
const FILE_LINK_CLASS_TOKEN = 'fileLink'

/**
 * 清单的属性值：按行拼接。路径本身不允许换行（控制字符会被链接解析拒绝），
 * 所以行是安全分隔符。
 */
export function answerFileLinksAttr(paths: readonly string[]): string {
  return paths.join('\n')
}

/** 点击处所属回答卡的链接清单；不在回答卡里时为 undefined。 */
function linkedPathsAt(target: Element): readonly string[] | undefined {
  const scope = target.closest(`[${ANSWER_FILE_LINKS_ATTR}]`)
  if (scope === null) return undefined
  const raw = scope.getAttribute(ANSWER_FILE_LINKS_ATTR) ?? ''
  if (raw === '') return undefined
  return raw.split('\n')
}

/** 元素（或其祖先）是否带宿主文件链接按钮的 class 记号。 */
function hasFileLinkClass(node: Element): boolean {
  const className = node.getAttribute('class')
  if (className === null) return false
  return className.split(/\s+/).some(token => token.includes(FILE_LINK_CLASS_TOKEN))
}

/**
 * 从点击处认出「宿主渲染的文件链接按钮」，给出要打开的路径。
 *
 * 向上只找到**第一个**按钮就停：按钮里不会再套按钮，最内层就是点击落点；
 * 不命中就放弃，不越级外扩（外层若有按钮也不是这次点击的对象）。
 * @param target - 事件目标（或其任意祖先元素）。
 * @returns 文件路径；不是文件链接时为 undefined。
 */
export function answerFileLinkPathAt(target: Element): string | undefined {
  const links = linkedPathsAt(target)
  let node: Element | null = target
  while (node !== null) {
    if (node.tagName === 'BUTTON' && node.getAttribute('type') === 'button') {
      const title = node.getAttribute('title')
      // mention 按钮（行内代码里的文件提及）带 aria-label、在 code 里：
      // 同样有 title，但那是「提及」不是「链接」，不认。
      if (node.closest('code') !== null || node.hasAttribute('aria-label')) return undefined
      if (title === null || title === '') return undefined
      // 宿主形态：class 带 fileLink 记号。
      if (hasFileLinkClass(node)) return title
      // 清单形态：title 命中回答卡写下的清单。
      if (links !== undefined && links.includes(title)) return title
      return undefined
    }
    node = node.parentElement
  }
  return undefined
}
