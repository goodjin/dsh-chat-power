// @vitest-environment jsdom
/**
 * 布局的**真实 DOM**回归（jsdom + 真 document，不挂 setup.ts 的哑代理、不用假节点）。
 *
 * 钉住两件事：
 * 1. `mountToolBody` 把工具正文挂进滚动层、宿主视图之后、composer 之前——标签行在上、
 *    正文居中、composer 在下（2026-11-08 显示故障的正解几何，独立 Chrome fixture 已验）；
 * 2. `createToolMessageHider` 在「激活 → 插入新视图 → 退出」后把新旧视图都恢复——
 *    修「新视图永远 display:none」的审查发现。
 */
import { describe, expect, it } from 'vitest'

import { createToolMessageHider, mountToolBody, toolMessageNodes } from '../src/tools-layout.ts'

interface Built {
  readonly content: HTMLElement
  readonly scroll: HTMLElement
  readonly composer: HTMLElement
  readonly views: HTMLElement
  readonly row: HTMLElement
  readonly hostTabs: HTMLElement
}

/** 按 app.asar 里 dsh-client-ui-conversation 的真实嵌套搭一棵会话 DOM。 */
function buildSession(): Built {
  const root = document.createElement('div')
  const header = document.createElement('header')
  const hostTabs = document.createElement('div')
  hostTabs.setAttribute('data-conversation-tabs', '')
  header.appendChild(hostTabs)
  const content = document.createElement('div')
  content.setAttribute('data-conversation-content', '')
  content.setAttribute('data-conversation-session', 's1')
  const row = document.createElement('div')
  row.setAttribute('data-chat-tools-row', '')
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  const views = document.createElement('div')
  views.setAttribute('data-conversation-views', '')
  const composer = document.createElement('div')
  composer.setAttribute('data-composer-seat', '')
  scroll.appendChild(views)
  scroll.appendChild(composer)
  content.appendChild(row)
  content.appendChild(scroll)
  root.appendChild(header)
  root.appendChild(content)
  document.body.appendChild(root)
  return { content, scroll, composer, views, row, hostTabs }
}

const mountFlag = (node: Element | null): boolean => node?.getAttribute('data-chat-tools-mount') !== null

describe('mountToolBody（真实 DOM：挂载位）', () => {
  it('正文落在滚动层里、宿主视图之后、composer 之前；标签行在 content 直属、滚动层之前', () => {
    const { content, scroll, composer, row } = buildSession()
    const body = document.createElement('div')
    body.setAttribute('data-chat-tools-mount', '')
    mountToolBody(content, body)
    // 滚动层内：视图 → 正文 → composer。
    expect([...scroll.children].map(child => mountFlag(child))).toEqual([false, true, false])
    expect(scroll.children[1]).toBe(body)
    expect([...scroll.children].indexOf(body)).toBeLessThan([...scroll.children].indexOf(composer))
    // content 直属：标签行在滚动层之前，正文在滚动层之内——整体仍是「标签在上、正文居中」。
    expect([...content.children].indexOf(row)).toBeLessThan([...content.children].indexOf(scroll))
  })

  it('无 composer 兜底挂进滚动层末尾；无滚动层兜底挂进 content', () => {
    const content = document.createElement('div')
    content.setAttribute('data-conversation-content', '')
    const scroll = document.createElement('div')
    scroll.setAttribute('data-conversation-scroll', '')
    content.appendChild(scroll)
    const body = document.createElement('div')
    mountToolBody(content, body)
    expect(scroll.children[0]).toBe(body)

    const content2 = document.createElement('div')
    content2.setAttribute('data-conversation-content', '')
    const body2 = document.createElement('div')
    mountToolBody(content2, body2)
    expect(content2.children[0]).toBe(body2)
  })
})

describe('toolMessageNodes（真实 DOM：激活时收起谁）', () => {
  it('只含宿主视图，不含正文与 composer', () => {
    const { scroll, composer, views } = buildSession()
    const body = document.createElement('div')
    body.setAttribute('data-chat-tools-mount', '')
    mountToolBody(scroll.ownerDocument!.querySelector('[data-conversation-content]') as HTMLElement, body)
    const nodes = toolMessageNodes(scroll, body)
    expect(nodes).toEqual([views])
    expect(nodes).not.toContain(composer)
    expect(nodes).not.toContain(body)
  })
})

describe('createToolMessageHider（激活 → 插入新视图 → 退出）', () => {
  it('初始视图与激活期间新补渲染的视图都恢复', () => {
    const initial = document.createElement('div')
    const added = document.createElement('div')
    document.body.append(initial, added)
    const hider = createToolMessageHider()
    hider.hide(initial) // 激活：收起初始视图
    expect(initial.style.display).toBe('none')
    hider.hide(added) // 激活期间宿主补渲染的新视图
    expect(added.style.display).toBe('none')
    hider.restore() // 退出
    expect(initial.style.display).toBe('')
    expect(added.style.display).toBe('')
    initial.remove()
    added.remove()
  })
})
