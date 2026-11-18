// @vitest-environment jsdom
/**
 * 目录自动刷新（2026-11-18）。
 *
 * 场景：你在会话里让模型改了文件，工作区文件那边要自己变——不然很容易以为
 * 改动没落地。这里钉住「变更通知 → 重读那一层」这条链路真的通。
 */
import { describe, expect, it } from 'vitest'
import { watchDirectory } from '../src/file-tree-watch.ts'

describe('目录变更触发重读', () => {
  it('收到通知就回调，路径形式与列目录一致（根用「.」）', async () => {
    const watched: string[] = []
    const frames = [
      { value: { kind: 'ready' }, accept: () => {} },
      { value: { kind: 'changed' }, accept: () => {} },
    ]
    const host = {
      workspaceFiles: {
        changes: async function* (_sessionId: string, path: string) {
          watched.push(path)
          yield* frames
        },
      },
      $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => ({
        async *[Symbol.asyncIterator]() { yield* options.open(new AbortController().signal) },
        dispose: () => {},
      }),
    }
    const changes: number[] = []
    await watchDirectory({
      host,
      sessionId: 's1',
      path: '',
      signal: new AbortController().signal,
      onChange: () => { changes.push(changes.length + 1) },
    })
    expect(watched).toEqual(['.'])
    expect(changes).toHaveLength(2)
  })

  it('监听子目录时用相对路径', async () => {
    const watched: string[] = []
    const host = {
      workspaceFiles: {
        changes: async function* (_sessionId: string, path: string) {
          watched.push(path)
        },
      },
      $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => ({
        async *[Symbol.asyncIterator]() { yield* options.open(new AbortController().signal) },
        dispose: () => {},
      }),
    }
    await watchDirectory({
      host, sessionId: 's1', path: 'src/lib',
      signal: new AbortController().signal, onChange: () => {},
    })
    expect(watched).toEqual(['src/lib'])
  })

  it('取消后不再回调', async () => {
    const controller = new AbortController()
    const changes: number[] = []
    const host = {
      workspaceFiles: {
        changes: async function* (_sessionId: string, path: string) {
          yield { value: { kind: 'changed' }, accept: () => {} }
          await new Promise(resolve => setTimeout(resolve, 5))
          yield { value: { kind: 'changed' }, accept: () => {} }
        },
      },
      $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => ({
        async *[Symbol.asyncIterator]() { yield* options.open(new AbortController().signal) },
        dispose: () => {},
      }),
    }
    const running = watchDirectory({
      host, sessionId: 's1', path: '',
      signal: controller.signal, onChange: () => { changes.push(1) },
    })
    controller.abort()
    await running
    // 取消后最多收到取消前的那一次。
    expect(changes.length).toBeLessThanOrEqual(1)
  })
})
