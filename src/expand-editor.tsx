/**
 * 会话输入框的「大编辑区」——直接改造宿主自带的 composer，不另起第二个框。
 *
 * 宿主 composer 是单行、回车即发送的 Lexical 内容editable。本插件不做替代编辑器，
 * 只干两件事：
 *
 * 1. **把宿主 composer 撑成半屏高**。新会话（宿主 hero 阶段）默认就大、居中偏下；
 *    普通会话时 composer 仍是小框，输入框上方一枚**向上箭头**浮钮，点一下把宿主
 *    composer 撑成半屏（再点收起）。撑高靠全局样式命中宿主稳定锚点
 *    （`data-composer-card` / `data-input-scroll`），不动宿主结构。
 *
 * 2. **大编辑区里回车换行、只有发送按钮才发**。宿主 composer 原生支持 Shift+回车
 *    换行，但普通回车是提交。于是在「大编辑区」状态（hero 或已展开）拦掉普通回车，
 *    合成一个 Shift+回车喂给 Lexical，让它自己插软换行——不碰 Lexical 内部节点，
 *    宿主升级最不易坏。发送仍走宿主自己的发送按钮，草稿天然同步、发送逻辑不用重写。
 *
 * 箭头浮钮注册在 composer 的 `conversation.input.overlay` 座位（与本机文件卡同思路）：
 * 该座位渲染在 composer 卡片顶部一个 0 高的绝对定位锚点里，浮钮以 `top:-40px` 浮在
 * 卡片上沿**之外**，不压输入框文字。
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { NAMESPACE, type RuntimeT } from './locales.ts'
import css from './expand-editor.module.css'

/** 展开大编辑区后，挂在宿主 composer 卡片上的标记类名（全局样式据此撑高）。 */
export const BIG_CLASS = 'dshcp-big'

/** 箭头浮钮的稳定类名（全局样式据此在 hero 阶段隐藏）。 */
export const TOGGLE_CLASS = 'dshcp-composer-toggle'

/** 座位条目 id；只用自己的 id，不占别人的格子。 */
export const EXPAND_EDITOR_ID = 'chat-power-expand-editor'

/**
 * 当前是否处于「大编辑区」状态：宿主 hero 阶段（新会话）天然是大编辑区；
 * 或普通会话时用户已点箭头展开（卡片挂了 `BIG_CLASS`）。
 * 纯函数，单测钉住。
 */
export function isBigMode(card: Element | null, phase: string | undefined): boolean {
  if (phase === 'hero') return true
  return card !== null && card.classList.contains(BIG_CLASS)
}

/**
 * 普通回车是否应被改写成换行。仅「大编辑区」里的裸回车改写：Shift/Ctrl/Meta/Alt
 * 修饰的回车、输入法组词中、已被处理过的键、非回车键一律放过，交给宿主 / Lexical。
 * 纯函数，单测钉住。
 */
export function shouldRedirectEnterToNewline(
  e: { key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; defaultPrevented: boolean; isComposing?: boolean },
  composing: boolean,
): boolean {
  if (e.defaultPrevented) return false
  if (e.key !== 'Enter') return false
  if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return false
  if (composing || e.isComposing === true) return false
  return true
}

/** 宿主 composer 卡片（撑高目标）。 */
function composerCardFromDom(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-composer-card]')
}

/** 会话内容区元素；读 `data-content-phase` 判断是否 hero（新会话）。 */
function conversationContentFromDom(): Element | null {
  return typeof document === 'undefined' ? null : document.querySelector('[data-conversation-content]')
}

/** 当前阶段：hero（新会话）/ composer / active / settling / undefined。 */
function phaseFromDom(): string | undefined {
  return conversationContentFromDom()?.getAttribute('data-content-phase') ?? undefined
}

/** 宿主 composer 的输入表面（Lexical 内容editable）；合成 Shift+回车喂给它。 */
function composerInputFromDom(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.querySelector<HTMLElement>('[data-composer-input]')
}

/**
 * 在大编辑区状态下，把普通回车改写成软换行。
 *
 * 做法：捕获阶段拦掉宿主对这次回车的提交（`stopPropagation` 让 Lexical 的
 * KEY_ENTER 命令永不派发），再合成一个 Shift+回车派发到输入框——Lexical 原生
 * 就支持 Shift+回车软换行，于是走它自己的路径插换行，草稿与发送都不受影响。
 * `inserting` 标记防止合成事件回头又被自己拦一次。
 *
 * @returns 清理函数。
 */
