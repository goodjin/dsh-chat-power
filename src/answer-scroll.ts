/** 补齐插件新增内滚动区的记忆；外层只补恢复“底部”，中间阅读锚点仍归宿主。 */
export function createAnswerScrollMemory(doc: Document, answerSelector: string) {
  const win = doc.defaultView!
  type Position = { top: number; bottom: boolean }
  type Binding = { key: string; pending?: Position; timers: number[]; outer: boolean }
  const memory = new Map<string, Position>()
  const bindings = new Map<HTMLElement, Binding>()
  let stopped = false
  const keyOf = (el: HTMLElement): string | undefined => {
    const session = el.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
    if (!session) return
    if (el.matches('[data-conversation-scroll]')) return JSON.stringify([session, 'outer'])
    const node = el.getAttribute('data-chat-node-key')
    return node ? JSON.stringify([session, 'answer', node]) : undefined
  }
  const position = (el: HTMLElement): Position => ({
    top: el.scrollTop, bottom: el.scrollHeight - el.clientHeight - el.scrollTop <= 24,
  })
  const cancel = (binding: Binding): void => {
    for (const timer of binding.timers) win.clearTimeout(timer)
    binding.timers = []
    binding.pending = undefined
  }
  const land = (el: HTMLElement, binding: Binding): void => {
    if (stopped || !el.isConnected || keyOf(el) !== binding.key || !binding.pending || el.clientHeight <= 0) return
    const saved = binding.pending
    el.scrollTop = saved.bottom ? Math.max(0, el.scrollHeight - el.clientHeight)
      : Math.min(saved.top, Math.max(0, el.scrollHeight - el.clientHeight))
  }
  const refresh = (): void => {
    const active = new Set<HTMLElement>()
    for (const el of doc.querySelectorAll<HTMLElement>(`[data-conversation-scroll],${answerSelector}`)) {
      const key = keyOf(el)
      if (!key || el.clientHeight <= 0) continue
      active.add(el)
      let binding = bindings.get(el)
      if (binding?.key !== key) {
        if (binding) cancel(binding)
        binding = { key, timers: [], outer: el.matches('[data-conversation-scroll]') }
        bindings.set(el, binding)
        const saved = memory.get(key)
        if (saved && (!binding.outer || saved.bottom)) {
          binding.pending = saved
          const current = binding
          // 宿主布局/恢复效果及 ResizeObserver 在不同帧到达，短暂收敛后让出控制。
          for (const delay of [32, 96, 240]) current.timers.push(win.setTimeout(() => {
            land(el, current)
            if (delay === 240) { current.pending = undefined; current.timers = [] }
          }, delay))
        }
      }
      land(el, binding)
    }
    for (const [el, binding] of bindings) if (!active.has(el)) { cancel(binding); bindings.delete(el) }
  }
  const scroll = (event: Event): void => {
    const el = event.target as HTMLElement | null
    if (!el) return
    const binding = bindings.get(el)
    // 切换时复用同一 DOM 的旧滚动事件不能覆盖新会话，也不读已卸载节点的零位置。
    if (!binding || binding.pending || !el.isConnected || keyOf(el) !== binding.key || el.clientHeight <= 0) return
    memory.set(binding.key, position(el))
  }
  const input = (event: Event): void => {
    if (event instanceof win.KeyboardEvent && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return
    const node = event.target as Element | null
    const session = node?.closest?.('[data-conversation-session]')
    if (!session) return
    for (const [el, binding] of bindings) if (session.contains(el)) cancel(binding)
  }
  doc.addEventListener('scroll', scroll, true)
  for (const kind of ['wheel', 'touchstart', 'pointerdown', 'keydown']) doc.addEventListener(kind, input, { capture: true, passive: true })
  return {
    refresh,
    dispose() {
      stopped = true
      doc.removeEventListener('scroll', scroll, true)
      for (const kind of ['wheel', 'touchstart', 'pointerdown', 'keydown']) doc.removeEventListener(kind, input, true)
      for (const binding of bindings.values()) cancel(binding)
      bindings.clear()
      memory.clear()
    },
  }
}
