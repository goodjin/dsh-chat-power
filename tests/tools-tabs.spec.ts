/**
 * 工具标签并入宿主行的行为：同步（补挂 / 自建行）与点击路由。
 *
 * 宿主 conversation.view 条目是全局的，装不下按会话各自的文件标签——这一段
 * 用假元素直接测 DOM 行为：宿主行在场补挂进宿主行、缺席时自建行、激活标记、
 * 关闭钮路由、种类启动器路由、宿主标签点击先收工具。
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  GROUP_ATTR,
  LIVE_ATTR,
  ROW_ATTR,
  TAB_ATTR,
  TAB_CLOSE_ATTR,
  TAB_ID_ATTR,
  TAB_KIND_ATTR,
  handleToolsRowClick,
  syncSessionToolsRow,
  type RowElementLike,
  type ToolsRowHandlers,
  type ToolsRowSnapshot,
} from '../src/tools-tabs.ts'

/** 最小假元素：属性 + 子节点 + 最近祖先查找，够 sync 与 click 路由用。 */
interface FakeEl {
  tag: string
  attrs: Record<string, string>
  children: FakeEl[]
  parent: FakeEl | null
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  removeAttribute(name: string): void
  remove(): void
  append(child: FakeEl): void
  replaceChildren(): void
  insertBefore(child: FakeEl, before: FakeEl | null): void
  querySelector(selector: string): FakeEl | null
  querySelectorAll(selector: string): FakeEl[]
  closest(selector: string): FakeEl | null
  readonly parentElement: FakeEl | null
}

function el(tag: string, attrs: Record<string, string> = {}): FakeEl {
  const node: FakeEl = {
    tag,
    attrs: { ...attrs },
    children: [],
    parent: null,
    setAttribute(name, value) { node.attrs[name] = value },
    getAttribute(name) { return name in node.attrs ? node.attrs[name] ?? null : null },
    hasAttribute(name) { return name in node.attrs },
    removeAttribute(name) { delete node.attrs[name] },
    remove() {
      const parent = node.parent
      if (parent === null) return
      const at = parent.children.indexOf(node)
      if (at >= 0) parent.children.splice(at, 1)
      node.parent = null
    },
    append(child) { child.parent = node; node.children.push(child) },
    replaceChildren() { for (const child of node.children) child.parent = null; node.children = [] },
    insertBefore(child, before) {
      child.parent = node
      const at = before === null ? -1 : node.children.indexOf(before)
      if (at < 0) node.children.push(child)
      else node.children.splice(at, 0, child)
    },
    querySelector(selector) {
      const attribute = /\[([^\]=]+)\]/.exec(selector)?.[1]
      const walk = (current: FakeEl): FakeEl | null => {
        for (const child of current.children) {
          if (typeof child.hasAttribute !== 'function') continue
          if (attribute !== undefined && child.hasAttribute(attribute)) return child
          const found = walk(child)
          if (found !== null) return found
        }
        return null
      }
      return walk(node)
    },
    get parentElement() { return node.parent },
    querySelectorAll(selector) {
      const attribute = /\[([^\]=]+)\]/.exec(selector)?.[1]
      const found: FakeEl[] = []
      const walk = (current: FakeEl): void => {
        for (const child of current.children) {
          if (typeof child.hasAttribute !== 'function') continue
          if (attribute !== undefined && child.hasAttribute(attribute)) found.push(child)
          walk(child)
        }
      }
      walk(node)
      return found
    },
    closest(selector) {
      const attribute = /\[([^\]=]+)\]/.exec(selector)?.[1] ?? /button\[role=tab\]/.exec(selector)?.[0]
      if (attribute === undefined) return null
      let cursor: FakeEl | null = node
      while (cursor !== null) {
        if (attribute.startsWith('button')) {
          if (cursor.tag === 'button' && cursor.getAttribute('role') === 'tab') return cursor
        } else if (cursor.hasAttribute(attribute)) return cursor
        cursor = cursor.parent
      }
      return null
    },
  }
  return node
}
const fakeDoc = () => ({ createElement: (tag: string) => el(tag), createTextNode: (text: string) => ({ text }), querySelectorAll: () => [] as FakeEl[] })

