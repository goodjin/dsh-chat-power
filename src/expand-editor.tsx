/**
 * 会话输入框的「展开大编辑区」。
 *
 * 宿主的 composer 是**单行、回车即发送**的文本框（用户输入大段内容时高度不够）。
 * 本模块在 composer 上方的 `conversation.input.overlay` 座位里挂一枚**向上展开**
 * 图标按钮：点击后在同一处展开一个多行编辑区——这里**回车只是换行**，必须点
 * 「发送」按钮才发。发送走与本包其它发送入口（选区「发送会话」、文件阅读区、答案
 * 卡片）同一条队列通道 `readers.sendToSession`。
 *
 * 草稿与下方小输入框共享宿主输入外壳（`conversation.input.shell` 的
 * `draftSnapshot` / `setDraft`）：展开时从小框种入、编辑即写回，收起不丢字。
 * 外壳不可达（服务未就绪 / 会话无外壳）时退回独立草稿，发送照常，只是不同步小框。
 *
 * 发送统一走 `send-actions.ts` 的控制器：空白拒绝、在途防重复、**成功才清空并收起**，
 * 失败保留正文并提示。与 ComposeCard 同一套观感（`inputClass` / `sendClass`）。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import { createPortal } from 'react-dom'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'
import { createSendController, type SendController } from './send-actions.ts'
import { sendClass, statusNoticeClass } from './ui-theme.ts'
import css from './expand-editor.module.css'

/**
 * 输入外壳里 chat-power 用到的最小面（与 composer-references.ts 同一形状）。
 * `draftSnapshot` 读草稿、`setDraft` 写回；外壳不可达时整个函数返回 undefined。
 */
export interface InputShellFace {
  readonly draftSnapshot: unknown
  setDraft(draft: unknown): void
}

/** 大编辑区向会话发消息的口子（本包 `MarkdownTurnReaders` 的子集，便于测试注入）。 */
export interface ExpandEditorReaders {
  sendToSession(sessionId: string, text: string): Promise<void>
}

/** 展开编辑区的 props。`getShell` / `readComposerValue` 缺省即不同步小输入框。 */
export interface ExpandEditorProps {
  readonly sessionId: string
  readonly t: RuntimeT
  readonly readers: ExpandEditorReaders
  /** 当前会话的输入外壳；读草稿、写回草稿。 */
  readonly getShell?: (sessionId: string) => InputShellFace | undefined
  /** 外壳不可达时的兜底种子：读小输入框的当前文本。 */
  readonly readComposerValue?: () => string
}

/** 展开编辑区高度的下限（约 8 行，24px 行高）与上限（约 20 行）。 */
export const EXPAND_EDITOR_MIN_PX = 192
export const EXPAND_EDITOR_MAX_PX = 480

/** 把 scrollHeight 夹进 [min, max]；非有限值退回下限。纯函数，单测钉住。 */
export function clampEditorHeight(scrollHeight: number, min = EXPAND_EDITOR_MIN_PX, max = EXPAND_EDITOR_MAX_PX): number {
  if (!Number.isFinite(scrollHeight)) return min
  return Math.min(Math.max(scrollHeight, min), max)
}

/**
 * 从宿主草稿快照里取正文文本。快照形状为 `{ text, references, ... }`（见
 * composer-references.ts 的 `asSnapshot`）；不是这个形状时返回空串。
 */
export function draftTextOf(snapshot: unknown): string {
  if (typeof snapshot === 'object' && snapshot !== null) {
    const text = (snapshot as { text?: unknown }).text
    if (typeof text === 'string') return text
  }
  return ''
}

/** 当前会话编号。composer 座位 props 不带 sessionId，从会话根节点读（与本机文件卡一致）。 */
function currentSessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/** 把正文写回宿主草稿，保留已有的引用 / 引用块等字段；外壳不可达时静默。 */
function writeDraftToShell(getShell: ExpandEditorProps['getShell'], sessionId: string, text: string): void {
  if (getShell === undefined) return
  let shell: InputShellFace | undefined
  try { shell = getShell(sessionId) } catch { shell = undefined }
  if (shell === undefined || typeof shell.setDraft !== 'function') return
  try {
    const snapshot = shell.draftSnapshot
    const base = typeof snapshot === 'object' && snapshot !== null
      ? snapshot as Record<string, unknown>
      : {}
    shell.setDraft({ ...base, text })
  } catch {
    // 外壳写回失败不影响编辑：大编辑区仍有独立草稿，发送照常。
  }
}

