/**
 * 会话选区工具栏：占住宿主文本交互座位 `conversation.chat.text-interaction`。
 *
 * 宿主 0.2.2 起把「选中文字 → 弹出引用钮」做成了标准座位：用户选区稳定后，
 * 宿主的 useTextInteraction 钩子派发手势，第一个开台的交互 id 胜出，然后在
 * `[data-text-interaction-surface]` 浮层里用 `entryKey` 渲染胜出插件的座位项。
 * 官方引用钮（`@deepseek-ai/dsh-message-quotes`）就是其中一个 occupant，key 为
 * `quote`，点它调 `inputActions.insertQuote` 把选中文字变成输入框里的引用卡。
 *
 * **占位的办法**：本组件往同一个座位注册一个 **key 仍为 `quote`** 的 React 组件——
 * 座位按 key 寻址，同名 key 后者顶替前者，于是本组件替换掉官方引用钮，但**交互
 * 规则**（何时弹、弹在哪、会话是否可写）仍复用官方那条 `quote` 交互（本组件不
 * 注册交互，白拿它的准入判断）。效果：
 * - 选中文字 → 宿主表面弹出**一条**工具栏：`引用 · 复制 · 发送会话 · 编辑 · 多选`；
 * - 「引用」走 `inputActions.insertQuote`，**与官方效果完全一致**（同一个 QuoteNode、
 *   输入框里同一张可移除引用卡、发送时同一套 Markdown 引用块序列化）；
 * - 「复制」把选中文字写进剪贴板，并在底部浮出短提示；
 * - 后三钮复用本包 store（openSelectionEdit / addMultiItem / remote.sendToSession）。
 *
 * 定位、收台、读选中文字全由宿主 useTextInteraction 提供，本组件不管位置。
 *
 * 为什么其余按钮也放这儿：宿主表面是「单选」的——同一时刻只有一个交互能占据它。
 * 本组件顶替了官方引用钮，就也得自带「复制/发送/编辑/多选」，否则那些功能
 * 会随官方钮一起消失。多选收集面板是独立浮层（跨多次选择续存），由
 * selection-actions.ts 的 startMultiSelectPanel 单独驱动，不挂本组件。
 */
import { createElement } from 'react'
import type { ComponentType, ReactElement } from 'react'
import { IconEditOutlineRegular, IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  addMultiItem,
  currentSessionIdFromDom,
  openSelectionEdit,
} from './selection-actions.ts'
import { copyTextToClipboard } from './send-actions.ts'
import type { RuntimeT } from './locales.ts'
import { NAMESPACE } from './locales.ts'
import css from './selection-toolbar.module.css'

/** 座位项 key：与官方引用钮同名，顶替它占住文本交互表面。 */
export const SELECTION_TOOLBAR_KEY = 'quote'

/** 发送动作签名：发往指定会话的正文（队列模式，与文件阅读区同一条通道）。 */
export type SelectionSend = (sessionId: string, text: string) => void

/** 「引用」图标（描边，与官方引用卡引号同一语汇；颜色随文字）。 */
const ICON_QUOTE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 3.5c-2 0-3.5 1.6-3.5 3.7 0 2 1.4 3.3 3.1 3.3.3 0 .6 0 .7-.1-.3 1.3-1.4 2.4-2.8 2.7l.6 1.1c2.7-.7 4.6-3 4.6-6.1 0-2.6-1.4-4.6-3.7-4.6Zm6.4 0c-2 0-3.5 1.6-3.5 3.7 0 2 1.4 3.3 3.1 3.3.3 0 .6 0 .7-.1-.3 1.3-1.4 2.4-2.8 2.7l.6 1.1c2.7-.7 4.6-3 4.6-6.1 0-2.6-1.4-4.6-3.7-4.6Z" fill="currentColor"/></svg>'

/** 「多选」图标：复选框（圆角方框里一道勾），表达「把这段勾进收藏、可多段累积」。 */
const ICON_LAYERS = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" data-icon="checkbox"><rect x="2.5" y="2.5" width="11" height="11" rx="2" stroke="currentColor" stroke-width="1.3"/><path d="M4.8 8.2 l2.2 2.2 l4.2 -4.6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** 「复制」图标（两张叠放的纸，与上面的复选框一眼分开；颜色随文字）。 */
const ICON_COPY = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M10.5 3.5H4.3c-.4 0-.8.4-.8.8v6.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>'

/** 工具栏按钮定义：动作 id、图标（空串表示用 primitives 组件）、文案键。 */
interface ToolbarButton {
  readonly action: string
  readonly icon: string
  readonly labelKey: string
}