/** 把一个假件的所有 DOM 写动作记进 log（包装原实现，行为不变）。 */
function instrument(node: FakeEl, log: string[]): void {
  const setAttribute = node.setAttribute.bind(node)
  node.setAttribute = (name, value) => { log.push(`set ${name}=${value}`); setAttribute(name, value) }
  const removeAttribute = node.removeAttribute.bind(node)
  node.removeAttribute = name => { log.push(`removeAttribute ${name}`); removeAttribute(name) }
  const replaceChildren = node.replaceChildren.bind(node)
  node.replaceChildren = () => { log.push('replaceChildren'); replaceChildren() }
  const insertBefore = node.insertBefore.bind(node)
  node.insertBefore = (child, before) => { log.push('insertBefore'); insertBefore(child, before) }
  const append = node.append.bind(node)
  node.append = child => { log.push('append'); append(child) }
  const remove = node.remove.bind(node)
  node.remove = () => { log.push('remove'); remove() }
}

/** 连同既有子树一起埋点；此后 doc 新建的节点由 instrumentingDoc 负责埋点。 */
function instrumentTree(node: FakeEl, log: string[]): void {
  instrument(node, log)
  for (const child of node.children) instrumentTree(child, log)
}

/** createElement 出的每个节点都埋点的 doc：护栏测试用。 */
function instrumentingDoc(log: string[]): ReturnType<typeof fakeDoc> {
  const doc = fakeDoc()
  return { ...doc, createElement: (tag: string) => { const node = el(tag); instrument(node, log); return node } }
}

/** 记录动作的假处理器。 */
function handlers(snapshot: (sessionId: string) => ToolsRowSnapshot): { value: ToolsRowHandlers; actions: string[] } {
  const actions: string[] = []
  const value: ToolsRowHandlers = {
    snapshot,
    activateChat: id => { actions.push(`chat:${id}`) },
    selectTab: (id, tabId) => { actions.push(`select:${id}:${tabId}`) },
    openKind: (id, kind) => { actions.push(`kind:${id}:${kind}`) },
    closeTab: (id, tabId) => { actions.push(`close:${id}:${tabId}`) },
    subscribe: () => () => {},
    labels: { chat: '对话', kinds: { files: '文件', browser: '浏览器', terminal: '终端' } },
  }
  return { value, actions }
}

/** 会话内容根：宿主标签行可给可不给。 */
const content = (sessionId: string, withHostRow: boolean): FakeEl => {
  const root = el('div', { 'data-conversation-content': '', 'data-conversation-session': sessionId })
  if (withHostRow) root.append(el('div', { 'data-conversation-tabs': '' }))
  return root
}

const snapshotOf = (tabs: ToolsRowSnapshot['tabs'], active?: string): ToolsRowSnapshot => ({ active, tabs })

