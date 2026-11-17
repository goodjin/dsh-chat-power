/**
 * 文件树行控件：给渲染出来的文件行补上勾选框与编辑钮。
 *
 * 宿主 0.2.2 起不能再「把宿主面板包一层再重注册」——子座位只能声明一次，
 * 外层包会当场撞名，文件面板整块起不来。于是改成在**渲染出来的目录树上
 * 直接补控件**：只看会话区工具区里的行，宿主右侧栏的文件树不受影响。
 *
 * 最小假 DOM 仅验证控件状态与点击路由；嵌套结构与监听收敛由真实 DOM 测试覆盖。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  decorateRow,
  filesRowPath,
  handleRowControl,
  hasHistoryForPhase,
  syncRowChecks,
  type AugmentHandlers,
} from '../src/file-tree-augment.tsx'

/** 最小假元素：够跑补控件与点击路由，不模拟布局。 */
interface FakeEl {
  tag: string
  attrs: Record<string, string>
  children: FakeEl[]
  parent: FakeEl | null
  checked: boolean
  innerHTML: string
  setAttribute(name: string, value: string): void
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  prepend(node: FakeEl): void
  append(node: FakeEl): void
  after(node: FakeEl): void
  querySelector(selector: string): FakeEl | null
  closest(selector: string): FakeEl | null
}

function el(tag: string, attrs: Record<string, string> = {}): FakeEl {
  const node: FakeEl = {
    tag,
    attrs: { ...attrs },
    children: [],
    parent: null,
    checked: false,
    innerHTML: '',
    setAttribute(name, value) { node.attrs[name] = value },
    getAttribute(name) { return name in node.attrs ? (node.attrs[name] ?? null) : null },
    hasAttribute(name) { return name in node.attrs },
    prepend(child) { child.parent = node; node.children.unshift(child) },
    append(child) { child.parent = node; node.children.push(child) },
    after(child) {
      if (node.parent === null) return
      child.parent = node.parent
      node.parent.children.splice(node.parent.children.indexOf(node) + 1, 0, child)
    },
    querySelector(selector) { const tag = /^([a-z]+)/.exec(selector)?.[1]; return node.children.find(child => child.tag === tag) ?? null },
    closest(selector) {
      // 只支持 `[data-xxx]` 形态的选择器：取属性名往上找。
      const name = /^\[([^\]=]+)\]$/.exec(selector)?.[1]
      if (name === undefined) return null
      let cursor: FakeEl | null = node
      while (cursor !== null) {
        if (cursor.hasAttribute(name)) return cursor
        cursor = cursor.parent
      }
      return null
    },
  }
  return node
}

/** 假 document：只提供 createElement。 */
const fakeDoc = () => ({ createElement: (tag: string) => el(tag) })

/** 记录动作的假处理器。 */
function handlers(checked: (sessionId: string, path: string) => boolean = () => false) {
  const toggles: Array<[string, string, boolean]> = []
  const edits: Array<[string, string]> = []
  const value: AugmentHandlers = {
    checked: (sessionId, path) => checked(sessionId, path),
    onToggle: (sessionId, path, isChecked) => { toggles.push([sessionId, path, isChecked]) },
    onEdit: (sessionId, path) => { edits.push([sessionId, path]) },
  }
  return { value, toggles, edits }
}

/** 造一行文件（宿主渲染出来的行）。 */
const fileRow = (path: string): FakeEl => el('li', { 'data-files-entry': 'file', 'data-files-path': path })

describe('文件行控件的补挂', () => {
  it('多选框放进文件按钮内部，编辑按钮紧跟其后；三者同一行', () => {
    const row = fileRow('docs/a.md')
    const open = el('button')
    row.append(open)
    decorateRow(row as never, 'session-one', handlers().value, fakeDoc() as never)
    expect(open.children[0]!.getAttribute('data-chat-file-check')).toBe('')
    expect(row.children[1]!.getAttribute('data-chat-file-edit')).toBe('')
    expect(row.children[0]).toBe(open)
  })
  it('给一行文件补上勾选框与编辑钮，并带上路径与会话', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    expect(decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)).toBe(true)
    expect(row.children).toHaveLength(2)
    const [check, edit] = row.children
    expect(check!.getAttribute('data-chat-file-check')).toBe('')
    expect(check!.getAttribute('data-chat-file-path')).toBe('docs/a.md')
    expect(check!.getAttribute('data-chat-file-session')).toBe('session-one')
    expect(edit!.getAttribute('data-chat-file-edit')).toBe('')
    expect(edit!.getAttribute('data-chat-file-path')).toBe('docs/a.md')
    expect(edit!.getAttribute('data-chat-file-session')).toBe('session-one')
  })

  it('补过的行不重复补（目录树重绘后不会叠出两层控件）', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    expect(decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)).toBe(true)
    expect(decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)).toBe(false)
    expect(row.children).toHaveLength(2)
  })

  it('没有路径标记的行不补（不是文件行）', () => {
    const row = el('li', { 'data-files-entry': 'directory' })
    const h = handlers()
    expect(decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)).toBe(false)
    expect(row.children).toHaveLength(0)
  })

  it('勾选框的初始状态按会话查勾选集合', () => {
    const row = fileRow('docs/a.md')
    const h = handlers((sessionId, path) => sessionId === 'session-one' && path === 'docs/a.md')
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    expect(row.children[0]!.checked).toBe(true)
    const other = fileRow('docs/a.md')
    decorateRow(other as never, 'session-two', h.value, fakeDoc() as never)
    expect(other.children[0]!.checked).toBe(false)
  })
})

