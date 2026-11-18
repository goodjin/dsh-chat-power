/**
 * 工作区目录的变更监听（自动刷新用）。
 *
 * 「文件管理」那棵树会在根目录与展开中的目录上挂监听，文件一变就自己重画；
 * 我们那棵树原先只在你点开文件夹时读一次，之后一直是你打开那一刻的样子——
 * 你在会话里让模型改了文件，工作区文件这边不会自己变，很容易以为改动没落地。
 *
 * 监听走宿主现成的目录变更流（`workspaceFiles.changes`）：宿主给的是
 * 「哪些条目变了」的通知，收到后我们重读那一层即可（目录小，重读比逐条比对
 * 简单可靠）。
 *
 * 只监听**展开着的**目录：折叠的目录没人看，监听它只是白费资源；根目录永远
 * 展开，所以永远在监听。
 */

/** 一条变更通知。宿主给的帧形状是 `{ value: { kind }, accept() }`。 */
export interface WatchFrame {
  readonly value?: { readonly kind?: string }
  accept?(): void
}

/** 远程变更流订阅的最小面。 */
export interface ChangesRemote {
  changes(sessionId: string, path: string, signal: AbortSignal): AsyncIterable<WatchFrame>
}

/** 远程流容器的最小面。 */
export interface StreamLike {
  dispose(): Promise<void> | void
  [Symbol.asyncIterator](): AsyncIterator<WatchFrame>
}

/** 远程 `$stream` 的最小面。 */
export interface StreamRemote {
  $stream(options: {
    name: string
    open: (lifetime: AbortSignal) => AsyncIterable<WatchFrame>
    ended: () => Error
  }): StreamLike
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 从远程对象里取出目录变更的订阅面。
 *
 * @param holder - 远程对象（`ctx.get('remote')`）。
 * @returns 订阅面；能力不可用时 undefined。
 */
export function changesRemote(holder: unknown): ChangesRemote | undefined {
  if (!isRecord(holder)) return undefined
  const files = holder.workspaceFiles
  if (!isRecord(files) || typeof files.changes !== 'function') return undefined
  return { changes: files.changes.bind(files) as ChangesRemote['changes'] }
}

/**
 * 监听一个目录的变更，直到取消。
 *
 * @param params.host - 远程对象。
 * @param params.sessionId - 会话 id。
 * @param params.path - 工作区相对路径（根目录传空串）。
 * @param params.signal - 取消信号。
 * @param params.onChange - 收到变更通知（已就绪也算一次）时调用。
 */
export async function watchDirectory(params: {
  host: unknown
  sessionId: string
  path: string
  signal: AbortSignal
  onChange: () => void
}): Promise<void> {
  const changes = changesRemote(params.host)
  if (changes === undefined) return
  const streamRemote = isRecord(params.host) && typeof params.host.$stream === 'function'
    ? params.host as unknown as StreamRemote
    : undefined
  if (streamRemote === undefined) return
  const aborted = (): boolean => params.signal.aborted
  if (aborted()) return
  let stream: StreamLike | undefined
  try {
    stream = streamRemote.$stream({
      name: `chat-power directory ${params.path === '' ? '.' : params.path}`,
      open: (lifetime) => changes.changes(params.sessionId, params.path === '' ? '.' : params.path, lifetime),
      ended: () => new Error(`Directory watch ended: ${params.path}`),
    })
    const onAbort = (): void => { void stream?.dispose() }
    params.signal.addEventListener('abort', onAbort, { once: true })
    try {
      for await (const frame of stream) {
        if (aborted()) return
        const kind = frame.value?.kind
        // ready 表示监听已就绪——此刻目录内容可能已经变了，重读一次最保险。
        if (kind === 'ready') frame.accept?.()
        params.onChange()
      }
    } finally {
      params.signal.removeEventListener('abort', onAbort)
    }
  } catch {
    // 监听失败（能力不可用、目录被删、连接断了）：静默退回「不自动刷新」，
    // 不能把异常抛出去打断整棵树的渲染。
  } finally {
    try { await stream?.dispose() } catch { /* 流已结束 */ }
  }
}