describe('syncSessionToolsRow（同步）', () => {
  it('宿主行在场：标签组补挂进宿主行，宿主行不缺少话标签', () => {
    const root = content('s1', true)
    const h = handlers(() => snapshotOf([{ id: 't1', kind: 'local', title: 'a.md' }], 't1'))
    const row = syncSessionToolsRow(root, fakeDoc(), h.value, {})
    expect(row).not.toBeUndefined()
    expect(root.querySelector(`[${ROW_ATTR}]`)).toBeNull()
    const group = root.querySelector(`[${GROUP_ATTR}]`)
    expect(group).not.toBeNull()
    expect(row!.getAttribute(LIVE_ATTR)).toBe('')
    // 三个工具入口已是宿主会话视图，这里只剩一个文件标签（+ 一枚关闭钮）。
    const tabs = group!.querySelectorAll(`[${TAB_ATTR}]`)
    expect(tabs).toHaveLength(1)
    expect(group!.querySelectorAll(`[${TAB_CLOSE_ATTR}]`)).toHaveLength(1)
  })

  it('宿主行缺席：自建行不再画「会话」标签（宿主那一行自带「对话」）', () => {
    const root = content('s1', false)
    const h = handlers(() => snapshotOf([{ id: 't1', kind: 'files', title: '工作区文件' }], 't1'))
    const row = syncSessionToolsRow(root, fakeDoc(), h.value, {})
    expect(row!.hasAttribute(ROW_ATTR)).toBe(true)
    expect(row!.querySelector('[data-chat-tools-chat-button]')).toBeNull()
    expect(row!.getAttribute(LIVE_ATTR)).toBe('')
  })

  it('回到对话：激活标记摘除，自建行对话标签恢复高亮', () => {
    const root = content('s1', false)
    const h = handlers(() => snapshotOf([{ id: 't1', kind: 'local', title: 'a.md' }], undefined))
    const row = syncSessionToolsRow(root, fakeDoc(), h.value, {})
    expect(row!.hasAttribute(LIVE_ATTR)).toBe(false)
  })

  it('同步是全量重画：两次同步不叠出两份标签', () => {
    const root = content('s1', true)
    const h = handlers(() => snapshotOf([{ id: 't1', kind: 'local', title: 'a.md' }], undefined))
    syncSessionToolsRow(root, fakeDoc(), h.value, {})
    syncSessionToolsRow(root, fakeDoc(), h.value, {})
    const group = root.querySelector(`[${GROUP_ATTR}]`)
    expect(group!.querySelectorAll(`[${TAB_ATTR}]`)).toHaveLength(1)
  })
})

describe('自反馈护栏（2026-11-07 一核空转现场）', () => {
  const localTab = (id: string, title: string) => ({ id, kind: 'local' as const, title })

  it('快照未变的重复同步：一个 DOM 写都不做——写就是变异，变异会喂给自己的观察者', () => {
    const log: string[] = []
    const root = content('s1', true)
    instrumentTree(root, log)
    const doc = instrumentingDoc(log)
    const h = handlers(() => snapshotOf([localTab('t1', 'a.md')], undefined))
    syncSessionToolsRow(root, doc, h.value, {})
    expect(log.length).toBeGreaterThan(0) // 首次同步确实画了
    log.length = 0
    syncSessionToolsRow(root, doc, h.value, {})
    expect(log).toEqual([])
  })

  it('快照真的变了：照常重画，护栏不误伤正常同步', () => {
    let snap = snapshotOf([localTab('t1', 'a.md')], undefined)
    const log: string[] = []
    const root = content('s1', true)
    instrumentTree(root, log)
    const doc = instrumentingDoc(log)
    const h = handlers(() => snap)
    syncSessionToolsRow(root, doc, h.value, {})
    log.length = 0
    snap = snapshotOf([localTab('t1', 'a.md'), localTab('t2', 'b.md')], 't2')
    syncSessionToolsRow(root, doc, h.value, {})
    expect(log.length).toBeGreaterThan(0)
    expect(root.querySelectorAll(`[${TAB_ATTR}]`)).toHaveLength(2) // 只剩文件标签（工具入口是宿主视图）
    expect(root.querySelectorAll(`[${TAB_CLOSE_ATTR}]`)).toHaveLength(2)
  })
})