describe('文件行控件的点击路由', () => {
  it('点勾选框：写入或移除引用，并按会话状态回拨', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    const check = row.children[0]!
    check.checked = true
    const stopped = { prevented: false, stopped: false }
    const handled = handleRowControl({
      target: check,
      preventDefault: () => { stopped.prevented = true },
      stopPropagation: () => { stopped.stopped = true },
    } as never, h.value)
    expect(handled).toBe(true)
    expect(h.toggles).toEqual([['session-one', 'docs/a.md', true]])
    // 点勾选框不该连带把文件打开：事件到行上之前就被截住。
    expect(stopped.stopped).toBe(true)
  })

  it('勾选框保留浏览器自己的勾选动作（取消默认行为会把勾选弹回去）', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    const check = row.children[0]!
    check.checked = true
    const stopped = { prevented: false }
    handleRowControl({
      target: check,
      preventDefault: () => { stopped.prevented = true },
      stopPropagation: () => {},
    } as never, h.value)
    expect(stopped.prevented).toBe(false)
  })

  it('点编辑钮：打开该路径的编辑副本', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    const edit = row.children[1]!
    const handled = handleRowControl({
      target: edit,
      preventDefault: () => {},
      stopPropagation: () => {},
    } as never, h.value)
    expect(handled).toBe(true)
    expect(h.edits).toEqual([['session-one', 'docs/a.md']])
  })

  it('点行上的其它地方不归我们管（不吞事件、不触发动作）', () => {
    const row = fileRow('docs/a.md')
    const h = handlers()
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    const other = el('button', {})
    row.append(other)
    const stopped = { stopped: false }
    const handled = handleRowControl({
      target: other,
      preventDefault: () => {},
      stopPropagation: () => { stopped.stopped = true },
    } as never, h.value)
    expect(handled).toBe(false)
    expect(stopped.stopped).toBe(false)
    expect(h.toggles).toEqual([])
    expect(h.edits).toEqual([])
  })
})

describe('勾选状态回同步', () => {
  it('会话状态变化后，已挂的勾选框跟着变', () => {
    const row = fileRow('docs/a.md')
    let checked = false
    const h = handlers(() => checked)
    decorateRow(row as never, 'session-one', h.value, fakeDoc() as never)
    expect(row.children[0]!.checked).toBe(false)
    checked = true
    syncRowChecks(row.children as never, h.value)
    expect(row.children[0]!.checked).toBe(true)
  })
})

describe('文件行判定', () => {
  it('从文件行上读出工作区相对路径', () => {
    const li = { getAttribute: (name: string) => name === 'data-files-path' ? 'src/a.ts' : null }
    expect(filesRowPath(li as never)).toBe('src/a.ts')
  })
  it('没有路径标记的行返回 undefined', () => {
    const li = { getAttribute: () => null }
    expect(filesRowPath(li as never)).toBeUndefined()
  })
})

describe('新会话/旧会话判定', () => {
  it('hero 阶段是没有历史的新会话', () => {
    expect(hasHistoryForPhase('hero')).toBe(false)
  })
  it('active 阶段是有内容的旧会话', () => {
    expect(hasHistoryForPhase('active')).toBe(true)
  })
  it('settling 与未知阶段不判定（返回 undefined，等下一个相位）', () => {
    expect(hasHistoryForPhase('settling')).toBeUndefined()
    expect(hasHistoryForPhase(undefined)).toBeUndefined()
    expect(hasHistoryForPhase(null)).toBeUndefined()
  })
})

describe('文件行样式（多选框、编辑钮与文件名同行，悬停变色加框线）', () => {
  const readCss = (): string => readFileSync(new URL('../src/file-tree-augment.module.css', import.meta.url), 'utf8')
  it('鼠标移过整行变色并显示框线', () => {
    const css = readCss()
    expect(css).toMatch(/li\[data-files-entry="file"\]:hover[^{]*\{[^}]*background/)
    expect(css).toMatch(/li\[data-files-entry="file"\]:hover[^{]*\{[^}]*border/)
  })
  it('多选框在文件按钮内部（选择器按后代匹配），按钮内「多选框 + 文件名」横排', () => {
    const css = readCss()
    expect(css).toMatch(/li\[data-files-entry="file"\] \[data-chat-file-check]/)
    expect(css).not.toMatch(/li\[data-files-entry="file"\] > \[data-chat-file-check]/)
    expect(css).toMatch(/li\[data-files-entry="file"\] > button:first-of-type[^{]*\{[^}]*display:\s*inline-flex/)
  })
  it('编辑按钮是行内元素不悬浮遮字（紧跟文件按钮之后，布局定位而非覆盖）', () => {
    const css = readCss()
    expect(css).not.toMatch(/data-chat-file-edit[^}]*position:\s*absolute/)
  })
})
