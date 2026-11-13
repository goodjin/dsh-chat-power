import { afterEach, expect, it, vi } from 'vitest'
import { editAnswerCopy, answerText, answerTurnTitle, type AnswerSource } from '../src/answer-edit.ts'
import { closeComposerEdit, getComposerEdit } from '../src/composer-edit-state.ts'
import type { MarkdownTurnReaders } from '../src/markdown-turn-sources.ts'

afterEach(() => { closeComposerEdit('s1'); closeComposerEdit('s2') })
it('按会话和节点读取原文，保留 Markdown，仅编辑文字副本并沿用发送路径', async () => {
  const markdown = '# 标题\n\n```ts\nconst a = 1\n```'
  const get = vi.fn(() => ({ kind: 'assistant-step', data: { blocks: [
    { kind: 'reasoning', text: '不要复制思考' }, { kind: 'text', text: markdown },
  ] } }))
  const binding = vi.fn(() => ({ target: () => ({ getSnapshot: () => ({ nodes: { get } }) }) }))
  const source: AnswerSource = { binding }
  const sendToSession = vi.fn(async () => {})
  const createSession = vi.fn(async () => 'new-session')
  const readers = { sendToSession, createSession } as unknown as MarkdownTurnReaders
  expect(answerText(source, 's1', 'answer-42')).toBe(markdown)
  editAnswerCopy(source, readers, 's1', 'answer-42')
  expect(binding).toHaveBeenCalledWith('s1')
  expect(get).toHaveBeenCalledWith('answer-42')
  expect(getComposerEdit('s1')?.text).toBe(markdown)
  expect(getComposerEdit('s2')).toBeUndefined()
  expect(() => editAnswerCopy(source, readers, 's1', 'other')).toThrow('请先完成当前编辑')
  expect(getComposerEdit('s1')?.text).toBe(markdown)
  await getComposerEdit('s1')!.request.send('edited', 'new')
  expect(createSession).toHaveBeenCalledWith({ inheritCwdFrom: 's1' })
  expect(sendToSession).toHaveBeenCalledWith('new-session', 'edited')
})
it('失效会话或节点不创建空白编辑任务', () => {
  const source = { binding: () => { throw new Error('inactive session') } } as AnswerSource
  expect(() => editAnswerCopy(source, {} as MarkdownTurnReaders, 's1', 'gone')).toThrow('inactive session')
  expect(getComposerEdit('s1')).toBeUndefined()
})

it('轮次耗时来自对应轮的宿主时间，区分结束、未结束和缺失', () => {
  const timings = new Map<number, { start?: { time: number }; end?: { time: number; data?: { reason: { kind: string } } } }>([
    [3, { start: { time: 10000 }, end: { time: 94000 } }],
    [4, { start: { time: 10000 } }],
    [5, { start: { time: 10000 }, end: { time: 3671000 } }],
  ])
  const source: AnswerSource = { binding: () => ({ target: () => ({ getSnapshot: () => ({
    nodes: { get: () => undefined }, timeline: { turns: timings },
  }) }) }) }
  expect(answerTurnTitle(source, 's1', 3)).toBe('第 3 轮 · 用时 1分24秒')
  expect(answerTurnTitle(source, 's1', 4)).toBe('第 4 轮 · 用时待结算')
  expect(answerTurnTitle(source, 's1', 5)).toBe('第 5 轮 · 用时 1小时1分1秒')
  expect(answerTurnTitle(source, 's1', 6)).toBe('第 6 轮 · 用时未知')
  timings.set(4, { start: { time: 10000 }, end: { time: 10000 } })
  expect(answerTurnTitle(source, 's1', 4)).toBe('第 4 轮 · 用时 1秒')
  timings.set(4, { start: { time: 10000 }, end: { time: 20000, data: { reason: { kind: 'error' } } } })
  expect(answerTurnTitle(source, 's1', 4)).toBe('第 4 轮 · 处理失败')
})
