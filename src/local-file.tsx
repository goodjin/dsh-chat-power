/** Local-file entry bridge into the shared composer editor. */
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { openComposerEdit } from './composer-edit-state.ts'
import type { ReactNode } from 'react'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'

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
  const current = useRef(props)
  current.current = props
  useLayoutEffect(() => {
    const id = current.current.sessionId ?? currentSessionIdFromDom()
    if (!id) return
    const p = current.current
    openComposerEdit({ sessionId: id, title: p.doc.name, text: p.doc.text,
      save: p.onSave, reveal: p.onReveal,
      send: async (body, target) => {
        const destination = target === 'new' ? await p.readers.createSession({ inheritCwdFrom: id }) : id
        await p.readers.sendToSession(destination, `${p.t('markdownTurn.localFileHeader', { name: p.doc.name })}\n\n${body}`)
        p.onSent?.()
      },
      onClose: () => { if (p.onClose) p.onClose(); else setLocalFileDoc(null) },
    })
  }, [props.doc.seq])
  return null
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
