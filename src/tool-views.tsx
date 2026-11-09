/**
 * 把三个工具注册成**会话视图**。
 *
 * 宿主在 `conversation.view` 座位上收所有视图，并把它们画进会话顶部那一行
 * 「对话 / 轨迹」标签里（视图数超过一个时那一行才出现）。我们把工作区文件、
 * 浏览器、终端注册成视图，那一行就由宿主统一管：视图多了会自动出现，
 * 宽度不够会收进「更多」菜单，我们不再自己画一行标签。
 *
 * 视图 id 带包名前缀，避免和别的插件撞名（宿主不去重：撞 id 会出现两个同名
 * 标签，其中一个还点不动）。
 */
import { createElement, type ReactNode } from 'react'
import { fallbackT } from './locales.ts'

/** 视图 id（带包名前缀，防撞名）。 */
export const VIEW_IDS = {
  files: 'chat-power-files',
  browser: 'chat-power-browser',
  terminal: 'chat-power-terminal',
} as const

/** 视图对应的座位名：视图声明它，座位负责把内容画出来。 */
export const VIEW_SEATS = {
  files: 'chat-power.tool.files',
  browser: 'chat-power.tool.browser',
  terminal: 'chat-power.tool.terminal',
} as const

/** 视图 id 对应的工具种类。 */
export type ToolViewKind = keyof typeof VIEW_IDS

/** 视图顺序：排在宿主的对话（0）与轨迹之后。 */
const VIEW_ORDER: Record<ToolViewKind, number> = { files: 10, browser: 11, terminal: 12 }

/**
 * 注册三个工具视图。
 *
 * @param ctx - 插件上下文（要 slots 与 locale）。
 * @param render - 画某个工具内容的函数（会话 id + 种类 → 元素）。
 * @returns 注销函数。
 */
export function registerToolViews(
  ctx: any,
  render: (props: any, kind: ToolViewKind) => ReactNode,
): () => void {
  const disposers: (() => void)[] = []
  for (const kind of ['files', 'browser', 'terminal'] as const) {
    const seat = VIEW_SEATS[kind]
    // 座位：视图声明它，这里负责把内容画出来。
    disposers.push(ctx.slots.register({
      name: seat,
      id: `chat-power-tool-${kind}`,
    }, (props: any) => render(props, kind)))
    // 视图：宿主按 id 把它收进会话顶部那一行标签。
    disposers.push(ctx.slots.register({
      name: 'conversation.view',
      id: VIEW_IDS[kind],
      order: VIEW_ORDER[kind],
      label: () => fallbackT(`tools.${kind}` as never),
      children: { [seat]: { kind: 'single', scope: 'session' } },
    }))
  }
  return () => { for (const dispose of disposers) dispose() }
}

/** 视图 id → 工具种类。 */
export function toolKindOfView(viewId: string): ToolViewKind | undefined {
  for (const kind of ['files', 'browser', 'terminal'] as const) {
    if (VIEW_IDS[kind] === viewId) return kind
  }
  return undefined
}

/** 一个工具入口（图标 + 文案），新会话画入口按钮时用。 */
export interface ToolEntryView {
  readonly kind: ToolViewKind
  readonly label: string
  readonly icon: string
}

/** 三个入口的定义（图标 + 文案）。 */
export function toolEntries(icons: Record<string, string>): ToolEntryView[] {
  return (['files', 'browser', 'terminal'] as const).map(kind => ({
    kind,
    label: fallbackT(`tools.${kind}` as never),
    icon: icons[kind] ?? '',
  }))
}

export { createElement }
