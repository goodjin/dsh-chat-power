// @vitest-environment jsdom
/**
 * 回答块文件链接（宿主**按钮形态**）的真实 DOM 回归。
 *
 * 宿主把 markdown 里的相对文件链接渲染成
 * `<button type="button" title="{路径}">`——不是 `<a>`，也没有任何资源地址属性。
 * 点它走宿主 openFile → 右侧栏，这正是用户报的故障。修好后的契约：
 *
 * 1. 回答卡把自己正文里的文件链接清单写进 `data-answer-file-links`
 *    （回答卡自己的 data 标记，不依赖宿主的哈希类名）；
 * 2. 拦截层按「按钮 title 命中该清单」认出文件链接（行内代码 mention、
 *    代码块复制钮这些同样带 title 的按钮不得误伤）。
 */
import { createElement } from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
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

import { AnswerCard } from '../src/answer-card.tsx'
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

  it('宿主文件链接按钮：title 命中回答卡的链接清单 → 给出路径', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const button = body.querySelector('button') as HTMLButtonElement
    expect(button.getAttribute('type')).toBe('button')
    expect(answerFileLinkPathAt(button)).toBe('dir/b.md')
  })

  it('点在按钮内部的图标 / 文字上，同样向上找到按钮', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const icon = body.querySelector('button span') as HTMLElement
    expect(answerFileLinkPathAt(icon)).toBe('dir/b.md')
  })

  it('title 不在清单里（代码块复制钮这类同带 title 的按钮）→ 不认', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.title = '复制代码'
    body.appendChild(copy)
    expect(answerFileLinkPathAt(copy)).toBeUndefined()
  })

  it('行内代码 mention（有 aria-label、在 code 里）→ 不认', () => {
    const { body } = buildAnswerDom('dir/b.md')
    const code = document.createElement('code')
    const mention = document.createElement('button')
    mention.type = 'button'
    mention.title = 'dir/b.md'
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

describe('回答卡把正文里的文件链接清单写进 DOM', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => { root.unmount() })
    container.remove()
  })

  const renderCard = async (text: string): Promise<HTMLElement> => {
    await act(async () => {
      root.render(createElement(AnswerCard, {
        blocks: [{ kind: 'text', text }],
        sessionId: 's1',
        readers: {} as never,
        t: fallbackT,
        status: 'settled',
        children: createElement('button', { type: 'button', title: '.agents/skills/prd-builder/SKILL.md' }, 'SKILL.md'),
      }))
    })
    return container.querySelector('[data-answer-body]') as HTMLElement
  }

  it('正文里的 markdown 文件链接进清单', async () => {
    const body = await renderCard('写进 [SKILL.md](.agents/skills/prd-builder/SKILL.md) 与 [b.md](dir/b.md)。')
    const links = (body.getAttribute(ANSWER_FILE_LINKS_ATTR) ?? '').split('\n')
    expect(links).toContain('.agents/skills/prd-builder/SKILL.md')
    expect(links).toContain('dir/b.md')
  })

  it('行内代码与图片不算；同一路径只留一次', async () => {
    const body = await renderCard(
      '`a.md` 不是链接；![图](pic.png) 不算；[c.md](c.md) 与 [再看](c.md) 只留一次。',
    )
    expect(body.getAttribute(ANSWER_FILE_LINKS_ATTR)).toBe('c.md')
  })

  it('清单里的路径与正文里渲染出来的宿主按钮对得上', async () => {
    const body = await renderCard('写进 [SKILL.md](.agents/skills/prd-builder/SKILL.md)。')
    const button = body.querySelector('button[title]') as HTMLElement
    expect(answerFileLinkPathAt(button)).toBe('.agents/skills/prd-builder/SKILL.md')
  })
})
