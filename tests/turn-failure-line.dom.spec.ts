/**
 * 回合失败行的可见性：回合级失败必须在轨迹里直接可见。
 *
 * 背景（2026-11-17 现场）：回合失败只写进会话文件的 turn/end 事件，界面轨迹
 * 完全不显示——要看失败原因只能翻文件。这个组件把 turn/end 里 kind='error'
 * 的收尾渲染成一行「第 N 轮失败：消息（代码）」，挂在回合尾部的座位上。
 * aborted（用户主动停）不算失败，不渲染。
 */

import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TURN_FAILURE_LINE_ID, TurnFailureLine, registerTurnFailureLine } from '../src/turn-failure-line.tsx'

let root: Root | undefined
function render(turn: unknown) {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(createElement(TurnFailureLine, { turn } as never)))
  return container
}
afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.replaceChildren()
})

/** 造一个带收尾事件的回合（与宿主 timeline 的 turn 候选同形）。 */
function turnWith(reason: unknown, turnNumber = 3) {
  return { turn: turnNumber, end: { data: { reason } } }
}

describe('回合失败行', () => {
  it('error 收尾：渲染「第 N 轮失败」+ 消息 + 代码', () => {
    const container = render(turnWith({ kind: 'error', error: { message: 'fetch failed（模型 gfmodel）', code: 'UNKNOWN' } }))
    expect(container.textContent).toContain('第 3 轮失败')
    expect(container.textContent).toContain('fetch failed（模型 gfmodel）')
    expect(container.textContent).toContain('UNKNOWN')
  })

  it('aborted 收尾：不渲染（用户主动停不算失败）', () => {
    const container = render(turnWith({ kind: 'aborted' }))
    expect(container.textContent).toBe('')
  })

  it('还没有收尾事件：不渲染', () => {
    const container = render({ turn: 5 })
    expect(container.textContent).toBe('')
  })

  it('收尾是完成态（stop）：不渲染', () => {
    const container = render(turnWith({ kind: 'stop' }))
    expect(container.textContent).toBe('')
  })

  it('回合编号缺失：行仍在，编号段省略', () => {
    const container = render({ end: { data: { reason: { kind: 'error', error: { message: '服务器 500', code: 'SERVER' } } } } })
    expect(container.textContent).toContain('失败')
    expect(container.textContent).toContain('服务器 500')
  })

  it('异常数据（end 挂了垃圾对象）：安静降级为不渲染', () => {
    const container = render({ end: 'garbage' })
    expect(container.textContent).toBe('')
  })
})

describe('注册接线', () => {
  it('挂进 conversation.chat.turnTail 座位，独立 id，排在 6 号', () => {
    const register = vi.fn()
    const inject = vi.fn((_key: string, callback: () => void) => callback())
    registerTurnFailureLine({ register, inject } as never)
    expect(inject).toHaveBeenCalledWith('conversation.chat.turnTail', expect.any(Function))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ name: 'conversation.chat.turnTail', id: TURN_FAILURE_LINE_ID, order: 6 }), expect.anything())
  })
})
