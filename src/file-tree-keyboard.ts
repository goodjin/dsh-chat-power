/**
 * 树的键盘操作。
 *
 * 「文件管理」那棵树能全键盘用：上下移动、回车打开、左右展开折叠、Home/End
 * 跳首尾。我们那棵树原先只能鼠标点。
 *
 * 这里把「一行」抽象成一个扁平的可见行列表（深度优先，折叠的目录不出现），
 * 键盘动作在这份列表上算——这样逻辑能单独测，不依赖渲染。
 */

/** 树里的一个可见行。 */
export interface VisibleRow {
  /** 行路径（工作区相对；目录行是目录自身的路径）。 */
  readonly path: string
  /** 层级深度（根目录下的直接子项是 1）。 */
  readonly depth: number
  /** 是不是目录。 */
  readonly directory: boolean
}

/** 键盘动作的结果。 */
export interface KeyOutcome {
  /** 移动后应聚焦的行路径；undefined 表示焦点不动。 */
  readonly focus?: string
  /** 要切换展开状态的目录路径（左右键）。 */
  readonly toggle?: string
  /** 要打开的文件路径（回车）。 */
  readonly open?: string
}

/** 一层里的一个条目。 */
export interface RowEntry {
  /** 条目名。 */
  readonly name: string
  /** 条目类型。 */
  readonly type: 'file' | 'directory' | 'other'
}

/**
 * 扁平化出当前可见的行（深度优先，折叠的目录只留它自己）。
 *
 * @param entries - 每一层的条目（键是目录路径，值是该层的条目）。
 * @param expanded - 展开状态（键是目录路径）。
 * @returns 可见行，按显示顺序。
 */
export function visibleRows(
  entries: Readonly<Record<string, readonly RowEntry[]>>,
  expanded: Readonly<Record<string, boolean>>,
): VisibleRow[] {
  const rows: VisibleRow[] = []
  const walk = (parent: string, depth: number): void => {
    const children = entries[parent] ?? []
    for (const entry of children) {
      const path = parent === '' ? entry.name : `${parent}/${entry.name}`
      const directory = entry.type === 'directory'
      rows.push({ path, depth, directory })
      if (directory && expanded[path] === true) walk(path, depth + 1)
    }
  }
  walk('', 1)
  return rows
}

/**
 * 处理一次按键。
 *
 * @param rows - 当前可见的行。
 * @param focused - 当前聚焦行的路径。
 * @param key - 按键名（KeyboardEvent.key）。
 * @returns 动作结果；按键无关时 focus 为 undefined。
 */
export function handleTreeKey(rows: readonly VisibleRow[], focused: string | undefined, key: string): KeyOutcome {
  if (rows.length === 0) return {}
  const index = rows.findIndex(row => row.path === focused)
  const at = index >= 0 ? index : 0
  const current = rows[at]
  if (current === undefined) return {}
  switch (key) {
    case 'ArrowDown': {
      const next = rows[Math.min(at + 1, rows.length - 1)]
      return next === undefined || next.path === current.path ? {} : { focus: next.path }
    }
    case 'ArrowUp': {
      const previous = rows[Math.max(at - 1, 0)]
      return previous === undefined || previous.path === current.path ? {} : { focus: previous.path }
    }
    case 'Home': {
      const first = rows[0]
      return first === undefined || first.path === current.path ? {} : { focus: first.path }
    }
    case 'End': {
      const last = rows[rows.length - 1]
      return last === undefined || last.path === current.path ? {} : { focus: last.path }
    }
    case 'ArrowRight': {
      // 目录：没展开就展开，已展开就进去；文件：不动。
      if (!current.directory) return {}
      return { toggle: current.path }
    }
    case 'ArrowLeft': {
      // 目录：展开了就收起；否则回到父目录行。
      if (current.directory) return { toggle: current.path }
      const parent = parentPathOf(current.path)
      if (parent === undefined) return {}
      return { focus: parent }
    }
    case 'Enter':
    case ' ': {
      if (current.directory) return { toggle: current.path }
      return { open: current.path }
    }
    default:
      return {}
  }
}

/**
 * 某路径的父目录路径。
 *
 * @param path - 路径。
 * @returns 父目录路径；顶层条目返回 undefined。
 */
export function parentPathOf(path: string): string | undefined {
  const cut = path.lastIndexOf('/')
  if (cut <= 0) return undefined
  return path.slice(0, cut)
}