/**
 * 展开大编辑区。收起时是一枚向上展开的图标按钮；展开时是一个自动撑高的多行
 * textarea + 圆形发送钮。**回车只换行**（textarea 默认行为，不挂任何 Enter→发送），
 * 只有点发送才发。
 */
export function ExpandEditor(props: ExpandEditorProps): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState('')
  // 首次展开才种入一次草稿；之后收起再展开保留大编辑区里没发完的内容。
  const [seeded, setSeeded] = useState(false)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const t = props.t

  const controller: SendController = useMemo(() => createSendController({
    send: (body: string): Promise<void> => propsRef.current.readers.sendToSession(propsRef.current.sessionId, body),
    onPendingChange: setPending,
    onSuccess: (): void => {
      setNotice(null)
      setText('')
      writeDraftToShell(propsRef.current.getShell, propsRef.current.sessionId, '')
      setExpanded(false)
    },
    onFailure: (error: unknown): void => {
      const reason = error instanceof Error ? error.message : String(error)
      setNotice(state => ({ seq: (state?.seq ?? 0) + 1, text: `${t('markdownTurn.sendFailed')}：${reason}` }))
    },
  }), [t])

  const hasText = text.trim() !== ''

  /** 把 textarea 高度夹在 [min, max] 内自动撑高。 */
  const autosize = (el: HTMLTextAreaElement): void => {
    el.style.height = 'auto'
    el.style.height = `${clampEditorHeight(el.scrollHeight)}px`
  }

  // 首次展开时从小输入框（外壳草稿优先）种入；展开后聚焦并撑高。
  useEffect(() => {
    if (!expanded) return
    if (!seeded) {
      let seed = ''
      const getShell = propsRef.current.getShell
      if (getShell !== undefined) {
        try {
          const shell = getShell(propsRef.current.sessionId)
          if (shell !== undefined) seed = draftTextOf(shell.draftSnapshot)
        } catch { seed = '' }
      }
      if (seed === '' && propsRef.current.readComposerValue !== undefined) {
        try { seed = propsRef.current.readComposerValue() ?? '' } catch { seed = '' }
      }
      setText(seed)
      setSeeded(true)
    }
    const el = taRef.current
    if (el !== null) {
      el.focus()
      autosize(el)
    }
  }, [expanded, seeded])

  const onChange = (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
    const value = event.target.value
    setText(value)
    writeDraftToShell(propsRef.current.getShell, propsRef.current.sessionId, value)
    autosize(event.target)
  }

  const expand = (): void => { setExpanded(true) }

  const editor = (
    <div className={css.wrap} data-expand-editor="" data-collapsed="">
      <div className={css.editorBar}>
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          className={css.editor}
          data-expand-textarea=""
          aria-label={t('expand.editorLabel')}
          rows={8}
        />
        <div className={css.actions}>
          {notice !== null && (
            <p key={notice.seq} className={statusNoticeClass} data-variant="error" role="alert">{notice.text}</p>
          )}
          <span className={css.spacer} aria-hidden="true" />
          <button
            type="button"
            className={css.collapse}
            data-expand-collapse=""
            aria-label={t('expand.close')}
            title={t('expand.close')}
            onClick={() => { setExpanded(false) }}
          >
            <IconChevronDownOutlineRegular size={16} />
          </button>
          <button
            type="button"
            className={sendClass}
            data-expand-send=""
            aria-label={t('markdownTurn.send')}
            title={t('markdownTurn.send')}
            disabled={!hasText || pending}
            onClick={() => { controller.submit(text) }}
          >
            <IconSendOutlineRegular size={20} />
          </button>
        </div>
      </div>
    </div>
  )

  if (!expanded) {
    // 收起态：一枚居中图标按钮，留在 composer overlay 座位里（薄一行，不占 composer 高度）。
    return (
      <div className={css.wrap} data-expand-editor="" data-collapsed="">
        <button
          type="button"
          className={css.toggle}
          data-expand-toggle=""
          aria-label={t('expand.open')}
          title={t('expand.open')}
          onClick={expand}
        >
          <IconChevronUpOutlineRegular size={20} />
        </button>
      </div>
    )
  }

  // 展开态：经 portal 挂进会话内容区（composer 之上、对话正文之后），自己占据高度，
  // 不受宿主单行 composer 的固定高度约束——此前直接塞进 overlay 座位被 composer 压扁。
  const target = typeof document === 'undefined' ? null : document.querySelector('[data-conversation-content]')
  return target === null ? editor : createPortal(editor, target)
}

