/**
 * 「本轮文件」入口——注册进宿主的点赞栏那排（`conversation.chat.assistant-actions` 插槽，
 * 渲染在已定稿助手消息的 IconActions 行内），排在末尾。
 *
 * 与 turnTail 里的文件列表分工：这里只是**入口**（显示「本轮文件 · N」+ 展开箭头），
 * 真正的列表在 turnTail 块里、展开时显示在点赞栏下方。两处共享 `markdown-turn-active` 的
 * 展开态与个数：本入口改态，turnTail 块读态渲染列表。个数由 turnTail 块加载后写入 store。
 */
import { createElement, useRef } from 'react'
import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { getFilesCount, getFilesOpen, setFilesOpen, subscribeFilesOpen } from './markdown-turn-active.ts'
import { NAMESPACE, type RuntimeT } from './locales.ts'
import css from './markdown-turn-chip.module.css'

/** 当前会话编号（从会话根节点读，与本包其它注册一致）。 */
function sessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

export interface ExpandFilesChipProps {
  readonly t: RuntimeT
}

/** 点赞栏那排的「本轮文件」入口按钮。没有本轮文件时（count 为 0）不渲染。 */
export function ExpandFilesChip(props: ExpandFilesChipProps): ReactNode {
  const t = props.t
  const sessionId = sessionIdFromDom()
  const chipRef = useRef<HTMLButtonElement>(null)
  const open = useSyncExternalStore(
    subscribeFilesOpen,
    () => sessionId !== undefined ? getFilesOpen(sessionId) : false,
    () => false,
  )
  const count = useSyncExternalStore(
    subscribeFilesOpen,
    () => sessionId !== undefined ? getFilesCount(sessionId) : 0,
    () => 0,
  )
  // 个数未加载（0）或本就无改动文件时，不占位——点赞栏那排保持干净。
  if (sessionId === undefined || count === 0) return null

  const toggle = (): void => {
    const next = !open
    setFilesOpen(sessionId, next)
    // 只动「自己这一轮」的 turnTail（入口在点赞栏里，用 closest 找准，别误选到别的轮）。
    const tail = chipRef.current?.closest('[data-turn-tail]')
    if (tail !== null && tail !== undefined) {
      if (next) tail.setAttribute('data-files-open', '')
      else tail.removeAttribute('data-files-open')
    }
  }

  return (
    <button
      type="button"
      ref={chipRef}
      className={css.chip}
      data-files-chip=""
      data-open={open ? '' : undefined}
      aria-expanded={open}
      onClick={toggle}
    >
      {t('markdownTurn.filesGroup', { count: String(count) })}
      <span aria-hidden="true">{open ? ' ▾' : ' ▸'}</span>
    </button>
  )
}

/** 入口组件的最小 props 类型（注册用）。 */
export interface RegisterExpandFilesChipOptions {
  readonly t: RuntimeT
}

/** 入口组件在 assistant-actions 座位里的 id。 */
export const EXPAND_FILES_CHIP_ID = 'chat-power-expand-files-chip'

/** assistant-actions 座位的最小结构类型（与本包其它注册一致）。 */
interface AssistantActionsSlotHost {
  inject(key: string, callback: () => unknown): unknown
  register(options: {
    name: string
    id?: string
    order?: number
    locale?: string
  }, component: unknown): () => void
}

/**
 * 把「本轮文件」入口注册进点赞栏那排（`conversation.chat.assistant-actions` 插槽）。
 *
 * 该插槽声明在已定稿助手消息的 IconActions 行内，条目经 display:contents 平排进那一排，
 * 入口靠 CSS `order` 顶到末尾（复制 / 点赞 / 分支之后）。注册失败不拖累其它表面。
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param options - 绑定本包词典的翻译函数。
 * @returns 注册的清理函数。
 */
export function registerExpandFilesChip(slots: AssistantActionsSlotHost, options: RegisterExpandFilesChipOptions): () => void {
  return slots.inject('conversation.chat.assistant-actions', () => slots.register(
    {
      name: 'conversation.chat.assistant-actions',
      id: EXPAND_FILES_CHIP_ID,
      order: 100,
      locale: NAMESPACE,
    },
    () => createElement(ExpandFilesChip, { t: options.t }),
  )) as () => void
}
