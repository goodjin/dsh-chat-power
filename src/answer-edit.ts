import { openComposerEdit, setComposerEditNotice } from './composer-edit-state.ts'
import { fallbackT } from './locales.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'

/** 点击时读取对应会话/节点的最新 Markdown，绝不从 DOM 拼回格式或缓存 binding。 */
export interface AnswerSource {
  binding(id: string): {
    target(name: 'chat'): { getSnapshot(): {
      turnTimings?: ReadonlyMap<number, { startTime: number; endTime?: number }>
      nodes: { get(key: string): { kind: string; data: { blocks?: readonly { kind: string; text?: string }[] } } | undefined }
    } | undefined }
  }
}
export function editAnswerCopy(source: AnswerSource, readers: MarkdownTurnReaders, sessionId: string, nodeKey: string): void {
  const node = source.binding(sessionId).target('chat').getSnapshot()?.nodes.get(nodeKey)
  if (node?.kind !== 'assistant-step') throw new Error('回答数据暂不可用，请稍后重试')
  const text = node.data.blocks?.filter(block => block.kind === 'text')
    .map(block => block.text ?? '').join('\n\n') ?? ''
  if (!text.trim()) throw new Error('此回答没有可编辑的文字')
  if (!openComposerEdit({
    sessionId, title: fallbackT('answerCard.editAnswer'), text,
    send: async (body, target) => {
      const destination = target === 'new' ? await readers.createSession({ inheritCwdFrom: sessionId }) : sessionId
      await readers.sendToSession(destination, body)
    },
  })) {
    setComposerEditNotice(sessionId, '请先完成当前编辑')
    throw new Error('请先完成当前编辑')
  }
}

/** 使用宿主整轮起止事件时间；历史缺页时不猜测耗时。 */
export function answerTurnTitle(source: AnswerSource, sessionId: string, turn: number): string {
  const prefix = `第 ${turn} 轮`
  const timing = source.binding(sessionId).target('chat').getSnapshot()?.turnTimings?.get(turn)
  if (!timing || !Number.isFinite(timing.startTime)) return `${prefix} · 用时未知`
  if (timing.endTime === undefined) return `${prefix} · 用时待结算`
  if (!Number.isFinite(timing.endTime) || timing.endTime < timing.startTime) return `${prefix} · 用时未知`
  const seconds = Math.floor((timing.endTime - timing.startTime) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const tail = seconds % 60
  const duration = hours ? `${hours}小时${minutes}分${tail}秒`
    : minutes ? `${minutes}分${tail}秒` : `${tail}秒`
  return `${prefix} · 用时 ${duration}`
}
