/**
 * 「提示词」视图：查看/编辑当前会话生效的系统提示词。
 *
 * 注册成宿主会话视图（`conversation.view` ✓）——内容**全部在本组件里渲染** ✓
 * （自己拉数据 ✓），不存在上次「空视图体」的问题 ✓。
 *
 * 会话角色由数据层判定 ✓：router/worker 会话可编辑（编辑 → 保存 ✓，
 * 「恢复默认」= 保存空串、清除会话覆盖 ✓）；普通会话只读 ✓，附一行说明 ✓。
 */
import { createElement, useEffect, useState, type ReactNode } from 'react'
import {
  detectSessionRole,
  fetchSessionPrompt,
  saveSessionPrompt,
  type FetchLike,
  type PromptSessionRole,
  type SessionPrompt,
} from './prompt-view-data.ts'
import { fallbackT } from './locales.ts'
import styles from './prompt-view.module.css'

/** 视图 id（带包名前缀，不与别的插件撞名）。 */
export const PROMPT_VIEW_ID = 'chat-power-prompt'
/** 视图对应的座位（声明用；内容在本组件里画）。 */
const BODY_SEAT = 'chat-power.prompt.body'

type LoadState =
  | { readonly phase: 'loading' }
  | { readonly phase: 'ready'; readonly role: PromptSessionRole; readonly data: SessionPrompt }
  | { readonly phase: 'error'; readonly message: string }

export function PromptView(props: {
  /** 会话 ID（宿主按会话注入 ✓）。 */
  readonly sessionId?: string
  /** fetch 的注入点（测试用；缺省 = 全局 fetch）。 */
  readonly doFetch?: FetchLike
}): ReactNode {
  const doFetch = props.doFetch ?? ((input: string, init?: RequestInit) => globalThis.fetch(input, init))
  const sessionId = props.sessionId ?? ''
  const [state, setState] = useState<LoadState>({ phase: 'loading' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (sessionId === '') return
    let alive = true
    setState({ phase: 'loading' })
    setEditing(false)
    setNotice('')
    void (async () => {
      try {
        const role = await detectSessionRole(sessionId, doFetch)
        const data = await fetchSessionPrompt(sessionId, doFetch)
        if (!alive) return
        setState({ phase: 'ready', role, data })
      } catch (error) {
        if (!alive) return
        setState({ phase: 'error', message: error instanceof Error ? error.message : String(error) })
      }
    })()
    return () => { alive = false }
  }, [sessionId, doFetch])

  const save = async (text: string): Promise<void> => {
    if (busy || sessionId === '') return
    setBusy(true)
    setNotice('')
    try {
      await saveSessionPrompt(sessionId, text, doFetch)
      const data = await fetchSessionPrompt(sessionId, doFetch)
      setState({ phase: 'ready', role: 'editable', data })
      setEditing(false)
      setNotice('已保存，下一轮生效')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  if (sessionId === '') return <div className={styles.frame}>会话尚未就绪。</div>
  if (state.phase === 'loading') return <div className={styles.frame}>载入中…</div>
  if (state.phase === 'error') {
    return (
      <div className={styles.frame}>
        <p className={styles.hint}>读取系统提示词失败：{state.message}（Router 插件未安装时此视图不可用）。</p>
      </div>
    )
  }

  const { role, data } = state
  const editable = role === 'editable'
  return (
    <div className={styles.frame} data-chat-prompt-view="">
      <div className={styles.header}>
        <span className={styles.title}>当前会话的系统提示词</span>
        <span className={styles.state}>
          {data.isDefault ? '全局默认' : '会话覆盖'}
          {editable ? '' : ' · 只读（仅 Router / Worker 会话可编辑）'}
        </span>
      </div>
      {editing ? (
        <>
          <textarea
            className={styles.editor}
            value={draft}
            onChange={event => { setDraft(event.currentTarget.value) }}
            rows={14}
            spellCheck={false}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.button} disabled={busy} onClick={() => { void save(draft) }}>保存</button>
            {data.isDefault === false && (
              <button
                type="button"
                className={styles.button}
                disabled={busy}
                title="清除会话覆盖，恢复全局默认"
                onClick={() => { void save('') }}
              >
                恢复默认
              </button>
            )}
            <button type="button" className={styles.button} disabled={busy} onClick={() => { setEditing(false); setNotice('') }}>取消</button>
          </div>
        </>
      ) : (
        <>
          <pre className={styles.body}>{data.prompt === '' ? '（空）' : data.prompt}</pre>
          {editable && (
            <div className={styles.actions}>
              <button type="button" className={styles.button} onClick={() => { setDraft(data.prompt); setEditing(true); setNotice('') }}>编辑</button>
            </div>
          )}
        </>
      )}
      {notice !== '' && <p className={styles.notice} role="status">{notice}</p>}
    </div>
  )
}

/**
 * 把「提示词」注册成宿主会话视图。
 *
 * @param ctx - 插件上下文（slots）。
 * @returns 注销函数。
 */
export function registerPromptView(ctx: any): () => void {
  return ctx.slots.register({
    name: 'conversation.view',
    id: PROMPT_VIEW_ID,
    order: 30,
    label: () => fallbackT('promptView.title'),
    children: { [BODY_SEAT]: { kind: 'single', scope: 'session' } },
    inject: (sessionId: string) => ({ sessionId }),
  }, (props: any) => createElement(PromptView, { sessionId: props.sessionId as string }))
}

