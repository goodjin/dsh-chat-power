/**
 * 树里「当前文件」的定位，以及根路径的显示拆分。
 *
 * - **当前文件**：你正在编辑/预览的那个文件，它所在的目录要自动展开、那一行要
 *   标出来。否则关掉编辑回到工作区文件，几十个文件里找不到刚改的是哪个。
 * - **根路径**：会话的工作目录（宿主那棵树在标题行显示它）。目录段弱化、
 *   最后一段高亮，跟宿主的 PathLabel 一致。
 */

/** 根路径的显示拆分。 */
export interface RootPathView {
  /** 目录段（弱化显示）。 */
  readonly directories: readonly string[]
  /** 最后一段（主色显示）。 */
  readonly leaf: string
}

/**
 * 拆根路径：目录段弱化、末段高亮。
 *
 * @param root - 根路径（绝对路径）。
 * @returns 拆分结果；路径为空时目录段与末段都为空。
 */
export function rootPathView(root: string | undefined): RootPathView {
  if (root === undefined || root === '') return { directories: [], leaf: '' }
  const normalized = root.replace(/\/+$/, '')
  const parts = normalized.split('/').filter(part => part !== '')
  if (parts.length === 0) return { directories: [], leaf: normalized }
  const leaf = parts[parts.length - 1] ?? normalized
  const directories = parts.slice(0, -1)
  return { directories, leaf }
}

/**
 * 当前文件是否落在某一行上。
 *
 * @param rowPath - 行的路径（工作区相对）。
 * @param currentPath - 当前打开的文件（工作区相对）；没有则不高亮。
 * @returns 是否是当前文件。
 */
export function isCurrentRow(rowPath: string, currentPath: string | undefined): boolean {
  if (currentPath === undefined || currentPath === '') return false
  return rowPath === currentPath
}

/**
 * 当前文件的祖先目录（要自动展开的那些）。
 *
 * @param currentPath - 当前打开的文件（工作区相对）。
 * @returns 从浅到深的祖先目录路径。
 */
export function ancestorsOf(currentPath: string | undefined): string[] {
  if (currentPath === undefined || currentPath === '') return []
  const parts = currentPath.split('/').filter(part => part !== '')
  if (parts.length <= 1) return []
  const ancestors: string[] = []
  let prefix = ''
  for (const part of parts.slice(0, -1)) {
    prefix = prefix === '' ? part : `${prefix}/${part}`
    ancestors.push(prefix)
  }
  return ancestors
}
