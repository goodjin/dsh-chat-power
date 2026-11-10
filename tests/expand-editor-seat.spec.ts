/**
 * 展开大编辑区的座位注册：进 composer 的 overlay 列座位，与本机文件卡共存。
 *
 * 与本机文件卡同一条座位（`conversation.input.overlay`），但用**自己的 id**、
 * 不占别人的格子；注册失败也不拖垮其它表面。
 */
import { describe, expect, it } from 'vitest'
import { EXPAND_EDITOR_ID, registerExpandEditor } from '../src/expand-editor.tsx'
import type { MarkdownTurnReaders } from '../src/markdown-turn-sources.ts'
import { registerConversationSurfaces } from '../src/conversation-surfaces.tsx'

const readers = {
  sendToSession: () => Promise.resolve(),
} as unknown as MarkdownTurnReaders
const t = ((k: string) => k) as never

function fakeSlots() {
  const registered: { name: string; options: Record<string, unknown> }[] = []
  const slots = {
    entries: (key: string) => key === 'conversation.chat.node'
      ? [{ options: { key: 'assistant-step', priority: 0 }, component: () => null }]
      : [],
    subscribe: (_key: string, fn: () => void) => { fn(); return () => {} },
    inject: (key: string, callback: () => unknown) => { callback(); return () => {} },
    register: (options: Record<string, unknown>, _component: unknown) => {
      registered.push({ name: options.name as string, options })
      return () => {}
    },
  }
  return { slots, registered }
}

function makeCtx(slots: unknown) {
  return {
    slots,
    get: () => undefined,
    effect: (cb: () => unknown) => { cb(); return () => {} },
  }
}

describe('展开大编辑区座位注册', () => {
  it('注册进 overlay 列座位，用自己的 id', () => {
    const { slots, registered } = fakeSlots()
    const dispose = registerExpandEditor(slots as Parameters<typeof registerExpandEditor>[0], { readers, t })
    const entry = registered.find(r => r.name === 'conversation.input.overlay')
    expect(entry?.options.id).toBe(EXPAND_EDITOR_ID)
    expect(typeof dispose).toBe('function')
  })

  it('本机文件卡与展开区可同注册进 overlay（list 列座位不冲突）', () => {
    const { slots, registered } = fakeSlots()
    registerExpandEditor(slots as Parameters<typeof registerExpandEditor>[0], { readers, t })
    const overlayEntries = registered.filter(r => r.name === 'conversation.input.overlay')
    expect(overlayEntries.length).toBe(1)
    expect(overlayEntries[0]?.options.id).toBe(EXPAND_EDITOR_ID)
    // 另一个表面的注册不受本座位影响。
    registerConversationSurfaces(makeCtx(slots) as Parameters<typeof registerConversationSurfaces>[0])
    const wrap = registered.find(r => r.options.key === 'assistant-step')
    expect(wrap, '答案卡片 wrap 必须安装').toBeDefined()
  })
})