describe('handleToolsRowClick（点击路由）', () => {
  const build = (): { root: FakeEl; group: FakeEl; actions: string[]; value: ToolsRowHandlers } => {
    const root = content('s1', true)
    const h = handlers(() => snapshotOf([
      { id: 't1', kind: 'local', title: 'a.md' },
      { id: 't2', kind: 'browser', title: '浏览器' },
    ], 't1'))
    const row = syncSessionToolsRow(root, fakeDoc(), h.value, {})
    const group = row!.querySelector(`[${GROUP_ATTR}]`) as FakeEl
    return { root, group, actions: h.actions, value: h.value }
  }

  it('点文件标签 → selectTab', () => {
    const { group, actions, value } = build()
    const tab = group.querySelectorAll(`[${TAB_ID_ATTR}]`)[0]!
    const event = { target: tab, preventDefault: () => {}, stopPropagation: () => {} }
    expect(handleToolsRowClick(event as never, value)).toBe(true)
    expect(actions).toEqual(['select:s1:t1'])
  })

  it('点关闭钮 → closeTab（文件标签走丢弃草稿的关闭）', () => {
    const { group, actions, value } = build()
    const close = group.querySelectorAll(`[${TAB_CLOSE_ATTR}]`)[0]!
    handleToolsRowClick({ target: close, preventDefault: () => {}, stopPropagation: () => {} } as never, value)
    expect(actions).toEqual(['close:s1:t1'])
  })

  it('工具入口不再由我们画（交给宿主会话视图那一行）', () => {
    const { group } = build()
    expect(group.querySelectorAll(`[${TAB_KIND_ATTR}]`)).toHaveLength(0)
  })

  it('工具激活时点宿主标签 → 先回对话，不吞事件', () => {
    const { root, actions, value } = build()
    const hostRow = root.querySelector('[data-conversation-tabs]')!
    const hostTab = el('button', { role: 'tab' })
    hostRow.append(hostTab)
    const stopped = { stopped: false }
    const handled = handleToolsRowClick({ target: hostTab, preventDefault: () => {}, stopPropagation: () => { stopped.stopped = true } } as never, value)
    expect(handled).toBe(false)
    expect(stopped.stopped).toBe(false)
    expect(actions).toEqual(['chat:s1'])
  })

  it('工具激活时点 header 里的宿主视图标签（对话/轨迹/提示词，在 header、与 content 是兄弟）→ 回对话并放行', () => {
    // 真实结构：宿主视图标签行在 header 里，content 是 header 的兄弟、不在其中。
    // 早先 `closest('[data-conversation-content]')` 对 header 里的点击返回 null，
    // 于是 sessionId 取不到、直接 return，点对话/轨迹/提示词都不 activateChat。
    const root = el('div')
    const header = el('header')
    const tabs = el('div', { 'data-conversation-tabs': '' })
    const hostTab = el('button', { role: 'tab' })
    tabs.append(hostTab)
    header.append(tabs)
    root.append(header)
    root.append(el('div', { 'data-conversation-content': '', 'data-conversation-session': 's1' }))
    const h = handlers(() => snapshotOf([{ id: 't1', kind: 'files', title: '工作区文件' }], 't1'))
    const stopped = { stopped: false }
    const handled = handleToolsRowClick({ target: hostTab, preventDefault: () => {}, stopPropagation: () => { stopped.stopped = true } } as never, h.value)
    expect(handled).toBe(false)
    expect(stopped.stopped).toBe(false)
    expect(h.actions).toEqual(['chat:s1'])
  })
})

describe('工具标签行的按钮样式', () => {
  it('我们不再自己画「会话」标签', () => {
    const source = readFileSync(new URL('../src/tools-tabs.ts', import.meta.url), 'utf8')
    expect(source).not.toContain("setAttribute('data-chat-tools-chat-button'")
  })
  it('四个标签统一成按钮样式，选中的变色', () => {
    const css = readFileSync(new URL('../src/conversation-tools.module.css', import.meta.url), 'utf8')
    expect(css).toContain('[data-chat-tools-chat-button]')
    expect(css).toContain("[data-chat-tools-tab][aria-selected=true]")
  })
})

describe('工具注册成宿主会话视图', () => {
  it('三个工具注册进 conversation.view 座位，id 带包名前缀（不与别的插件撞名）', () => {
    const source = readFileSync(new URL('../src/tool-views.tsx', import.meta.url), 'utf8')
    expect(source).toContain('conversation.view')
    expect(source).toContain('chat-power-files')
    expect(source).toContain('chat-power-browser')
    expect(source).toContain('chat-power-terminal')
    const tools = readFileSync(new URL('../src/conversation-tools.tsx', import.meta.url), 'utf8')
    expect(tools).toContain('registerToolViews')
  })
  it('我们不再自己画那三个入口（宿主那一行统一画）', () => {
    const source = readFileSync(new URL('../src/tools-tabs.ts', import.meta.url), 'utf8')
    const body = source.slice(source.indexOf('group.replaceChildren()'), source.indexOf('group.replaceChildren()') + 600)
    expect(body).not.toContain('for (const kind of [')
  })
})
