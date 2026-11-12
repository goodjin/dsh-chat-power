/**
 * 钉住会话区节点接管契约：**不接管原生声明了子座位的节点**。
 *
 * 宿主（dsh-client-ui-renderer 的 boundRenderSlot）对 renderSlot 逐 key 校验
 * 「本条目 children 表」：遮蔽 wrap 没声明的座位名，原生一调用就抛
 * SlotOwnershipError，错误边界把整棵会话流卸掉。而转发原生 children 又会在
 * register 时抛 "slot ... is already declared"（子座位单一存活 owner 契约）。
 * 两条路都死——这样的格子只能留给原生渲染。
 *
 * assistant-step：原生 AssistantNodeView 声明了 conversation.chat.reasoning.body
 * 与 conversation.chat.message.images 两个子座位（展开思考、答案图片都要走），
 * 2026-11-13 确认无法合法遮蔽，故本包不再注册 assistant-step wrap。
 */

import { describe, expect, it } from 'vitest'
import { registerConversationSurfaces } from '../src/conversation-surfaces.tsx'

/** 建模 wrap 需要的最小座位面：喂原生 assistant-step / tool-call / turn-error 渲染器，记住所有 register 的 options。 */
function fakeSlots() {
  const registered: Record<string, unknown>[] = []
  const slots = {
    entries: (key: string) => key === 'conversation.chat.node'
      ? [
          {
            options: { key: 'assistant-step', priority: 0 },
            children: {
              'conversation.chat.reasoning.body': { kind: 'single', scope: 'session' },
              'conversation.chat.message.images': { kind: 'single', scope: 'session' },
            },
            component: () => null,
          },
          {
            options: { key: 'tool-call', priority: 0 },
            children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
            component: () => null,
          },
          { options: { key: 'turn-error', priority: 0 }, component: () => null },
        ]
      : [],
    subscribe: (_key: string, fn: () => void) => { fn(); return () => {} },
    register: (options: Record<string, unknown>, _component: unknown) => { registered.push(options); return () => {} },
    inject: (_key: string, _callback: () => unknown) => undefined,
  }
  return { slots, registered } as const
}

describe('conversation surfaces', () => {
  // 原生 assistant-step 声明了 reasoning.body + message.images 两个子座位。遮蔽 wrap
  // 两条路都死（SlotOwnershipError / already declared），只能留给原生——答案卡片与
  // 思考帧不再经由 assistant-step wrap 挂载（2026-11-13 与 tool-call 同批确认）。
  it('不接管 assistant-step（原生带子座位授权，遮蔽 wrap 无法合法渲染）', () => {
    const { slots, registered } = fakeSlots()
    const ctx = {
      slots,
      get: () => undefined,
      effect: (cb: () => unknown) => { cb(); return () => {} },
    }
    registerConversationSurfaces(ctx as Parameters<typeof registerConversationSurfaces>[0])

    const wrapRegister = registered.find(options => options.key === 'assistant-step')
    expect(wrapRegister, '不应注册 assistant-step wrap，留给原生 AssistantNodeView').toBeUndefined()
  })

  // 原生 tool-call 声明了子座位 tool.call.toolview。宿主「子座位单一所有者」契约下，
  // 遮蔽 wrap 既不能再声明该座位（register 抛 "already declared"），也不能不带 children
  // 接管（原生 ToolCallTree 拿不到 renderSlot，一渲染就 TypeError 把整棵会话流卸掉，
  // 2026-11-13 现场：149 个工具行全崩）。两条路都死，故这一格必须留给原生。
  it('不接管 tool-call（原生自带子座位授权，遮蔽 wrap 无法合法渲染）', () => {
    const { slots, registered } = fakeSlots()
    const ctx = { slots, get: () => undefined, effect: (cb: () => unknown) => { cb(); return () => {} } }
    registerConversationSurfaces(ctx as Parameters<typeof registerConversationSurfaces>[0])

    const wrapRegister = registered.find(options => options.key === 'tool-call')
    expect(wrapRegister, '不应注册 tool-call wrap，留给原生 ToolCallTree').toBeUndefined()
  })

  it('仍接管其余节点帧（EXTRA_FRAMES，原生无子座位）——如 turn-error', () => {
    const { slots, registered } = fakeSlots()
    const ctx = { slots, get: () => undefined, effect: (cb: () => unknown) => { cb(); return () => {} } }
    registerConversationSurfaces(ctx as Parameters<typeof registerConversationSurfaces>[0])

    const wrapRegister = registered.find(options => options.key === 'turn-error')
    expect(wrapRegister, '应重注册 turn-error wrap').toBeDefined()
    expect(wrapRegister?.children, '原生无子座位，wrap 不应凭空声明 children').toBeUndefined()
  })
})
