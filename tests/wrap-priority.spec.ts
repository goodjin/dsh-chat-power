/**
 * `assistant-step` 的两层 wrap（本包 -50 / acp-agent -40 兜底）已全部拆除：
 * 原生 AssistantNodeView 声明了子座位，遮蔽 wrap 两条路都死
 * （SlotOwnershipError / already declared，见 conversation-surfaces.tsx 的说明）。
 *
 * 这里钉住「谁都不许再注册 assistant-step wrap」——两包任一侧回归都会把会话流
 * 打挂（2026-11-13 现场）。acp-agent 侧的同款约束在它自己仓库的
 * tests/seat-contract.spec.ts。
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('assistant-step 不再有遮蔽 wrap', () => {
  it('源码不再注册 assistant-step wrap（原生带子座位授权，无法合法遮蔽）', () => {
    const source = readFileSync(new URL('../src/conversation-surfaces.tsx', import.meta.url), 'utf8')
    expect(source).not.toContain("key: NODE_KEY")
    expect(source).not.toContain("key: 'assistant-step'")
  })
})
