// @vitest-environment jsdom
/**
 * 回答块文件链接的真实 DOM 回归。
 *
 * 宿主把 markdown 里的相对文件链接渲染成
 * `<button type="button" class="…fileLink…" title="{路径}">`——不是 `<a>`、也没有任何
 * 资源地址属性。点它走宿主 openFile → 右侧栏，这正是用户报的故障。修好后的契约：
 *
 * 拦截层按「按钮 class 带 `fileLink` 记号」认出文件链接
 * （行内代码 mention、代码块复制钮这些不得误伤）。
 * 注：清单形态（data-answer-file-links）仍保留——回答卡若写清单，按 title 命中认领。
 */
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = (props: { size?: number }) => createElement('span', { 'data-icon-size': props.size })
  return {
    IconCheckOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconCopyOutlineRegular: stub,
    IconEditOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconWarningOutlineRegular: stub,
    Toast: (props: { text?: string }) => createElement('span', { role: 'status' }, props.text),
    Tooltip: (props: { label?: string; children?: unknown }) => createElement('span', { 'data-tooltip': props.label }, props.children as never),
  }
})

import { answerFileLinkPathAt, ANSWER_FILE_LINKS_ATTR } from '../src/answer-file-links.ts'
import { fallbackT } from '../src/locales.ts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** 宿主结构桩：会话根（带会话号）+ 回答卡 + 回答正文。 */
function buildAnswerDom(links: string): { session: HTMLElement; body: HTMLElement } {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's1')
  const card = document.createElement('div')
  card.setAttribute('data-answer-card', '')
  card.setAttribute('data-chat-power-frame-box', '')
  card.setAttribute('data-chat-power-kind', 'answer')
  const body = document.createElement('div')
  body.setAttribute('data-answer-body', '')
  body.setAttribute(ANSWER_FILE_LINKS_ATTR, links)
  const hostButton = document.createElement('button')
  hostButton.type = 'button'
  hostButton.title = 'dir/b.md'
  // 宿主编译后的类名：`_fileLink_<哈希>`——哈希会变，fileLink 记号不变。
  hostButton.className = '_fileLink_1ypvv_59'
  const icon = document.createElement('span')
  icon.textContent = '⤷'
  hostButton.appendChild(icon)
  const label = document.createElement('span')
  label.textContent = 'b.md'
  hostButton.appendChild(label)
  body.appendChild(hostButton)
  card.appendChild(body)
  session.appendChild(card)
  document.body.appendChild(session)
  return { session, body }
}

describe('回答块文件链接的识别', () => {
  beforeEach(() => { document.body.innerHTML = '' })
  afterEach(() => { document.body.innerHTML = '' })

  it('宿主文件链接按钮：class 带 fileLink 记号 → 给出路径（不依赖清单）', () => {
    const { body } = buildAnswerDom('')
    const button = body.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('type')).toBe('button')
    expect(answerFileLinkPathAt(button)).toBe('dir/b.md')
  })

  it('点在按钮内部的图标 / 文字上，同样向上找到按钮', () => {
    const { body } = buildAnswerDom('')
    const icon = body.querySelector('button span') as HTMLElement
    expect(answerFileLinkPathAt(icon)).toBe('dir/b.md')
  })

  it('清单形态仍在：class 不带记号但 title 命中清单 → 也认', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const button = body.querySelector('button') as HTMLButtonElement
    button.className = '_other_1ypvv_59'
    expect(answerFileLinkPathAt(button)).toBe('dir/b.md')
  })

  it('既无记号也不在清单里（代码块复制钮这类同带 title 的按钮）→ 不认', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.title = '复制代码'
    body.appendChild(copy)
    expect(answerFileLinkPathAt(copy)).toBeUndefined()
  })

  it('行内代码 mention（带 fileMention 记号、有 aria-label、在 code 里）→ 不认', () => {
    const { body } = buildAnswerDom('')
    const code = document.createElement('code')
    const mention = document.createElement('button')
    mention.type = 'button'
    mention.title = 'dir/b.md'
    mention.className = '_fileMention_1ypvv_85'
    mention.setAttribute('aria-label', 'dir/b.md')
    code.appendChild(mention)
    body.appendChild(code)
    expect(answerFileLinkPathAt(mention)).toBeUndefined()
  })

  it('不在回答卡里（清单缺席）→ 不认', () => {
    const loose = document.createElement('button')
    loose.type = 'button'
    loose.title = 'dir/b.md'
    document.body.appendChild(loose)
    expect(answerFileLinkPathAt(loose)).toBeUndefined()
  })

  it('多张回答卡各用各的清单：点到第二张按第二张认', () => {
    const session = document.createElement('div')
    session.setAttribute('data-conversation-session', 's1')
    for (const links of ['first.md', 'second.md']) {
      const body = document.createElement('div')
      body.setAttribute('data-answer-body', '')
      body.setAttribute(ANSWER_FILE_LINKS_ATTR, links)
      const button = document.createElement('button')
      button.type = 'button'
      button.title = 'second.md'
      body.appendChild(button)
      session.appendChild(body)
    }
    document.body.appendChild(session)
    const bodies = [...session.querySelectorAll(`[${ANSWER_FILE_LINKS_ATTR}]`)]
    expect(answerFileLinkPathAt(bodies[0]!.querySelector('button') as Element)).toBeUndefined()
    expect(answerFileLinkPathAt(bodies[1]!.querySelector('button') as Element)).toBe('second.md')
  })
})
