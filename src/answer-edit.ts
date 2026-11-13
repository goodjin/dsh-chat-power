import { openComposerEdit, setComposerEditNotice } from './composer-edit-state.ts'
import type { TurnUsage } from './answer-usage.ts'
import { fallbackT } from './locales.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'

/** 点击时读取对应会话/节点的最新 Markdown，绝不从 DOM 拼回格式或缓存 binding。 */
export interface AnswerSource {
  binding(id: string): {
    target(name: 'chat'): { getSnapshot(): {
      timeline?: { turns: ReadonlyMap<number, {
        data?: { get(key: string): { tokenUsage?: TurnUsage } | undefined }
        start?: { time: number }
        end?: { time: number; data?: { reason?: { kind: string } } }
      }> }
      nodes: { get(key: string): { kind: string; data: { blocks?: readonly { kind: string; text?: string }[] } } | undefined }
    } | undefined }
  }
}
export function answerText(source: AnswerSource, sessionId: string, nodeKey: string): string {
  const node = source.binding(sessionId).target('chat').getSnapshot()?.nodes.get(nodeKey)
  if (node?.kind !== 'assistant-step') throw new Error('回答数据暂不可用，请稍后重试')
  const text = node.data.blocks?.filter(block => block.kind === 'text')
    .map(block => block.text ?? '').join('\n\n') ?? ''
  if (!text.trim()) throw new Error('此回答没有可复制或编辑的文字')
  return text
}
export function editAnswerCopy(source: AnswerSource, readers: MarkdownTurnReaders, sessionId: string, nodeKey: string): void {
  const text = answerText(source, sessionId, nodeKey)
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
  const timing = source.binding(sessionId).target('chat').getSnapshot()?.timeline?.turns.get(turn)
  const reason = timing?.end?.data?.reason?.kind
  if (reason === 'aborted' || reason === 'interrupted') return `${prefix} · 已停止`
  if (reason === 'error') return `${prefix} · 处理失败`
  const start = timing?.start?.time
  const end = timing?.end?.time
  if (start === undefined || !Number.isFinite(start)) return `${prefix} · 用时未知`
  if (end === undefined) return `${prefix} · 用时待结算`
  if (!Number.isFinite(end)) return `${prefix} · 用时未知`
  // 与原生 TurnProcessNodeView 一致：已完成的轮次最少显示 1 秒。
  const seconds = Math.floor(Math.max(1000, end - start) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds % 3600 / 60)
  const tail = seconds % 60
  const duration = hours ? `${hours}小时${minutes}分${tail}秒`
    : minutes ? `${minutes}分${tail}秒` : `${tail}秒`
  return `${prefix} · 用时 ${duration}`
}

/** 与原生 TurnTailNodeView 读取同一份整轮结算，不自行相加或猜测。 */
export function answerTurnUsage(source: AnswerSource, sessionId: string, turn: number): TurnUsage | undefined {
  return source.binding(sessionId).target('chat').getSnapshot()?.timeline?.turns.get(turn)?.data?.get('turn-tail')?.tokenUsage
}
