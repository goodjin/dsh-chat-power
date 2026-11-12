/**
 * 选区编辑卡：弹条「编辑」/ 多选浮动「编辑」钮打开的编辑框。
 *
 * 编辑卡进入会话正文的正常布局，位于输入框前，与回答列使用同一宽度。
 * 内部走 ComposeCard 统一外壳。
 *
 * 文本来自 selection-actions.ts 的编辑卡 store：
 * - 单选编辑：初始为选中的文字，关闭/发送不影响多选收藏；
 * - 多选编辑：初始为收藏按原顺序、项间空行拼接的全文，关闭/发送后
 *   连同收藏与高亮一起清掉。
 *
 * 发送走统一控制器：空白禁用、在途防重复、成功才关卡；失败保留正文并在
 * 编辑器下方提示（此前无 pending 保护，连点会重复发送）。
 */
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import { closeSelectionEdit, currentSessionIdFromDom, getSelectionEdit, selectionEditVisible, subscribeSelectionEdit } from './selection-actions.ts'
import type { SelectionEditState } from './selection-actions.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'
import { ComposeCard } from './compose-card.tsx'
import { copyTextToClipboard, createSendController } from './send-actions.ts'
import { inputClass, statusNoticeClass } from './ui-theme.ts'
import css from './markdown-turn.module.css'

export const SELECTION_EDIT_ID = 'chat-power-selection-edit'

function SelectionEditCard(props: {
  readonly state: SelectionEditState
  readonly readers: MarkdownTurnReaders
  readonly t: RuntimeT
}): ReactNode {
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const [hasText, setHasText] = useState(props.state.text.trim() !== '')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [mount, setMount] = useState<HTMLDivElement | null>(null)
  const modeRef = useRef<'current' | 'new'>('current')
  const propsRef = useRef(props)
  propsRef.current = props
  const t = props.t

  // 自己的挂载点进入正文流，不移动宿主节点，也不覆盖消息和输入框。
  useLayoutEffect(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (scroller === null) return
    const node = document.createElement('div')
    node.className = css.coverHost ?? ''
    node.setAttribute('data-selection-edit-cover', '')
    const composer = scroller.querySelector('[data-composer-seat]')
    if (composer?.parentElement === scroller) scroller.insertBefore(node, composer)
    else scroller.append(node)
    setMount(node)
    return () => { node.remove() }
  }, [])

  useLayoutEffect(() => {
    mount?.scrollIntoView?.({ block: 'nearest' })
  }, [mount])

  const controller = useMemo(() => createSendController({
    send: (body: string): Promise<void> => {
      const current = propsRef.current
      // 发往打开编辑卡时所在的会话（记录在 state.sessionId），DOM 读法兜底。
      const sessionId = current.state.sessionId ?? currentSessionIdFromDom()
      if (sessionId === undefined) return Promise.reject(new Error('sessionId unavailable'))
      if (modeRef.current === 'new') {
        // 新会话继承当前会话的工作目录（与本机文件卡的发送一致）。
        return current.readers.createSession({ inheritCwdFrom: sessionId })
          .then(newId => current.readers.sendToSession(newId, body))
      }
      return current.readers.sendToSession(sessionId, body)
    },
    onPendingChange: setPending,
    onSuccess: () => { closeSelectionEdit() },
    onFailure: () => {
      const current = propsRef.current
      const message = modeRef.current === 'new' ? current.t('markdownTurn.newSessionFailed') : current.t('markdownTurn.sendFailed')
      setNotice(state => ({ seq: (state?.seq ?? 0) + 1, text: message }))
      setToast({ seq: Date.now(), text: message })
    },
  }), [])

  const submit = (mode: 'current' | 'new'): void => {
    modeRef.current = mode
    controller.submit(inputRef.current?.value ?? '')
  }
  const copyEdit = (): void => {
    void copyTextToClipboard(inputRef.current?.value ?? props.state.text).then(ok => {
      if (!ok) setToast({ seq: Date.now(), text: propsRef.current.t('markdownTurn.copyFailed') })
    })
  }

  const title = t(props.state.multi ? 'selection.multiEditTitle' : 'selection.editTitle')

  if (mount === null) return null

  return createPortal(
    <>
      {toast !== null && <Toast
        key={toast.seq}
        text={toast.text}
        icon={<IconWarningOutlineRegular />}
        onDone={() => { setToast(null) }}
      />}
        <ComposeCard
          className={css.coverFill}
          title={title}
          subtitle={t('compose.copyHint')}
          onCancel={() => { if (!pending) closeSelectionEdit() }}
          onCopy={copyEdit}
          onSend={() => { submit('current') }}
          onSendNewSession={() => { submit('new') }}
          sendDisabled={!hasText}
          pending={pending}
          labels={{ cancel: t('markdownTurn.cancel'), send: t('compose.sendCurrent'), newSession: t('compose.sendNewSession'), copy: t('compose.copy') }}
        >
          <textarea
            ref={inputRef}
            className={inputClass}
            data-selection-edit-text=""
            defaultValue={props.state.text}
            onChange={event => { setHasText(event.target.value.trim() !== '') }}
            autoFocus
            aria-label={t('selection.edit')}
            style={{ flex: 1, minHeight: '224px' }}
          />
          {notice !== null && <p key={notice.seq} className={statusNoticeClass} data-variant="error" role="alert">{notice.text}</p>}
        </ComposeCard>
    </>,
    mount,
  )
}

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
): () => void {
  return slots.inject('conversation.input.overlay', () => slots.register(
    {
      name: 'conversation.input.overlay',
      id: SELECTION_EDIT_ID,
      order: 22,
      locale: NAMESPACE,
    },
    () => {
      const state = useSyncExternalStore(subscribeSelectionEdit, getSelectionEdit, getSelectionEdit)
      // 会话作用域过滤：只在打开时的那个会话视图里渲染（key 读不到时放行）。
      // sessionKey 由注册参数固定，无条件调 hook 保证渲染路径稳定。
      const subscribe = sessionKey?.subscribeKey ?? (() => () => {})
      const getKey = sessionKey?.getKey ?? (() => undefined)
      const activeKey = useSyncExternalStore(subscribe, getKey, getKey)
      if (!selectionEditVisible(state, activeKey)) return null
      // 以 seq 为 key：每次打开都重挂载，textarea 回到初始文本与焦点。
      return <SelectionEditCard key={state!.seq} state={state!} readers={readers} t={t} />
    },
  )) as () => void
}
