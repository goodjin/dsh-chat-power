/** New sessions inherit workspace membership; ungrouped sources retain their cwd. */

import { describe, expect, it } from 'vitest'
import { createMarkdownTurnReaders } from '../src/markdown-turn-sources.ts'
import type { MarkdownTurnReaders } from '../src/markdown-turn-sources.ts'

/** 假 remote：session.list / session.create，create 的参数被记下来。 */
function fakeRemote(options: {
  summaries?: { sessionId: string; cwd?: string }[]
  /** list 返回形状：'envelope'（宿主真实，{items}）| 'array'（兼容旧形状）。 */
  shape?: 'envelope' | 'array'
  workspaces?: { workspaceId: string; sessionIds: string[] }[]
  workspaceError?: Error
  createError?: Error
} = {}) {
  const createCalls: unknown[] = []
  const remote = {
    workspace: {
      async *follow() {
        if (options.workspaceError) throw options.workspaceError
        yield { type: 'baseline', value: { items: options.workspaces ?? [] } }
      },
    },
    session: {
      async list() {
        const summaries = options.summaries ?? []
        return options.shape === 'array' ? summaries : { items: summaries }
      },
      async create(args: unknown) {
        if (options.createError !== undefined) throw options.createError
        createCalls.push(args)
        return { ok: true, value: { sessionId: 'session-new' } }
      },
    },
  }
  return { remote, createCalls }
}

function readersOf(remote: unknown): MarkdownTurnReaders {
  return createMarkdownTurnReaders(() => remote)
}

describe('createSession 继承当前会话的工作目录', () => {
  it('信封形状（宿主真实）：inheritCwdFrom 指到当前会话，create 带 cwd', async () => {
    const { remote, createCalls } = fakeRemote({
      summaries: [{ sessionId: 's1', cwd: '/Users/good/qg/glasses/nexa-service' }],
    })
    const newId = await readersOf(remote).createSession({ inheritCwdFrom: 's1' })
    expect(newId).toBe('session-new')
    expect(createCalls[0]).toEqual({ cwd: '/Users/good/qg/glasses/nexa-service' })
  })

  it('信封形状 + session- 前缀 id（DOM attr 同源格式）：cwd 命中', async () => {
    const { remote, createCalls } = fakeRemote({
      summaries: [{ sessionId: 'session-abc', cwd: '/Users/good/qg/glasses/nexa-service' }],
    })
    await readersOf(remote).createSession({ inheritCwdFrom: 'session-abc' })
    expect(createCalls[0]).toEqual({ cwd: '/Users/good/qg/glasses/nexa-service' })
  })

  it('裸数组形状（兼容旧口径）：cwd 同样命中', async () => {
    const { remote, createCalls } = fakeRemote({
      summaries: [{ sessionId: 's1', cwd: '/x' }],
      shape: 'array',
    })
    await readersOf(remote).createSession({ inheritCwdFrom: 's1' })
    expect(createCalls[0]).toEqual({ cwd: '/x' })
  })

  it('信封形状但列表里查不到该会话：退回 create({})，行为与旧版一致', async () => {
    const { remote, createCalls } = fakeRemote({ summaries: [] })
    const newId = await readersOf(remote).createSession({ inheritCwdFrom: 's1' })
    expect(newId).toBe('session-new')
    expect(createCalls[0]).toEqual({})
  })

  it('不传 inheritCwdFrom（旧调用形状）：保持 create({})', async () => {
    const { remote, createCalls } = fakeRemote({
      summaries: [{ sessionId: 's1', cwd: '/x' }],
      shape: 'array',
    })
    const newId = await readersOf(remote).createSession()
    expect(newId).toBe('session-new')
    expect(createCalls[0]).toEqual({})
  })

  it('远端拒绝创建：原样抛出，调用方据以提示失败', async () => {
    const { remote } = fakeRemote({
      summaries: [{ sessionId: 's1', cwd: '/x' }],
      createError: new Error('workspace not found'),
    })
    await expect(readersOf(remote).createSession({ inheritCwdFrom: 's1' }))
      .rejects.toThrow('workspace not found')
  })

  it('session 面缺失：报 session.create is missing（现有契约）', async () => {
    const readers = readersOf({})
    await expect(readers.createSession({ inheritCwdFrom: 's1' }))
      .rejects.toThrow('session.create is missing')
  })
})

it('creates in the source workspace using workspaceId exclusively', async () => {
  const { remote, createCalls } = fakeRemote({
    summaries: [{ sessionId: 's1', cwd: '/x' }],
    workspaces: [{ workspaceId: 'other', sessionIds: ['s2'] }, { workspaceId: 'mine', sessionIds: ['s1'] }],
  })
  await readersOf(remote).createSession({ inheritCwdFrom: 's1' })
  expect(createCalls).toEqual([{ workspaceId: 'mine' }])
})
it('does not create an ungrouped session when workspace lookup fails', async () => {
  const { remote, createCalls } = fakeRemote({ workspaceError: new Error('offline') })
  await expect(readersOf(remote).createSession({ inheritCwdFrom: 's1' })).rejects.toThrow('offline')
  expect(createCalls).toEqual([])
})
