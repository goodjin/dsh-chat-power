// @vitest-environment jsdom
/**
 * 回答块「文档链接」认领的真实 DOM 回归。
 *
 * 宿主把 markdown 里的工作区文件链接渲染成
 * `<button type="button" class="…fileLink…" title="{路径}">`——不是 `<a>`，也没有
 * 任何资源地址属性。点它走宿主 openFile → 右侧文档预览；用户要的是在会话区
 * 打开（像打开工作区文件一样）。
 *
 * 这里钉住三种形态的认领，以及不误伤的那几种按钮。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { answerLinkPathAt, ANSWER_LINK_SCOPE, installAnswerLinkInterception, pathFromAddress, relativeLinkPath } from '../src/answer-link-intercept.ts'

/** 宿主结构桩：会话根（带会话号）+ 回答行（宿主 flow 行）。 */
function buildAnswer(): { session: HTMLElement; row: HTMLElement } {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's1')
  const row = document.createElement('div')
  row.setAttribute('data-chat-flow-kind', 'assistant-step')
  session.appendChild(row)
  document.body.appendChild(session)
  return { session, row }
}

/** 宿主渲染的文件链接按钮（编译后的类名带 fileLink 记号）。 */
function hostFileLink(parent: HTMLElement, path: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.title = path
  button.className = '_fileMention_1ypvv_85 _fileLink_1ypvv_59'
  const label = document.createElement('span')
  label.textContent = path.split('/').at(-1) ?? path
  button.appendChild(label)
  parent.appendChild(button)
  return button
}

describe('回答块文档链接的认领', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('宿主文件链接按钮 → 给出路径', () => {
    const { row } = buildAnswer()
    const button = hostFileLink(row, 'docs/readme.md')
    expect(answerLinkPathAt(button)).toBe('docs/readme.md')
    // 点在按钮里的文字上同样认得出。
    expect(answerLinkPathAt(button.querySelector('span')!)).toBe('docs/readme.md')
  })

  it('markdown 相对路径链接 → 给出路径', () => {
    const { row } = buildAnswer()
    const anchor = document.createElement('a')
    anchor.href = 'docs/readme.md'
    row.appendChild(anchor)
    expect(answerLinkPathAt(anchor)).toBe('docs/readme.md')
  })

  it('文档卡片：任意层属性里的资源地址 → 给出路径', () => {
    const { row } = buildAnswer()
    const card = document.createElement('div')
    card.setAttribute('data-resource', 'dsh-resource://file/session/s1/docs/data.csv')
    const inner = document.createElement('span')
    card.appendChild(inner)
    row.appendChild(card)
    expect(answerLinkPathAt(inner)).toBe('session/s1/docs/data.csv')
  })

  it('网页链接不认领：它们有自己的一套打开方式', () => {
    const { row } = buildAnswer()
    const anchor = document.createElement('a')
    anchor.href = 'https://example.com/docs'
    row.appendChild(anchor)
    expect(answerLinkPathAt(anchor)).toBeUndefined()
  })

  it('行内代码 mention（有 aria-label、在 code 里）→ 不认', () => {
    const { row } = buildAnswer()
    const code = document.createElement('code')
    const mention = document.createElement('button')
    mention.type = 'button'
    mention.title = 'docs/readme.md'
    mention.className = '_fileMention_1ypvv_85'
    mention.setAttribute('aria-label', 'docs/readme.md')
    code.appendChild(mention)
    row.appendChild(code)
    expect(answerLinkPathAt(mention)).toBeUndefined()
  })

  it('代码块复制钮（同带 title、无记号）→ 不认', () => {
    const { row } = buildAnswer()
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.title = '复制代码'
    row.appendChild(copy)
    expect(answerLinkPathAt(copy)).toBeUndefined()
  })

  it('范围选择器覆盖宿主回答行与本包的文件块', () => {
    const { session, row } = buildAnswer()
    expect(row.closest(ANSWER_LINK_SCOPE)).not.toBeNull()
    const tail = document.createElement('div')
    tail.setAttribute('data-turn-tail', '')
    session.appendChild(tail)
    expect(tail.closest(ANSWER_LINK_SCOPE)).not.toBeNull()
    const block = document.createElement('div')
    block.setAttribute('data-files-block', '')
    session.appendChild(block)
    expect(block.closest(ANSWER_LINK_SCOPE)).not.toBeNull()
  })

  it('资源地址与相对路径的解析', () => {
    expect(pathFromAddress('dsh-resource://file/session/s1/a.md')).toBe('session/s1/a.md')
    expect(pathFromAddress('file:///a/b.md')).toBe('a/b.md')
    expect(relativeLinkPath('./docs/a.md')).toBe('docs/a.md')
    expect(relativeLinkPath('https://example.com')).toBeUndefined()
    expect(relativeLinkPath('#anchor')).toBeUndefined()
    expect(relativeLinkPath('/abs/path')).toBeUndefined()
  })
})

describe('拦截层装上之后的点击', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('点宿主文件链接按钮 → 认领并在会话区打开，宿主那条路走不成', () => {
    const { row } = buildAnswer()
    const button = hostFileLink(row, 'docs/readme.md')
    const opened: string[] = []
    const stop = installAnswerLinkInterception((sessionId, path) => { opened.push(sessionId + '|' + path) })
    let hostSaw = false
    button.addEventListener('click', () => { hostSaw = true })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual(['s1|docs/readme.md'])
    expect(hostSaw).toBe(false)
  })

  it('工具区里的链接不认领（工作区文件树自己处理点击）', () => {
    const { session } = buildAnswer()
    const tools = document.createElement('section')
    tools.setAttribute('data-chat-tools', '')
    const button = hostFileLink(tools, 'docs/readme.md')
    session.appendChild(tools)
    const opened: string[] = []
    const stop = installAnswerLinkInterception((sessionId, path) => { opened.push(sessionId + '|' + path) })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual([])
  })

  it('回答区外的链接不认领', () => {
    const session = document.createElement('div')
    session.setAttribute('data-conversation-session', 's1')
    const elsewhere = document.createElement('div')
    const button = hostFileLink(elsewhere, 'docs/readme.md')
    session.appendChild(elsewhere)
    document.body.appendChild(session)
    const opened: string[] = []
    const stop = installAnswerLinkInterception((sessionId, path) => { opened.push(sessionId + '|' + path) })
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual([])
  })

  it('一次点击只开一次（pointerdown 与 click 各来一次）', () => {
    const { row } = buildAnswer()
    const button = hostFileLink(row, 'docs/readme.md')
    const opened: string[] = []
    const stop = installAnswerLinkInterception((sessionId, path) => { opened.push(sessionId + '|' + path) })
    button.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual(['s1|docs/readme.md'])
  })
})
