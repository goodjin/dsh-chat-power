/**
 * 「这一轮真的发出去了」的信号。
 *
 * 大编辑区（输入框向上撑成半屏）在发完一轮后要让位给小框——但**怎么判断
 * 「发出去了」**是个坑：
 *
 * - 早先的判据是「输入框内容变空」。可手动把字删光也会让输入框空，于是
 *   用户在大编辑区里按删除键，稿子凭空消失、大编辑区自己收了（2026-11-18
 *   现场）。删字与发送在这里被混成了一件事。
 * - 真正的发送信号是聊天流里出现了新的用户消息。包里已有成熟的侦测
 *   （`send-watch.ts`：处理了历史渲染与发送的区分），但它在有 ctx 的地方
 *   跑；输入框浮钮那个组件只能从 DOM 拿会话，两边对不上。
 *
 * 这里给两者搭一座桥：有 ctx 的一侧在侦测到发送时发信号，另一侧收信号收起。
 * 信号按会话走——换会话不会把上一个会话的发送算到这个会话头上。
 */

/** 按会话记录的发送信号订阅。 */
const listeners = new Map<string, Set<() => void>>()

/**
 * 通知「这个会话刚发出了一轮」。
 *
 * @param sessionId - 会话 id。
 */
export function notifySent(sessionId: string): void {
  const set = listeners.get(sessionId)
  if (set === undefined) return
  for (const listener of set) {
    try { listener() } catch { /* 一个订阅者出错不该影响其他人 */ }
  }
}

/**
 * 订阅某个会话的发送信号。
 *
 * @param sessionId - 会话 id。
 * @param listener - 收到信号时调用。
 * @returns 退订函数。
 */
export function onSent(sessionId: string, listener: () => void): () => void {
  let set = listeners.get(sessionId)
  if (set === undefined) {
    set = new Set()
    listeners.set(sessionId, set)
  }
  set.add(listener)
  return () => {
    const current = listeners.get(sessionId)
    if (current === undefined) return
    current.delete(listener)
    if (current.size === 0) listeners.delete(sessionId)
  }
}
