/**
 * 本机文件卡：顶栏「打开本机文件」→ 系统文件选择框 → 读入文本 → 在输入框
 * （composer）上方的 `conversation.input.overlay` 座位里展开成编辑卡片。
 *
 * 入口（会话头部）和卡片（composer）分属两个座位，靠本模块的**会话级共享
 * store** 连接：头部写入，卡片订阅。seq 每次写入自增，卡片组件以 seq 为 key
 * 重挂载——新选一个文件总是直接进入编辑态，不受上一次收起状态影响。
 *
 * 选 composer 的 overlay 座位放卡片的原因：它是会话作用域的 **list** 槽位、每会话
 * 必渲染（轮次尾的文件区在没有文件时整块不渲染，接不住「无文件会话里开本机文件」），
 * 且锚点就在输入框正上方——本机文件内容本来就是喂给会话的，放在那里语义顺。
 * 不能用 `conversation.input.attachments`：那是宿主附件区的 **single** 槽位，宿主
 * 附件区已占 priority 0，同优先级重复注册直接抛错——一抛就把同一函数里排在后面的
 * 答案卡片 wrap 一起带走（2026-11-04 现场：答案卡片没有框、没有编辑按钮）。
 *
 * 编辑态走 ComposeCard 统一外壳：标题是文件名、说明写明这是发送副本；取消在
 * 头部、复制全文在动作行左侧弱位、新建会话与发送在右侧。发送走统一控制器——
 * 空白禁用、在途防重复、**成功才收起**（overlay 收成标题条、tab 交给 onSent），
 * 失败保留正文并在编辑器下方提示。此前发送一发起就收起卡片，失败只剩一条
 * Toast、正文没了，这里一并修掉。
 */
import { useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { FileTypeIcon, IconChevronDownOutlineRegular, IconCloseOutlineRegular, IconFolderOpenOutlineRegular, IconWarningOutlineRegular, Toast, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'
import { ComposeCard } from './compose-card.tsx'
import { copyTextToClipboard, createSendController } from './send-actions.ts'
import { inputClass, statusNoticeClass, uiButtonClass } from './ui-theme.ts'
import css from './markdown-turn.module.css'

/** 本机文件选择框可挑的类型：text/* 之外再加常用的代码 / 配置 / 文档后缀。 */
export const LOCAL_FILE_ACCEPT = [
  'text/*',
  '.md', '.markdown', '.txt', '.log', '.csv', '.tsv',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift',
  '.c', '.h', '.cpp', '.hpp', '.cs', '.php',
  '.sh', '.bash', '.zsh', '.sql',
  '.html', '.htm', '.css', '.scss', '.less', '.xml', '.svg',
].join(',')

/** 超过这个大小的本机文件不读入（几 MB 起编辑框就明显卡顿）。 */
export const LOCAL_FILE_MAX_BYTES = 5 * 1024 * 1024

/** 一份已读入的本机文件。seq 在每次写入时自增，用作卡片重挂载的 key。 */
export interface LocalFileDoc {
  readonly name: string
  readonly text: string
  readonly seq: number
}

let currentDoc: LocalFileDoc | null = null
let docSeq = 0
const docListeners = new Set<() => void>()

/** 订阅本机文件卡；退订函数照 useSyncExternalStore 的约定返回。 */
export function subscribeLocalFileDoc(listener: () => void): () => void {
  docListeners.add(listener)
  return () => { docListeners.delete(listener) }
}

/** 当前本机文件；没有为 null。返回引用稳定，可作 getSnapshot。 */
export function getLocalFileDoc(): LocalFileDoc | null {
  return currentDoc
}

/** 写入 / 清除本机文件；null 为关闭。写入即自增 seq，卡片会以编辑态重挂载。 */
export function setLocalFileDoc(doc: { readonly name: string; readonly text: string } | null): void {
  docSeq += 1
  currentDoc = doc === null ? null : { name: doc.name, text: doc.text, seq: docSeq }
  for (const listener of docListeners) listener()
}

/** 当前会话编号。composer 的座位 props 不带 sessionId，从会话根节点读。 */
function currentSessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/**
 * composer 座位里的本机文件卡。doc 为 null 时不占位；编辑态是 ComposeCard
 * 统一外壳，收起后是一条标题条。
 */
export function LocalFileComposerCard(props: {
  readonly sessionId?: string
  readonly onClose?: () => void
  readonly onDraftChange?: (text: string) => void
  readonly onSent?: () => void
  /** 仅保存（写回文件，不发送）：只有来自工作区文件的编辑提供；缺席则底部不出现保存钮。 */
  readonly onSave?: (text: string) => Promise<void>
  readonly doc: LocalFileDoc
  readonly readers: MarkdownTurnReaders
  readonly t: RuntimeT
  /** 在 Finder 中打开文件所在文件夹（工作区文件编辑提供；本机文件没有路径，缺席不画）。 */
  readonly onReveal?: () => void
  /** overlay = 输入框上方的卡（默认）；tab = 工具标签里的纯编辑卡。 */
  readonly variant?: 'overlay' | 'tab'
}): ReactNode {
  const variant = props.variant ?? 'overlay'
  const tabMode = variant === 'tab'
  const [expanded, setExpanded] = useState(true)
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const [hasText, setHasText] = useState(props.doc.text.trim() !== '')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modeRef = useRef<'current' | 'new'>('current')
  const propsRef = useRef(props)
  propsRef.current = props
  const t = props.t

  const controller = useMemo(() => createSendController({
    send: (body: string): Promise<void> => {
      const current = propsRef.current
      const sessionId = current.sessionId ?? currentSessionIdFromDom()
      if (sessionId === undefined) return Promise.reject(new Error('sessionId unavailable'))
      const header = current.t('markdownTurn.localFileHeader', { name: current.doc.name })
      const payload = `${header}\n\n${body}`
      if (modeRef.current === 'new') {
        // 新会话继承当前会话的工作目录。
        return current.readers.createSession({ inheritCwdFrom: sessionId })
          .then(newId => current.readers.sendToSession(newId, payload))
      }
      return current.readers.sendToSession(sessionId, payload)
    },
    onPendingChange: setPending,
    onSuccess: () => {
      setNotice(null)
      if (tabMode) propsRef.current.onSent?.()
      else setExpanded(false)
    },
    onFailure: () => {
      const current = propsRef.current
      const message = modeRef.current === 'new' ? current.t('markdownTurn.newSessionFailed') : current.t('markdownTurn.sendFailed')
      setNotice(state => ({ seq: (state?.seq ?? 0) + 1, text: message }))
      setToast({ seq: Date.now(), text: message })
    },
  }), [tabMode])

  const submit = (mode: 'current' | 'new'): void => {
    modeRef.current = mode
    controller.submit(inputRef.current?.value ?? '')
  }
  const copyAll = (): void => {
    void copyTextToClipboard(inputRef.current?.value ?? '').then(ok => {
      setToast({ seq: Date.now(), text: propsRef.current.t(ok ? 'markdownTurn.copied' : 'markdownTurn.copyFailed') })
    })
  }
  const [saving, setSaving] = useState(false)
  const saveOnly = (): void => {
    if (props.onSave === undefined || saving) return
    setSaving(true)
    props.onSave(inputRef.current?.value ?? '').then(() => {
      setToast({ seq: Date.now(), text: propsRef.current.t('compose.saveSaved') })
    }, () => {
      // 保存失败：内容留在编辑框里，只报状态。
      setToast({ seq: Date.now(), text: propsRef.current.t('compose.saveFailed') })
    }).finally(() => { setSaving(false) })
  }
  const close = (): void => {
    if (pending) return
    if (props.onClose !== undefined) props.onClose()
    else setLocalFileDoc(null)
  }

  return <>
    {expanded
      ? <ComposeCard
          title={props.doc.name}
          subtitle={t('compose.copyHint')}
          headerActions={props.onReveal === undefined ? undefined : (
        <button
          type="button"
          className={uiButtonClass}
          data-local-reveal=""
          title="在 Finder 中打开所在文件夹"
          onClick={props.onReveal}
        >
          <IconFolderOpenOutlineRegular size={16} />
        </button>
      )}
          onCancel={close}
          onCopy={copyAll}
          onSave={props.onSave === undefined ? undefined : saveOnly}
          onSend={() => { submit('current') }}
          onSendNewSession={() => { submit('new') }}
          sendDisabled={!hasText}
          pending={pending || saving}
          labels={{
            cancel: t('markdownTurn.cancel'),
            send: t('compose.sendCurrent'),
            newSession: t('compose.sendNewSession'),
            copy: t('compose.copy'),
            save: t('compose.save'),
          }}
        >
          <textarea
            ref={inputRef}
            className={inputClass}
            data-local-file-text=""
            defaultValue={props.doc.text}
            onChange={event => {
              setHasText(event.target.value.trim() !== '')
              props.onDraftChange?.(event.target.value)
            }}
            autoFocus
            aria-label={t('markdownTurn.edit')}
            style={{ minHeight: '28dvh' }}
          />
          {notice !== null && <p key={notice.seq} className={statusNoticeClass} data-variant="error" role="alert">{notice.text}</p>}
        </ComposeCard>
      : <div className={css.bar} data-local-doc="" data-collapsed="">
          <span className={css.icon} data-file-icon={classifyFileType(props.doc.name)}>
            <FileTypeIcon path={props.doc.name} size={16} />
          </span>
          <span className={css.name} title={props.doc.name}>{props.doc.name}</span>
          <button
            type="button"
            className={css.iconButton}
            data-local-expand=""
            aria-label={t('markdownTurn.expand')}
            title={t('markdownTurn.expand')}
            onClick={() => setExpanded(true)}
          >
            <IconChevronDownOutlineRegular size={16} />
          </button>
          <button
            type="button"
            className={css.iconButton}
            data-local-close=""
            aria-label={t('markdownTurn.cancel')}
            title={t('markdownTurn.cancel')}
            onClick={close}
          >
            <IconCloseOutlineRegular size={16} />
          </button>
        </div>}
    {toast !== null && <Toast
      key={toast.seq}
      text={toast.text}
      icon={<IconWarningOutlineRegular />}
      onDone={() => { setToast(null) }}
    />}
  </>
}

/** composer 座位条目宿主的最小结构类型。 */
interface ComposerSlotHost {
  inject(key: string, callback: () => unknown): unknown
  register(options: {
    name: string
    id?: string
    order?: number
    locale?: string
  }, component: unknown): () => void
}

/** composer attachments 座位里本条目的 id。 */
export const LOCAL_FILE_ID = 'chat-power-local-file'

/**
 * 把本机文件卡注册进 composer 的附件座位（会话作用域 list）。order 20 排在
 * 官方附件 chip（默认 0）之后、编辑框之上，看起来就是「待发送的一份内容」。
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param readers - 发送 / 新建会话的口子。
 * @param t - 绑定本包词典的翻译函数。
 * @returns 注册的清理函数。
 */
export function registerLocalFileComposer(
  slots: ComposerSlotHost,
  readers: MarkdownTurnReaders,
  t: RuntimeT,
): () => void {
  return slots.inject('conversation.input.overlay', () => slots.register(
    {
      name: 'conversation.input.overlay',
      id: LOCAL_FILE_ID,
      order: 20,
      locale: NAMESPACE,
    },
    // 座位包装层订阅 store：选文件 / 关闭时这里先重渲染，卡片以 seq 为 key
    // 重挂载——新选一个文件总是直接回到编辑态。
    () => {
      const doc = useSyncExternalStore(subscribeLocalFileDoc, getLocalFileDoc, getLocalFileDoc)
      if (doc === null) return null
      return <LocalFileComposerCard key={doc.seq} doc={doc} readers={readers} t={t} />
    },
  )) as () => void
}
