// @vitest-environment jsdom
/**
 * 标签并入宿主行的**真实 DOM**回归（jsdom + 真 document）。
 *
 * 钉住两件事：
 * 1. 宿主那一行在**标题栏**里、与会话内容区是**兄弟**——所以「并入宿主行」必须
 *    按会话面板作用域去找，只在内容区内部找永远找不到（此前一直退回自建行，
 *    界面上多出第二栏）；
 * 2. 作用域不串：侧栏里的内嵌会话（子代理聊天）没有自己的标题栏，不能把主会话
 *    那一行认成自己的。
 */
import { describe, expect, it } from 'vitest'

import {
  GROUP_ATTR,
  ROW_ATTR,
  TAB_ATTR,
  TAB_ID_ATTR,
  DOC_ATTR,
  handleToolsRowClick,
  syncSessionToolsRow,
  type RowDocumentLike,
  type RowElementLike,
  type ToolsRowHandlers,
  type ToolsRowSnapshot,
} from '../src/tools-tabs.ts'

interface Built {
  readonly content: HTMLElement
  readonly hostRow: HTMLElement
}

/** 按 app.asar 里 dsh-client-ui-conversation 的真实嵌套搭一棵会话 DOM。 */
function buildSession(sessionId: string): Built {
  const panel = document.createElement('div')
  // 标题栏与内容区是兄弟：宿主那一行在标题栏里。
  const header = document.createElement('header')
  header.setAttribute('data-window-drag', 'true')
  const hostRow = document.createElement('div')
  hostRow.setAttribute('data-conversation-tabs', '')
  hostRow.setAttribute('role', 'tablist')
  const hostTab = document.createElement('button')
  hostTab.setAttribute('role', 'tab')
  hostTab.textContent = '对话'
  hostRow.appendChild(hostTab)
  header.appendChild(hostRow)
  const content = document.createElement('div')
  content.setAttribute('data-conversation-content', '')
  content.setAttribute('data-conversation-session', sessionId)
  const scroll = document.createElement('div')
  scroll.setAttribute('data-conversation-scroll', '')
  content.appendChild(scroll)
  panel.appendChild(header)
  panel.appendChild(content)
  document.body.appendChild(panel)
  return { content, hostRow }
}

const handlers = (snapshot: (sessionId: string) => ToolsRowSnapshot): ToolsRowHandlers => ({
  snapshot,
  activateChat: () => {},
  selectTab: () => {},
  openKind: () => {},
  closeTab: () => {},
  subscribe: () => () => {},
  labels: { chat: '对话', kinds: { files: '文件', browser: '浏览器', terminal: '终端' } },
  icons: {
    files: '<svg data-icon="files"></svg>',
    browser: '<svg data-icon="browser"></svg>',
    terminal: '<svg data-icon="terminal"></svg>',
    document: '<svg data-icon="document"></svg>',
  },
})

const doc = () => document as unknown as RowDocumentLike

