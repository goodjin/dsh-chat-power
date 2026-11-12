/**
 * 会话 ID 条的注册面与接线。
 *
 * 被测的是**活实现**（`src/session-id-bar/index.ts`，从 threadharbor 迁来的那份）。
 * 这里曾经测的是另一份孤儿实现：产物换成活实现后，那个文件只在测死代码，属于假绿。
 *
 * 能测到哪一层、为什么：注册错插槽不会报错，只是那一格永远不出现；注册项的 id
 * 与产物字面量对不上时，`tests/bundle.spec.ts` 会红。组件内部（hooks / 剪贴板）
 * 需要 React 渲染器，本仓库没有 react-dom，故只钉接线：插槽、id、locale、inject、
 * 以及包装层把 `sessionId` 原样交给真组件、拿不到时返回 null。
 */

import { describe, expect, it } from 'vitest'
import type { ReactElement } from 'react'
import { PANEL_ID, SessionIdBar, copyViaClipboard, registerSessionIdBar, shortId, textOf } from '../src/session-id-bar/index.ts'
import { NAMESPACE } from '../src/locales.ts'

/** 会话头部工具行这个插槽名（DSH 的 ui-conversation 声明，会话作用域）。 */
const SLOT = 'conversation.session.header.utilities'

type RegisteredProps = { readonly sessionId?: string; readonly t?: (key: string) => string }

/** 只实现注册面，把调用记下来。 */
function fakeSlots(): {
  calls: string[]
  options?: Record<string, unknown>
  component?: unknown
  slots: {
    inject(key: string, callback: () => unknown): unknown
    register(options: Record<string, unknown>, component: unknown): () => void
  }
} {
  const state = {
    calls: [] as string[],
    options: undefined as Record<string, unknown> | undefined,
    component: undefined as unknown,
    slots: {
      inject(key: string, callback: () => unknown): unknown {
        state.calls.push(`inject:${key}`)
        return callback()
      },
      register(options: Record<string, unknown>, component: unknown): () => void {
        state.calls.push('register')
        state.options = options
        state.component = component
        return () => {}
      },
    },
  }
  return state
}

describe('短会话 ID', () => {
  it('去掉 session- 前缀并截到 8 位', () => {
    expect(shortId('session-044d3f5e-cbc2-42c6-bfbc-3300b157b639')).toBe('044d3f5e')
    expect(shortId('abc')).toBe('abc')
  })
})

describe('注册进会话头部的工具行', () => {
  it('插槽名、注册项 id 与 locale 都对得上，并且自带 inject 面', () => {
    const fake = fakeSlots()
    registerSessionIdBar(fake.slots)
    expect(fake.calls).toEqual([`inject:${SLOT}`, 'register'])
    expect(fake.options?.name).toBe(SLOT)
    expect(fake.options?.id).toBe(PANEL_ID)
    expect(fake.options?.locale).toBe(NAMESPACE)
    expect(typeof fake.options?.inject).toBe('function')
  })

  it('注册表里交出去的是组件，不是普通对象', () => {
    const fake = fakeSlots()
    registerSessionIdBar(fake.slots)
    expect(typeof fake.component).toBe('function')
  })

  it('包装层把 sessionId 原样交给真正的组件', () => {
    const fake = fakeSlots()
    registerSessionIdBar(fake.slots)
    const registered = fake.component as (props: RegisteredProps) => ReactElement | null
    const element = registered({ sessionId: 'session-044d3f5e-cbc2', t: (key: string) => key })
    expect(element?.type).toBe(SessionIdBar)
    expect((element?.props as RegisteredProps).sessionId).toBe('session-044d3f5e-cbc2')
  })

  it('拿不到 sessionId 时返回 null，不在会话头部抛错', () => {
    const fake = fakeSlots()
    registerSessionIdBar(fake.slots)
    const registered = fake.component as (props: RegisteredProps) => ReactElement | null
    expect(registered({})).toBeNull()
    expect(registered({ sessionId: '' })).toBeNull()
  })

  it('inject 面把座位给的 sessionId 透出来（框架按会话作用域传参）', () => {
    const fake = fakeSlots()
    registerSessionIdBar(fake.slots)
    const inject = fake.options?.inject as (sessionId: string) => Record<string, unknown>
    expect(inject('session-abc')).toEqual({ sessionId: 'session-abc' })
  })
})

describe('词条解析：框架 t 解不出来时不画键名', () => {
  it('t 返回键名本身时退回本地词典', () => {
    const echo = (key: string): string => key
    expect(textOf(echo, 'panel.sessionBar.copy')).toBe('复制')
    expect(textOf(echo, 'panel.sessionBar.copied')).toBe('已复制')
  })

  it('t 能给出译文时用译文', () => {
    const known = (key: string): string => (key === 'panel.sessionBar.copy' ? 'Copy' : key)
    expect(textOf(known, 'panel.sessionBar.copy')).toBe('Copy')
  })
})

describe('复制链路（统一发送链路的复制侧）', () => {
  it('剪贴板可用：写入完整 ID，返回 copied', async () => {
    const writes: string[] = []
    const result = await copyViaClipboard({ writeText: async (text: string) => { writes.push(text) } }, 'session-abc')
    expect(result).toBe('copied')
    expect(writes).toEqual(['session-abc'])
  })
  it('剪贴板拒绝：返回失败与原因，组件据此提示', async () => {
    const result = await copyViaClipboard({ writeText: async () => { throw new Error('denied') } }, 'session-abc')
    expect(result).toEqual({ failed: 'denied' })
  })
  it('剪贴板缺失：返回 unavailable，而不是抛 TypeError', async () => {
    await expect(copyViaClipboard(undefined, 'session-abc')).resolves.toBe('unavailable')
  })
})