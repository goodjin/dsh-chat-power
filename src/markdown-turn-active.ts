/**
 * 会话区文件操作区共享的「当前作用文件」状态。
 *
 * turnTail 里每个文档各自展开/折叠；共享 store 同时服务文档卡的编辑/展开按钮
 * 「现在该对哪个文件作用」。这里存两样东西：
 *   1. 当前作用的文件路径（哪个文件最近被点开/激活）；
 *   2. 每个文件的展开/编辑状态——共享栏的「编辑/展开」按钮和文档自己的内联按钮
 *      改的是同一份，存在这里才能让两处同步、不各改各的。
 *
 * 不存内容、不存 readers——职责单一，可独立测试。`useSyncExternalStore` 直接吃这套
 * 接口；SSR 下没有 window，getSnapshot 退回安全空值。
 */

export interface FileUiState {
  readonly open: boolean
  readonly editing: boolean
}

const EMPTY_STATE: FileUiState = { open: false, editing: false }

let activePath: string | null = null
const fileStates = new Map<string, FileUiState>()
const listeners = new Set<() => void>()

/** 当前作用的文件路径；没有时为 null。 */
export function getActiveFilePath(): string | null {
  return activePath
}

/**
 * 设置当前作用文件。设成与现在相同的路径不通知（避免无谓重渲染）；
 * 设成 null 清除。传非字符串按 null 处理，调用方拿到的永远是 string|null。
 * @param path - 要激活的文件路径，或 null/undefined 清除。
 */
export function setActiveFilePath(path: string | null | undefined): void {
  const next = typeof path === 'string' && path.length > 0 ? path : null
  if (next === activePath) return
  activePath = next
  emit()
}

/** 清除激活文件与其 UI 状态，回到初始空状态。 */
export function resetActiveFilePath(): void {
  activePath = null
  fileStates.clear()
  emit()
}

/** 订阅：激活路径或任一文件 UI 状态变化时回调。返回退订函数。 */
export function subscribeActiveFilePath(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 某文件的展开/编辑状态；没设置过返回共享空值（open=false, editing=false）。 */
export function getFileState(path: string): FileUiState {
  return fileStates.get(path) ?? EMPTY_STATE
}

/** 直接写某文件的 UI 状态并通知。 */
export function setFileState(path: string, next: FileUiState): void {
  fileStates.set(path, next)
  emit()
}

/** 切换某文件的展开态，保留编辑态。 */
export function toggleFileOpen(path: string): void {
  const state = getFileState(path)
  setFileState(path, { open: !state.open, editing: state.editing })
}

/** 切换某文件的编辑态，保留展开态。 */
export function toggleFileEditing(path: string): void {
  const state = getFileState(path)
  setFileState(path, { open: state.open, editing: !state.editing })
}

function emit(): void {
  for (const listener of listeners) listener()
}

/**
 * 「本轮文件」是否展开（入口在点赞栏那排，列表在其下方；两处共享这一态）。
 * 按 sessionId 存，换会话自然复位。与上面的 activePath / fileStates 共用同一监听集。
 */
const filesOpenBySession = new Map<string, boolean>()

/** 某会话的本轮文件是否展开；没设置过返回 false。 */
export function getFilesOpen(sessionId: string): boolean {
  return filesOpenBySession.get(sessionId) ?? false
}

/** 设置某会话的展开态；值不变不通知。 */
export function setFilesOpen(sessionId: string, open: boolean): void {
  if (getFilesOpen(sessionId) === open) return
  filesOpenBySession.set(sessionId, open)
  emit()
}

/** 订阅展开态变化（与 activePath 共用监听集，任一处变化都会回调）。返回退订函数。 */
export function subscribeFilesOpen(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 某会话「本轮文件」的个数（入口在点赞栏那排显示）；没设置过返回 0。 */
const filesCountBySession = new Map<string, number>()

export function getFilesCount(sessionId: string): number {
  return filesCountBySession.get(sessionId) ?? 0
}

/** 设置某会话的本轮文件个数；值不变不通知。 */
export function setFilesCount(sessionId: string, count: number): void {
  if (getFilesCount(sessionId) === count) return
  filesCountBySession.set(sessionId, count)
  emit()
}
