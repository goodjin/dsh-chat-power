import { openComposerEdit, setComposerEditNotice } from './composer-edit-state.ts'
import { fallbackT } from './locales.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'

/** 点击时读取对应会话/节点的最新 Markdown，绝不从 DOM 拼回格式或缓存 binding。 */
export interface AnswerSource {
  binding(id: string): {
    target(name: 'chat'): { getSnapshot(): {
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
