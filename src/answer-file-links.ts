/**
 * 回答块里宿主渲染的文件链接：认领与清单。
 *
 * 宿主把 markdown 里的相对文件链接渲染成
 * `<button type="button" title="{路径}">`（title 是解码后的路径，也是按钮的
 * 悬停提示），点它走宿主 openFile → 右侧栏。这个按钮**不是 `<a>`**、也没有任何
 * 资源地址属性，先前只认 `<a>` / 地址属性的拦截层因此从不命中（三次修复都栽在这）。
 *
 * 认领规则（不依赖宿主的哈希类名，跨宿主版本稳定）：
 * 1. 回答卡把自己正文里的文件链接清单写进 `data-answer-file-links`（每行一个路径）；
 * 2. 点击处向上找到第一个 `<button type="button">`，title 命中清单才算文件链接。
 *    行内代码 mention（带 `aria-label`、在 `<code>` 里）和代码块复制钮这类
 *    同样带 title 的按钮，title 不在清单里，天然不误伤。
 */

/** 回答卡正文上的清单标记：值是每行一个路径。 */
export const ANSWER_FILE_LINKS_ATTR = 'data-answer-file-links'

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
  if (links === undefined) return undefined
  let node: Element | null = target
  while (node !== null) {
    if (node.tagName === 'BUTTON' && node.getAttribute('type') === 'button') {
      const title = node.getAttribute('title')
      // mention 按钮（行内代码里的文件提及）带 aria-label、在 <code> 里：
      // 同样有 title，但那是「提及」不是「链接」，不认。
      if (node.closest('code') !== null || node.hasAttribute('aria-label')) return undefined
      return title !== null && title !== '' && links.includes(title) ? title : undefined
    }
    node = node.parentElement
  }
  return undefined
}
