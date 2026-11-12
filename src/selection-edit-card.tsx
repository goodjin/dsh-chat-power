/** Selection edits feed the shared host-composer editing transaction. */
import { useLayoutEffect, useSyncExternalStore } from 'react'
import { closeSelectionEdit, currentSessionIdFromDom, getSelectionEdit, selectionEditVisible, subscribeSelectionEdit } from './selection-actions.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'
import { ComposerEditSurface } from './composer-edit.tsx'
import { openComposerEdit, setComposerEditNotice, type EditShell } from './composer-edit-state.ts'
export const SELECTION_EDIT_ID = 'chat-power-selection-edit'
/** overlay 座位宿主的最小结构类型。 */
interface OverlaySlotHost {
  inject(key: string, callback: () => unknown): unknown
  register(options: {
    name: string
    id?: string
    order?: number
    locale?: string
  }, component: unknown): () => void
}

/**
 * 把选区编辑卡注册进 overlay 座位（order 22，排本机文件卡之后）。
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param readers - 发送 / 新建会话的口子。
 * @param t - 绑定本包词典的翻译函数。
 * @returns 注册的清理函数。
 */
export function registerSelectionEditComposer(
  slots: OverlaySlotHost,
  readers: MarkdownTurnReaders,
  t: RuntimeT,
  sessionKey?: {
    getKey: () => string | undefined
    subscribeKey: (listener: () => void) => () => void
  },
  shellOf: (id: string) => EditShell | undefined = () => undefined,
): () => void {
  return slots.inject('conversation.input.overlay', () => slots.register(
    {
      name: 'conversation.input.overlay',
      id: SELECTION_EDIT_ID,
      order: 22,
      locale: NAMESPACE,
    },
    (props: { sessionId?: string }) => {
      const state = useSyncExternalStore(subscribeSelectionEdit, getSelectionEdit, getSelectionEdit)
      // 会话作用域过滤：只在打开时的那个会话视图里渲染（key 读不到时放行）。
      // sessionKey 由注册参数固定，无条件调 hook 保证渲染路径稳定。
      const subscribe = sessionKey?.subscribeKey ?? (() => () => {})
      const getKey = sessionKey?.getKey ?? (() => undefined)
      const activeKey = useSyncExternalStore(subscribe, getKey, getKey)
      const id = props.sessionId ?? activeKey ?? currentSessionIdFromDom()
      useLayoutEffect(() => {
        if (!id || !selectionEditVisible(state, id) || !state) return
        const accepted = openComposerEdit({
          sessionId: id, title: t(state.multi ? 'selection.multiEditTitle' : 'selection.editTitle'), text: state.text,
          send: async (text, target) => {
            const destination = target === 'new' ? await readers.createSession({ inheritCwdFrom: id }) : id
            await readers.sendToSession(destination, text)
          },
          onClose: closeSelectionEdit,
        })
        if (!accepted) setComposerEditNotice(id, '请先完成当前编辑')
      }, [state, id])
      return id ? <ComposerEditSurface sessionId={id} shellOf={shellOf} /> : null
    },
  )) as () => void
}