/** 五个按钮：引用、复制（直接取用选中文字）在前，随后发送/编辑/多选。 */
const BUTTONS: readonly ToolbarButton[] = [
  { action: 'quote', icon: ICON_QUOTE, labelKey: 'selection.quote' },
  { action: 'copy-selection', icon: ICON_COPY, labelKey: 'selection.copy' },
  { action: 'send-to-chat', icon: '', labelKey: 'selection.sendToChat' },
  { action: 'edit-selection', icon: '', labelKey: 'selection.edit' },
  { action: 'multi-add', icon: ICON_LAYERS, labelKey: 'selection.multiAdd' },
]

/** 图标名 → 组件（宿主 primitives 提供的描边图标）。 */
const ICON_COMPONENTS: Record<string, ComponentType<{ size?: number }>> = {
  'send-to-chat': IconSendOutlineRegular,
  'edit-selection': IconEditOutlineRegular,
}

/** 宿主座位项拿到的 props：表面手势 + 注入的服务（与官方引用钮同款）。 */
export interface TextInteractionProps {
  /** 触发来源（选区 / 右键）；本工具栏只在选区触发时出现。 */
  trigger?: string
  /** 读当前选中的文字；不在选区时返回 null。 */
  readText: () => string | null
  /** 收台：隐藏表面。 */
  dismiss: () => void
  /** 清掉浏览器选区。 */
  clearSelection: () => void
  /** 输入框动作面：insertQuote 与官方引用钮同一条路。 */
  inputActions?: { insertQuote(text: string): boolean }
  /** 会话订阅器（官方引用钮用它判断是否可写；本工具栏复用同一准入）。 */
  useSession?: unknown
  /** 绑定本包词典的翻译函数。 */
  t?: RuntimeT
  /** 发送动作（注册时经闭包注入；缺省时发送钮静默收台）。 */
  send?: SelectionSend
}

/** 复制反馈浮层的样式；自带注入，不依赖多选面板是否启动。材质走宿主语义 token。 */
const COPY_TOAST_CSS = [
  '.dshca-copy-toast{position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:80;',
  'padding:6px 14px;border-radius:8px;background:var(--dsw-alias-toast-bg,rgb(48 48 54 / 94%));',
  'color:var(--dsw-alias-toast-label,#fff);font-size:12px;pointer-events:none}',
].join('')

const COPY_TOAST_STYLE_ID = 'dshca-copy-toast-style'

/** 在页面底部中间浮出一段短提示，到时自消。非浏览器环境安静跳过。 */
export function showCopyToast(text: string): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(COPY_TOAST_STYLE_ID) === null) {
    const style = document.createElement('style')
    style.id = COPY_TOAST_STYLE_ID
    style.dataset.plugin = 'dsh-chat-power'
    style.dataset.pluginCss = 'dsh-chat-power/copy-toast'
    style.textContent = COPY_TOAST_CSS
    document.head.appendChild(style)
  }
  // 同一时刻只留一条：连续点复制时旧提示先摘掉，避免叠成一串。
  document.querySelectorAll('[data-dshca-copy-toast]').forEach(el => el.remove())
  const toast = document.createElement('div')
  toast.className = 'dshca-copy-toast'
  toast.dataset.dshcaCopyToast = ''
  toast.setAttribute('role', 'status')
  toast.textContent = text
  document.body.appendChild(toast)
  window.setTimeout(() => { toast.remove() }, 1500)
}

/**
 * 把选中的文字写进剪贴板，返回应提示的文案。
 *
 * 复用 send-actions 的统一入口（缺失/被拒都返回 false、绝不抛错）；成功与失败
 * 各自走词典文案，调用方只管把结果浮出来。
 * @param text - 当前选中的文字。
 * @param t - 绑定本包词典的翻译函数。
 * @returns 「已复制」或「复制失败，请手动复制」。
 */
export async function copySelectionText(text: string, t: RuntimeT): Promise<string> {
  const ok = await copyTextToClipboard(text)
  return ok ? t('selection.copied') : t('selection.copyFailed')
}

/**
 * 选区工具栏组件。宿主在表面里渲染它（entryKey=`quote`），点击后自行收台。
 * @param props - 表面手势、注入服务与发送动作。
 * @returns 工具栏 JSX。
 */
