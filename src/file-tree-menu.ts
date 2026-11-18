/**
 * 工作区文件树的右键菜单。
 *
 * 「文件管理」那棵树的行有右键菜单：文件行给的是通用操作，文件夹行和根路径给的是
 * 「在本机显示」「复制路径」这类目录操作。我们原先只有左键。
 *
 * 菜单本身是宿主提供的（`contextMenus` 服务 + 共享菜单组件）——我们不自己造一套
 * 弹窗，只**注册自己的动作**：菜单的样式、键盘操作、定位都由宿主那份负责。
 */

/** 我们注册的目标类别。宿主按 kind 匹配注册方，kind 相同才一起显示。 */
export const FILE_MENU_KIND = 'chat-power.workspace-file'
/** 目录目标类别。 */
export const DIRECTORY_MENU_KIND = 'chat-power.workspace-directory'

/** 菜单目标携带的信息。 */
export interface WorkspaceFileTarget {
  /** 会话 id。 */
  readonly sessionId: string
  /** 工作区相对路径。 */
  readonly path: string
  /** 是不是目录。 */
  readonly directory: boolean
}

/** 菜单服务里我们用到的部分。 */
export interface ContextMenusLike {
  register(input: {
    id: string
    target: string
    order?: number
    resolve: (target: unknown, signal: AbortSignal) => Promise<unknown[]> | unknown[]
  }): () => void
  open(target: unknown, point: { x: number; y: number }): void
}

/** 一条菜单动作。 */
export interface MenuAction {
  /** 稳定 id。 */
  readonly id: string
  /** 显示文字。 */
  readonly label: string
  /** 可选图标（宿主按 key 找图标组件）。 */
  readonly icon?: { key: string }
  /** 点击时执行。 */
  readonly run: () => void
}

/** 注册动作时要用的回调面。 */
export interface MenuHandlers {
  /** 复制路径到剪贴板。 */
  copyPath(path: string): void
  /** 在本机文件管理器里显示。 */
  reveal(path: string): void
  /** 取路径的完整绝对形式（根 + 相对路径）。 */
  absolutePath(sessionId: string, path: string): string
}

/**
 * 取菜单目标里的路径信息。
 *
 * @param target - 菜单捕获的目标。
 * @returns 目标信息；形状不对时 undefined。
 */
export function targetOf(target: unknown): WorkspaceFileTarget | undefined {
  if (typeof target !== 'object' || target === null) return undefined
  const value = (target as { value?: unknown }).value
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  const sessionId = record.sessionId
  const path = record.path
  if (typeof sessionId !== 'string' || typeof path !== 'string') return undefined
  return { sessionId, path, directory: record.directory === true }
}

/**
 * 造出这个目标的菜单动作。
 *
 * @param target - 目标信息。
 * @param handlers - 动作回调。
 * @returns 动作列表。
 */
export function actionsFor(target: WorkspaceFileTarget, handlers: MenuHandlers): MenuAction[] {
  const absolute = handlers.absolutePath(target.sessionId, target.path)
  const actions: MenuAction[] = [
    { id: 'copy-path', label: '复制路径', run: () => handlers.copyPath(absolute) },
  ]
  if (target.directory) {
    actions.unshift({ id: 'reveal', label: '在本机显示', run: () => handlers.reveal(absolute) })
  }
  return actions
}

/**
 * 注册工作区文件的右键菜单动作。
 *
 * @param menus - 菜单服务。
 * @param handlers - 动作回调。
 * @returns 注销函数。
 */
export function registerWorkspaceFileMenu(menus: ContextMenusLike, handlers: MenuHandlers): () => void {
  const remove = menus.register({
    id: 'chat-power.workspace-file',
    target: FILE_MENU_KIND,
    order: 10,
    resolve: (target) => {
      const info = targetOf(target)
      if (info === undefined) return []
      return actionsFor(info, handlers)
    },
  })
  const removeDirectory = menus.register({
    id: 'chat-power.workspace-directory',
    target: DIRECTORY_MENU_KIND,
    order: 10,
    resolve: (target) => {
      const info = targetOf(target)
      if (info === undefined) return []
      return actionsFor(info, handlers)
    },
  })
  return () => { remove(); removeDirectory() }
}

/**
 * 造出一行的右键触发属性。
 *
 * @param target - 目标信息。
 * @returns 属性对象（挂到按钮上即可）。
 */
export function rowMenuProps(target: WorkspaceFileTarget): Record<string, unknown> {
  return {
    'data-context-menu-trigger': '',
    'data-chat-file-menu': target.directory ? DIRECTORY_MENU_KIND : FILE_MENU_KIND,
  }
}