export function installEnterInterceptor(): () => void {
  if (typeof document === 'undefined') return () => {}
  let composing = false
  let inserting = false
  const onCompositionStart = (): void => { composing = true }
  const onCompositionEnd = (): void => { composing = false }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (inserting) return
    if (!isBigMode(composerCardFromDom(), phaseFromDom())) return
    if (!shouldRedirectEnterToNewline(event, composing)) return
    const input = composerInputFromDom()
    if (input === null) return
    event.preventDefault()
    // 阻断宿主对这次回车的提交：Lexical 的 KEY_ENTER 命令挂在输入框自身的 keydown
    // 上，捕获阶段于 document 止传播即可让它不触发，宿主提交逻辑（keyboard.submit）因此不跑。
    event.stopPropagation()
    inserting = true
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
        composed: true,
      }))
    } finally {
      inserting = false
    }
  }
  document.addEventListener('compositionstart', onCompositionStart)
  document.addEventListener('compositionend', onCompositionEnd)
  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    document.removeEventListener('compositionstart', onCompositionStart)
    document.removeEventListener('compositionend', onCompositionEnd)
    document.removeEventListener('keydown', onKeyDown, true)
  }
}

/**
 * 把宿主 composer 撑成半屏高的全局样式注入页面 head。
 *
 * 只命中宿主稳定锚点（`data-conversation-content` / `data-composer-card` /
 * `data-input-scroll`），不改宿主结构；颜色不写死（此处只调尺寸与布局）。
 * 与 table-pad.ts / ui-theme.ts 同一套 data 标记去重约定。
 */
export const COMPOSER_SIZE_CSS = `
[data-conversation-content][data-content-phase="hero"] [data-conversation-scroll]{justify-content:flex-end !important}
[data-conversation-content][data-content-phase="hero"] [data-composer-card]{min-height:50vh !important;display:flex !important;flex-direction:column !important}
[data-conversation-content][data-content-phase="hero"] [data-composer-card] [data-input-scroll]{flex:1 1 auto !important;max-height:none !important;min-height:0 !important}
[data-composer-card].${BIG_CLASS}{min-height:50vh !important;display:flex !important;flex-direction:column !important}
[data-composer-card].${BIG_CLASS} [data-input-scroll]{flex:1 1 auto !important;max-height:none !important;min-height:0 !important}
[data-content-phase="hero"] .${TOGGLE_CLASS}{display:none}
`.trim()

/** 注入标记；重复注入与诊断都靠它。 */
export const COMPOSER_SIZE_TAG = 'dsh-chat-power/composer-size'

/** 注入 composer 撑高样式；已注入过则跳过，非浏览器环境安静返回。 */
export function injectComposerSizeCss(doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  if (target === undefined) return
  if (target.querySelector(`style[data-plugin-css="${COMPOSER_SIZE_TAG}"]`) !== null) return
  const style = target.createElement('style')
  style.dataset.plugin = 'dsh-chat-power'
  style.dataset.pluginCss = COMPOSER_SIZE_TAG
  style.textContent = COMPOSER_SIZE_CSS
  target.head.appendChild(style)
}

/** 当前会话编号（composer 座位 props 不带，从会话根节点读；与本包其它注册一致）。 */
function currentSessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/**
 * 箭头浮钮。普通会话时浮在输入框上方，点了把宿主 composer 撑成半屏、再点收起；
 * 新会话（hero）时输入框本就大，浮钮由全局样式隐藏。展开时聚焦宿主输入框。
 */
export function ExpandEditor(props: { readonly t: RuntimeT }): ReactNode {
  const [big, setBig] = useState(false)
  const t = props.t

  // 装上回车拦截：仅在大编辑区状态改写回车，普通小框回车的宿主行为原样保留。
  useEffect(() => installEnterInterceptor(), [])

  const toggle = (): void => {
    const card = composerCardFromDom()
    if (card === null) return
    const nowBig = card.classList.toggle(BIG_CLASS)
    setBig(nowBig)
    if (nowBig) composerInputFromDom()?.focus()
  }

  const label = big ? t('expand.close') : t('expand.open')
  return (
    <button
      type="button"
      className={`${css.toggle} ${TOGGLE_CLASS}`}
      data-expand-toggle=""
      data-big={big ? '' : undefined}
      aria-label={label}
      title={label}
      onClick={toggle}
    >
      {big ? <IconChevronDownOutlineRegular size={18} /> : <IconChevronUpOutlineRegular size={18} />}
    </button>
  )
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

/**
 * 把箭头浮钮注册进 composer 的 overlay 列座位（输入框上方）。
 *
 * 用 overlay 列座位（而非单席 attachments）的原因与本机文件卡一致：它是会话
 * 作用域的 list 槽位、每会话必渲染，且锚点就在 composer 卡片顶部。
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param options - 绑定本包词典的翻译函数。
 * @returns 注册的清理函数。
 */
export function registerExpandEditor(slots: ComposerSlotHost, options: { readonly t: RuntimeT }): () => void {
  return slots.inject('conversation.input.overlay', () => slots.register(
    {
      name: 'conversation.input.overlay',
      id: EXPAND_EDITOR_ID,
      order: 10,
      locale: NAMESPACE,
    },
    () => {
      const sessionId = currentSessionIdFromDom()
      if (sessionId === undefined) return null
      // 按 sessionId 挂 key：换会话时组件整体重挂载，展开态自然复位。
      return <ExpandEditor key={sessionId} t={options.t} />
    },
  )) as () => void
}
