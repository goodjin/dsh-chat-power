/**
 * 钉住一个跨插件座位契约：chat-power 重注册 `assistant-step` 时必须**声明**
 * ACP 段渲染器座位 `conversation.chat.node.acp-segment-renderer`。
 *
 * 为什么这条测试重要：acp-agent 用 `slots.inject(该座位, …)` 把 `AcpProcessBlock`
 * 注册进来，而 DSH 的插槽契约是「未声明的座位，inject 回调永不触发、register 会抛」
 * （见 dsh-client-ui-slots 的 register 实现）。座位没人声明 → acp-agent 的注册静默不
 * 发生 → wrap 取不到渲染器 → ACP 进程段退回原生纯文本。这是迁移引入的 P0 退化，本测试
 * 防止它再次回归（比如有人重写了 attachRenderer 却漏了 children 声明）。
 */

import { describe, expect, it } from 'vitest'
import { registerConversationSurfaces, SEGMENT_RENDERER_SLOT } from '../src/conversation-surfaces.tsx'

/** 建模 wrap 需要的最小座位面：喂原生 assistant-step / tool-call / turn-error 渲染器，记住所有 register 的 options。 */
function fakeSlots() {
  const registered: Record<string, unknown>[] = []
  const slots = {
    entries: (key: string) => key === 'conversation.chat.node'
      ? [
          { options: { key: 'assistant-step', priority: 0 }, component: () => null },
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
  it('重注册 assistant-step 时声明 ACP 段渲染器座位（否则 acp-agent 的 inject 永不触发）', () => {
    const { slots, registered } = fakeSlots()
    const ctx = {
      slots,
      get: () => undefined,
      effect: (cb: () => unknown) => { cb(); return () => {} },
    }
    registerConversationSurfaces(ctx as Parameters<typeof registerConversationSurfaces>[0])

    const wrapRegister = registered.find(options => options.key === 'assistant-step')
    expect(wrapRegister, '应重注册 assistant-step wrap').toBeDefined()
    const children = (wrapRegister?.children ?? {}) as Record<string, unknown>
    expect(children[SEGMENT_RENDERER_SLOT], `应声明座位 ${SEGMENT_RENDERER_SLOT}`).toEqual({
      kind: 'list',
      scope: 'session',
    })
  })

  it('座位名与 acp-agent 侧的字面量一致（跨包不能共享常量，这里钉住契约）', () => {
    // acp-agent 的 acp-process-surface.tsx 里写死了同一个座位名。任一边改名而另一边
    // 没跟上，ACP 段就会静默退回原生——这条断言让「改名的那一边」至少在 chat-power 这侧
    // 有据可查（acp-agent 侧的同款字面量靠人工对齐）。
    expect(SEGMENT_RENDERER_SLOT).toBe('conversation.chat.node.acp-segment-renderer')
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
