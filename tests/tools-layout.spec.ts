/**
 * 工具正文在会话内容里的挂载位与「激活时要收起哪些节点」的判定。
 *
 * 宿主结构（已核对 app.asar 里 dsh-client-ui-conversation 的 ConversationContent）：
 *
 * ```text
 * [data-conversation-content]
 *   [data-chat-tools-row]                ← 我们的标签行（补挂在 content 直属、滚动层之前）
 *   [data-conversation-scroll]           ← 滚动层（flex column）
 *     [data-conversation-views]          ← 宿主对话/轨迹视图（激活工具时要收起）
 *     [data-composer-seat]               ← 输入框（composer，留在下方）
 * ```
 *
 * 过去工具正文挂在 `content` 之前（root 直属、滚动层之上），激活时 `content` 塌缩，
 * 标签行被挤到正文**下方**、输入框之上——空白现场。这里把正文改挂进滚动层、
 * 排在宿主视图之后、composer 之前，使顺序固定为「标签行在上、正文居中、composer 在下」。
 */
import { describe, expect, it } from 'vitest'
import { mountToolBody, toolHiddenNodes, toolMessageNodes } from '../src/tools-layout.ts'

interface FakeEl {
  tag: string
  attrs: Record<string, string>
  children: FakeEl[]
  parent: FakeEl | null
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  append(child: unknown): void
  insertBefore(child: unknown, before: unknown): void
  querySelector(selector: string): FakeEl | null
  remove(): void
}

function el(tag: string, attrs: Record<string, string> = {}): FakeEl {
  const node: FakeEl = {
    tag,
    attrs: { ...attrs },
    children: [],
    parent: null,
    getAttribute(name) { return name in node.attrs ? node.attrs[name] ?? null : null },
    hasAttribute(name) { return name in node.attrs },
    setAttribute(name, value) { node.attrs[name] = value },
    append(child) { (child as FakeEl).parent = node; node.children.push(child as FakeEl) },
    insertBefore(child, before) {
      const c = child as FakeEl
      c.parent = node
      const at = before === null || before === undefined ? -1 : node.children.indexOf(before as FakeEl)
      if (at < 0) node.children.push(c)
      else node.children.splice(at, 0, c)
    },
    querySelector(selector) {
      const attr = /\[([^\]=]+)\]/.exec(selector)?.[1]
      const walk = (cur: FakeEl): FakeEl | null => {
        for (const child of cur.children) {
          if (attr !== undefined && child.hasAttribute(attr)) return child
          const found = walk(child)
          if (found !== null) return found
        }
        return null
      }
      return walk(node)
    },
    remove() {
      const p = node.parent
      if (p !== null) { const at = p.children.indexOf(node); if (at >= 0) p.children.splice(at, 1) }
      node.parent = null
    },
  }
  return node
}

/** 一份会话内容：标签行 + 滚动层（视图 + composer）。 */
function sessionContent(withComposer = true): FakeEl {
  const content = el('div', { 'data-conversation-content': '', 'data-conversation-session': 's1' })
  content.append(el('div', { 'data-chat-tools-row': '' }))
  const scroll = el('div', { 'data-conversation-scroll': '' })
  content.append(scroll)
  scroll.append(el('div', { 'data-conversation-views': '' }))
  if (withComposer) scroll.append(el('div', { 'data-composer-seat': '' }))
  return content
}

const isMount = (node: FakeEl): boolean => node.getAttribute('data-chat-tools-mount') !== null

describe('mountToolBody（工具正文挂载位）', () => {
  it('挂在滚动层里、宿主视图之后、composer 之前', () => {
    const content = sessionContent()
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const scroll = content.querySelector('[data-conversation-scroll]')!
    expect(scroll.children.map(isMount)).toEqual([false, true, false])
    const composer = scroll.querySelector('[data-composer-seat]')!
    expect(scroll.children.indexOf(body)).toBeLessThan(scroll.children.indexOf(composer))
  })

  it('标签行（content 直属）在滚动层之前，正文在滚动层之内——整体仍是「标签在上、正文居中」', () => {
    const content = sessionContent()
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const row = content.querySelector('[data-chat-tools-row]')!
    const scroll = content.querySelector('[data-conversation-scroll]')!
    expect(content.children.indexOf(row)).toBeLessThan(content.children.indexOf(scroll))
  })

  it('无 composer 时兜底挂进滚动层末尾', () => {
    const content = sessionContent(false)
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const scroll = content.querySelector('[data-conversation-scroll]')!
    expect(scroll.children[scroll.children.length - 1]).toBe(body)
  })

  it('无滚动层时兜底挂进会话内容', () => {
    const content = el('div', { 'data-conversation-content': '' })
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    expect(content.children[content.children.length - 1]).toBe(body)
  })
})

describe('toolMessageNodes（工具激活时要收起的节点）', () => {
  it('只含宿主视图，不含工具正文与 composer', () => {
    const content = sessionContent()
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const scroll = content.querySelector('[data-conversation-scroll]')!
    const composer = scroll.querySelector('[data-composer-seat]')!
    const messages = toolMessageNodes(scroll, body)
    expect(messages).toHaveLength(1)
    expect(messages[0]!.getAttribute('data-conversation-views')).toBe('')
    expect(messages).not.toContain(body)
    expect(messages).not.toContain(composer)
  })
})

describe('toolHiddenNodes（工具→对话/轨迹切换要能恢复）', () => {
  it('工具标签激活：收起宿主视图（露出工具正文）', () => {
    const content = sessionContent()
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const scroll = content.querySelector('[data-conversation-scroll]')!
    expect(toolHiddenNodes(scroll, body, true)).toHaveLength(1)
  })
  it('回到对话 / 轨迹（工具标签激活取消）：不收起任何节点——宿主视图就此恢复', () => {
    const content = sessionContent()
    const body = el('div', { 'data-chat-tools-mount': '' })
    mountToolBody(content, body)
    const scroll = content.querySelector('[data-conversation-scroll]')!
    expect(toolHiddenNodes(scroll, body, false)).toEqual([])
  })
})