/** composer 座位条目宿主的最小结构类型（与本包其它注册函数一致）。 */
interface ComposerSlotHost {
  inject(key: string, callback: () => unknown): unknown
  register(options: {
    name: string
    id?: string
    order?: number
    locale?: string
  }, component: unknown): () => void
}

/** overlay 列座位里本条目的 id；只用自己的 id，不占别人的格子。 */
export const EXPAND_EDITOR_ID = 'chat-power-expand-editor'

/** overlay 里的排序：本机文件卡用 20，展开按钮用 10，画在它上面。 */
const EXPAND_EDITOR_ORDER = 10

export interface RegisterExpandEditorOptions {
  /** 发送通道（本包 `MarkdownTurnReaders`）。 */
  readonly readers: MarkdownTurnReaders
  /** 取宿主 `conversation` 服务；用于读 / 写输入外壳草稿。缺省即不同步小输入框。 */
  readonly conversationOf?: () => unknown
  /** 绑定本包词典的翻译函数。 */
  readonly t: RuntimeT
}

/** 从宿主 `conversation` 服务里取当前会话的输入外壳；服务缺席 / 抛错返回 undefined。 */
function shellOf(conversationOf: RegisterExpandEditorOptions['conversationOf'], sessionId: string): InputShellFace | undefined {
  if (conversationOf === undefined) return undefined
  let conversation: unknown
  try { conversation = conversationOf() } catch { return undefined }
  const input = typeof conversation === 'object' && conversation !== null
    ? (conversation as { input?: { shell?: (id: string) => unknown } }).input
    : undefined
  const shell = input !== undefined && typeof input.shell === 'function'
    ? input.shell(sessionId)
    : undefined
  return typeof shell === 'object' && shell !== null ? shell as unknown as InputShellFace : undefined
}

/** 小输入框 DOM 值（外壳不可达时的兜底种子）。 */
function readComposerValueFromDom(): string {
  if (typeof document === 'undefined') return ''
  const node = document.querySelector<HTMLElement>('[data-composer-input]')
  const value = node?.getAttribute('data-value') ?? (node as HTMLTextAreaElement | null)?.value ?? ''
  return typeof value === 'string' ? value : ''
}

/**
 * 把展开大编辑区注册进 composer 的 overlay 列座位（输入框上方）。
 *
 * 用 overlay 列座位（而非单席 attachments）的原因与本机文件卡一致：它是会话
 * 作用域的 list 槽位、每会话必渲染，且锚点就在输入框正上方。
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param options - 发送通道 / 宿主服务 / 翻译。
 * @returns 注册的清理函数。
 */
export function registerExpandEditor(slots: ComposerSlotHost, options: RegisterExpandEditorOptions): () => void {
  const getShell = (sessionId: string): InputShellFace | undefined => shellOf(options.conversationOf, sessionId)
  return slots.inject('conversation.input.overlay', () => slots.register(
    {
      name: 'conversation.input.overlay',
      id: EXPAND_EDITOR_ID,
      order: EXPAND_EDITOR_ORDER,
      locale: NAMESPACE,
    },
    () => {
      const sessionId = currentSessionIdFromDom()
      if (sessionId === undefined) return null
      // 按 sessionId 挂 key：换会话时组件整体重挂载，草稿 / 展开态自然复位。
      return <ExpandEditor key={sessionId} sessionId={sessionId} t={options.t} readers={options.readers} getShell={getShell} readComposerValue={readComposerValueFromDom} />
    },
  )) as () => void
}