describe('标签并入宿主行（真实 DOM）', () => {
  it('宿主行在标题栏里：标签组补挂进宿主行，内容区里不留自建行', () => {
    const { content, hostRow } = buildSession('s1')
    const h = handlers(() => ({ active: 't1', tabs: [{ id: 't1', kind: 'local', title: 'a.md' }] }))
    const row = syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    expect(row).toBe(hostRow)
    expect(content.querySelector(`[${ROW_ATTR}]`)).toBeNull()
    const group = hostRow.querySelector(`[${GROUP_ATTR}]`)
    expect(group).not.toBeNull()
    // 三个种类启动器 + 一枚文件标签外壳 + 外壳里的标题钮（外壳自己就是这枚标签）。
    expect(group!.querySelectorAll(`[${TAB_ATTR}]`)).toHaveLength(5)
  })

  it('打开的文件是视图入口：图标 + 文件名，与浏览器/终端同一排同一款', () => {
    const { content, hostRow } = buildSession('s1')
    const h = handlers(() => ({
      active: 't4',
      tabs: [
        { id: 't1', kind: 'files', title: '工作区文件' },
        { id: 't2', kind: 'browser', title: '浏览器' },
        { id: 't3', kind: 'terminal', title: '终端' },
        { id: 't4', kind: 'local', title: 'a.md' },
      ],
    }))
    const row = syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    const group = row!.querySelector(`[${GROUP_ATTR}]`) as unknown as HTMLElement
    const docs = group.querySelectorAll(`[${DOC_ATTR}]`)
    expect(docs).toHaveLength(1)
    const view = docs[0]!
    // 外壳自己是这枚标签：框（Chrome 式）包住标题钮与关闭钮。
    expect(view.hasAttribute(TAB_ATTR)).toBe(true)
    expect(view.getAttribute(TAB_ID_ATTR)).toBe('t4')
    expect(view.getAttribute('data-chat-tools-tab-active')).toBe('')
    // 视图入口：图标 + 文件名，和旁边三个视图入口是同一种按钮。
    const button = view.querySelector(`[${TAB_ATTR}]`)!
    expect(button.textContent).toBe('a.md')
    expect(button.querySelector('[data-icon="document"]')).not.toBeNull()
    expect(button.getAttribute('aria-selected')).toBe('true')
    // 关闭钮与它并在一处（按钮里不能套按钮）。
    expect(view.querySelector('[data-chat-tools-tab-close]')).not.toBeNull()
    // 位置：紧跟三个视图之后（同一排里，不是行尾另起一个样式的标签）。
    const kids = Array.from(group.children) as HTMLElement[]
    expect(kids.indexOf(view as unknown as HTMLElement)).toBe(kids.length - 1)
    expect(kids.filter(el => el.hasAttribute('data-chat-tools-tab-kind'))).toHaveLength(3)
  })

  it('标签组排在宿主自己的标签之后', () => {
    const { content, hostRow } = buildSession('s1')
    const h = handlers(() => ({ active: 't1', tabs: [{ id: 't1', kind: 'local', title: 'a.md' }] }))
    syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    const group = hostRow.querySelector(`[${GROUP_ATTR}]`)!
    const kids = [...hostRow.children]
    expect(kids.indexOf(group)).toBeGreaterThan(kids.indexOf(hostRow.querySelector('button')!))
  })

  it('内嵌会话（侧栏里的子代理聊天）没有自己的标题栏：不认主会话那一行', () => {
    // 内嵌会话的内容区与主会话的内容区在同一层应用外壳里，但主会话的标题栏
    // 与内嵌会话不在同一个面板——不能把主会话的宿主行认成内嵌会话的。
    const { content, hostRow } = buildSession('s1')
    const embeddedPanel = document.createElement('div')
    const embeddedContent = document.createElement('div')
    embeddedContent.setAttribute('data-conversation-content', '')
    embeddedContent.setAttribute('data-conversation-session', 's2')
    embeddedPanel.appendChild(embeddedContent)
    document.body.appendChild(embeddedPanel)

    const h = handlers(id => ({ active: `${id}-t1`, tabs: [{ id: `${id}-t1`, kind: 'local', title: 'a.md' }] }))
    const mainRow = syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    const embeddedRow = syncSessionToolsRow(embeddedContent as unknown as RowElementLike, doc(), h, {})

    expect(mainRow).toBe(hostRow)
    expect(hostRow.querySelectorAll(`[${GROUP_ATTR}]`)).toHaveLength(1)
    // 内嵌会话自建行：它没有宿主行可用。
    expect(embeddedRow!.hasAttribute(ROW_ATTR)).toBe(true)
    // 主会话那一行里没有被塞进第二个标签组。
    expect(hostRow.querySelectorAll(`[${GROUP_ATTR}]`)).toHaveLength(1)
  })

  it('宿主行缺席（空会话还没渲染标题栏）：自建行落在内容区里', () => {
    const content = document.createElement('div')
    content.setAttribute('data-conversation-content', '')
    content.setAttribute('data-conversation-session', 's1')
    const scroll = document.createElement('div')
    scroll.setAttribute('data-conversation-scroll', '')
    content.appendChild(scroll)
    document.body.appendChild(content)
    const h = handlers(() => ({ active: 't1', tabs: [{ id: 't1', kind: 'local', title: 'a.md' }] }))
    const row = syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    expect(row!.hasAttribute(ROW_ATTR)).toBe(true)
    expect(content.querySelector(`[${ROW_ATTR}]`)).toBe(row)
  })

  it('标签在标题栏里：点它仍能定位到本次会话并路由出去', () => {
    // 标签现在住在标题栏（不在内容区里）：点击路由要能从标题栏找回会话，
    // 否则点了没反应——会话 id 取不到就直接不处理了。
    const { content, hostRow } = buildSession('s1')
    const actions: string[] = []
    const h: ToolsRowHandlers = {
      snapshot: () => ({ active: 't1', tabs: [{ id: 't1', kind: 'local', title: 'a.md' }] }),
      activateChat: id => { actions.push(`chat:${id}`) },
      selectTab: (id, tabId) => { actions.push(`select:${id}:${tabId}`) },
      openKind: (id, kind) => { actions.push(`kind:${id}:${kind}`) },
      closeTab: (id, tabId) => { actions.push(`close:${id}:${tabId}`) },
      subscribe: () => () => {},
      labels: { chat: '对话', kinds: { files: '文件', browser: '浏览器', terminal: '终端' } },
    }
    syncSessionToolsRow(content as unknown as RowElementLike, doc(), h, {})
    const tab = hostRow.querySelector(`[${TAB_ID_ATTR}="t1"]`)!
    const stopped = { stopped: false }
    const handled = handleToolsRowClick({
      target: tab,
      preventDefault: () => {},
      stopPropagation: () => { stopped.stopped = true },
    } as never, h)
    expect(handled).toBe(true)
    expect(stopped.stopped).toBe(true)
    expect(actions).toEqual(['select:s1:t1'])
  })
})