export function SelectionToolbar(props: TextInteractionProps): ReactElement {
  const { readText, dismiss, clearSelection, inputActions, t, send } = props
  const translate = t ?? ((key: string) => key)

  const run = (action: string): void => {
    const text = readText()
    if (text === null || text === '') { dismiss(); return }
    const sessionId = currentSessionIdFromDom()
    switch (action) {
      case 'quote':
        // 与官方引用钮完全同位、同效：insertQuote → 清选区 → 收台。
        if (inputActions?.insertQuote(text) === false) return
        clearSelection()
        dismiss()
        return
      case 'copy-selection': {
        // 复制是无声操作：写剪贴板后浮出「已复制 / 复制失败」短提示。
        // 提示是独立浮层，不随工具栏收起消失；异步结果就地兜底，绝不裸 void。
        void copySelectionText(text, translate).then(message => {
          try { showCopyToast(message) } catch { /* 非浏览器环境忽略 */ }
        }).catch(() => {
          try { showCopyToast(translate('selection.copyFailed')) } catch { /* 非浏览器环境忽略 */ }
        })
        clearSelection()
        dismiss()
        return
      }
      case 'send-to-chat':
        // 发送走 remote（队列模式，与文件阅读区同一条通道）。readers 在注册时
        // 经闭包注入；拿不到就静默收台。
        if (send !== undefined && sessionId !== undefined) send(sessionId, text)
        clearSelection()
        dismiss()
        return
      case 'edit-selection':
        openSelectionEdit(text, false, sessionId)
        clearSelection()
        dismiss()
        return
      case 'multi-add': {
        const sel = window.getSelection()
        if (sel === null || sel.rangeCount === 0) { dismiss(); return }
        addMultiItem(text, sel.getRangeAt(0).cloneRange(), sessionId)
        clearSelection()
        dismiss()
        return
      }
    }
  }

  return createElement('div', {
    className: css.selbar,
    'data-dshcaSelbar': '',
    role: 'toolbar',
    'aria-label': translate('selection.toolbarLabel'),
  },
    BUTTONS.flatMap((button, index) => {
      const label = translate(button.labelKey)
      const IconComponent = ICON_COMPONENTS[button.action]
      const children = [
        button.icon !== ''
          ? createElement('span', { className: css.icon, key: 'icon', dangerouslySetInnerHTML: { __html: button.icon } })
          : null,
        IconComponent !== undefined
          ? createElement(IconComponent, { size: 14, key: 'icon-component' })
          : null,
        createElement('span', { className: css.label, key: 'label' }, label),
      ].filter(Boolean)
      const items: (ReactElement | string)[] = [
        createElement('button', {
          key: button.action,
          type: 'button',
          className: css.btn,
          'data-action': button.action,
          onClick: () => { run(button.action) },
        }, children),
      ]
      // 引用/复制（直接取用选中文字）与其余功能之间放一道细分隔线：
      // 引用是官方同位的主操作，复制是紧随其后的取用动作，发送/编辑/多选是另一组。
      if (index === 1) items.push(createElement('span', { key: 'divider', className: css.divider, 'aria-hidden': 'true' }))
      return items
    }),
  )
}

/** 注册 seats 宿主回调的最小结构（与 session-id-bar 同款抽象）。 */
interface TextInteractionSlotHost {
  inject(key: string, callback: () => unknown): unknown
  register(options: Record<string, unknown>, component: unknown): unknown
}

/**
 * 把选区工具栏注册进宿主文本交互座位，顶替官方引用钮。
 *
 * **不**注册交互——官方 `quote` 交互仍管「何时弹、弹在哪、会话是否可写」，本组件
 * 只是它开台后渲染的那个 occupant（同 key 顶替）。座位**必须先声明**才能 register：
 * 宿主 0.2.2 的 conversation.chat.text-interaction 是 keyed 座位，注册前若未声明
 * 会抛、inject 回调永不触发（静默不渲染，2026-11 现场）。
 *
 * @param slots - 座位宿主（`ctx.slots`）。
 * @param t - 绑定本包词典的翻译函数。
 * @param send - 发送动作（读不到 remote 时缺省，发送钮静默收台）。
 * @returns 注册的清理函数。
 */
export function registerSelectionToolbar(
  slots: TextInteractionSlotHost,
  t: RuntimeT,
  send?: SelectionSend,
): () => void {
  return slots.inject('conversation.chat.text-interaction', () => slots.register(
    {
      name: 'conversation.chat.text-interaction',
      key: SELECTION_TOOLBAR_KEY,
      // 宿主 keyed 座位同 key 同 priority 会抛「already has an entry」并把官方
      // message-quotes 整条入口拽挂（boot 报 1 entry did not activate）。官方
      // 引用钮未写 priority（=0），这里压到 -10：同 key 不同 priority 合法，
      // 最低者渲染（宿主报错文本原话 lowest renders），本工具栏遮蔽官方钮。
      priority: -10,
      locale: NAMESPACE,
    },
    (props: TextInteractionProps) => createElement(SelectionToolbar, { ...props, t, send }),
  )) as () => void
}
