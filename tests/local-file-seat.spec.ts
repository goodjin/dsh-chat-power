/**
 * 本机文件卡的座位选择，与答案卡片 wrap 的存活。
 *
 * 2026-11-04 现场：本机文件卡注册进 `conversation.input.attachments`（**single**
 * 槽位），而宿主自己的附件区已经占了这个槽位的 priority 0——重复注册同一优先级
 * 直接抛错，`registerConversationSurfaces` 随之中止，**答案卡片 wrap 没能注册**。
 * 界面表现：答案没有框、没有编辑按钮，本机文件卡也没有——而且没有任何页面报错
 * （失败只进了宿主 logger）。
 *
 * 两条防线，这里都钉住：
 * 1. 本机文件卡住进 **list 槽位** `conversation.input.overlay`（可与宿主附件共存）；
 * 2. 各表面注册相互隔离——本机文件卡即使注册失败，也不拖垮答案卡片 wrap。
 */

import { describe, expect, it } from 'vitest'
import { LOCAL_FILE_ID } from '../src/local-file.tsx'
import { registerConversationSurfaces } from '../src/conversation-surfaces.tsx'

/**
 * 模拟宿主：'conversation.input.attachments' 是 **single** 槽位且已被宿主附件区
 * 占住 priority 0（重复注册同优先级直接抛错）；'conversation.chat.node' 是遮蔽
 * 槽位——同 key 不同优先级共存，最低者渲染。
 */
function fakeSlots() {
  const registered: { name: string; options: Record<string, unknown> }[] = []
  const singleOccupied = new Set<string>(['conversation.input.attachments@0'])
  const slots = {
    entries: (key: string) => key === 'conversation.chat.node'
      ? [
          { options: { key: 'assistant-step', priority: 0 }, component: () => null },
          { options: { key: 'turn-error', priority: 0 }, component: () => null },
        ]
      : [],
    subscribe: (_key: string, fn: () => void) => { fn(); return () => {} },
    inject: (key: string, callback: () => unknown) => { callback(); return () => {} },
    register: (options: Record<string, unknown>, _component: unknown) => {
      if (options.name === 'conversation.input.attachments') {
        const priority = (options.priority as number | undefined) ?? 0
        const cell = `attachments@${priority}`
        if (singleOccupied.has(cell)) {
          throw new Error(`single slot "${options.name}" already has a registration at priority ${priority} (registered by Kb) — register at a different priority to shadow it (lowest renders)`)
        }
        singleOccupied.add(cell)
      }
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

describe('本机文件卡座位与答案卡片共存', () => {
  it('本机文件卡住进 overlay 列座位，不再抢宿主的 attachments 单席位', () => {
    const { slots, registered } = fakeSlots()
    registerConversationSurfaces(makeCtx(slots) as Parameters<typeof registerConversationSurfaces>[0])
    const seats = registered.map(r => r.name)
    expect(seats).toContain('conversation.input.overlay')
    expect(seats).not.toContain('conversation.input.attachments')
    const overlayEntry = registered.find(r => r.name === 'conversation.input.overlay')
    expect(overlayEntry?.options.id).toBe(LOCAL_FILE_ID)
  })

  it('本机文件卡注册路径失败时，其余表面照常安装（assistant-step 已不接管）', () => {
    const { slots, registered } = fakeSlots()
    const ctx = makeCtx(slots) as Parameters<typeof registerConversationSurfaces>[0]
    ;(slots as { inject: (key: string, cb: () => unknown) => unknown }).inject = (key: string, cb: () => unknown) => {
      if (key === 'conversation.input.overlay') throw new Error('boom')
      cb(); return () => {}
    }
    expect(() => registerConversationSurfaces(ctx)).not.toThrow()
    // assistant-step 原生带子座位，遮蔽 wrap 无法合法渲染——不允许出现它的 wrap。
    expect(registered.find(r => r.options.key === 'assistant-step')).toBeUndefined()
    // 其余节点帧（EXTRA_FRAMES）不受本座位失败影响。
    expect(registered.find(r => r.options.key === 'turn-error')).toBeDefined()
  })
})
