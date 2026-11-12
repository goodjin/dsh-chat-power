import { describe, expect, it } from 'vitest'
import { registerConversationTools } from '../src/conversation-tools.tsx'
describe('共享浏览器插槽接线', () => {
  it('共享浏览器和会话工具区各自声明唯一的正文槽位', () => {
    const registrations: any[] = []
    const owners = new Map<string, string>()
    const ctx: any = {
      get: () => undefined,
      effect: () => {},
      inject: (_: unknown, callback: any) => callback(ctx),
      slots: {
        inject: (_: unknown, callback: any) => callback(),
        register: (options: any) => {
          for (const child of Object.keys(options.children ?? {})) {
            if (owners.has(child)) throw new Error(`duplicate slot ${child}`)
            owners.set(child, options.name)
          }
          registrations.push(options); return () => {}
        },
      },
    }
    registerConversationTools(ctx)
    expect(owners.get('chat-power.tools.pane.tab')).toBe('chat-power.tools')
    expect(owners.get('chat-power.browser.pane.tab')).toBe('chat-power.browser-workspace')
    expect(registrations.some(r => r.name === 'chat-power.browser-workspace')).toBe(true)
  })
})
