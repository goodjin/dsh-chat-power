import { fallbackT } from './locales.ts'

/** 0.2.2-rc.1 DOM 适配；保留原生节点所有权和工作步骤可见性。 */
export const ANSWER_FRAME_SELECTOR = '[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"]):not([data-turn-process-member])'
const HEIGHT = '--chat-power-answer-height'
export const ANSWER_FRAME_CSS = `
/* 耗时已在回答标题中展示，隐藏对应的原生完成提示行。 */
[data-chat-power-completed-hidden] { display: none !important; }

${ANSWER_FRAME_SELECTOR} {
  box-sizing: border-box;
  min-width: 0;
  height: var(${HEIGHT}, auto);
  overflow-y: auto;
  padding: 0 16px 14px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
${ANSWER_FRAME_SELECTOR}::before,
[data-chat-power-answer-header] {
  content: ${JSON.stringify(fallbackT('answerCard.title'))};
  display: block;
  position: sticky;
  top: 0;
  z-index: 1;
  margin: 0 -16px 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
${ANSWER_FRAME_SELECTOR}:has(> [data-chat-power-answer-header])::before { display: none; }
[data-chat-power-answer-header] { display: flex; align-items: center; gap: 12px; }
[data-chat-power-answer-edit], [data-chat-power-answer-copy] {
  margin-left: auto; border: 0; border-radius: 4px; padding: 4px;
  width: 28px; height: 28px; flex: none; display: inline-flex; align-items: center; justify-content: center;
  color: inherit; background: transparent; font: inherit; cursor: pointer;
}
[data-chat-power-answer-copy] { margin-left: 0; }
[data-chat-power-answer-edit] svg, [data-chat-power-answer-copy] svg { width: 16px; height: 16px; }
[data-chat-power-answer-edit]:hover, [data-chat-power-answer-copy]:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,.1)); }
[data-chat-power-answer-error] { font-weight: 400; font-size: 12px; }
`

/** 页内留 24px 呼吸空间；极小窗口保留标题及最小正文区。 */
export function answerFrameHeight(page: number, composer: number, latest: boolean, tailHeight = 0): number {
  return Math.max(80, Math.floor(page - 24 - (latest ? Math.max(0, composer) + Math.max(0, tailHeight) : 0)))
}

/**
 * 标题只插入插件自己的元素，不搬运 React 拥有的子节点。
 * 只测量会话视口/输入框，绝不改外层 scrollTop 或工作步骤 hidden 状态。
 */
export function installAnswerFrame(doc?: Document, onEdit?: (sessionId: string, nodeKey: string) => void, readTitle?: (sessionId: string, turn: number) => string, onCopy?: (sessionId: string, nodeKey: string) => Promise<void>): () => void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  const win = target?.defaultView
  if (!target || !win) return () => {}
  const style = target.createElement('style')
  style.dataset.pluginCss = 'chat-power-native-answer-frame'
  style.textContent = ANSWER_FRAME_CSS
  target.head.append(style)
  const managed = new Map<HTMLElement, { value: string; priority: string }>()
  const headers = new Map<HTMLElement, HTMLElement>()
  const completedRows = new Set<HTMLElement>()
  const updateTitle = (row: HTMLElement, header: HTMLElement): void => {
    const title = header.querySelector('[data-chat-power-answer-title]')
    if (!title) return
    const rawTurn = row.getAttribute('data-chat-turn')
    const turn = rawTurn === null ? NaN : Number(rawTurn)
    const sessionId = row.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
    let text = Number.isSafeInteger(turn) && turn >= 1 ? `第 ${turn} 轮 · 用时未知` : '轮次未知 · 用时未知'
    if (sessionId && Number.isSafeInteger(turn) && turn >= 1 && readTitle) {
      try { text = readTitle(sessionId, turn) } catch { /* 会话已卸载或历史未加载，保留未知提示。 */ }
    }
    if (title.textContent !== text) title.textContent = text
    const container = row.closest('[data-conversation-scroll]')
    // 只在本轮已有成功结算的标题时隐藏重复提示；停止、错误及缺失数据保留原生提示。
    const completed = text.includes(' · 用时 ')
    for (const control of container?.querySelectorAll<HTMLElement>('[data-turn-process]') ?? []) {
      if (control.getAttribute('data-turn-process') !== rawTurn) continue
      const nativeRow = control.closest<HTMLElement>('[data-chat-flow-kind="turn-process"]') ?? control
      if (completed) {
        nativeRow.setAttribute('data-chat-power-completed-hidden', '')
        completedRows.add(nativeRow)
      } else {
        nativeRow.removeAttribute('data-chat-power-completed-hidden')
        completedRows.delete(nativeRow)
      }
    }
  }
  const ensureHeader = (row: HTMLElement): void => {
    if (!onEdit || headers.get(row)?.parentElement === row) return
    headers.get(row)?.remove()
    const header = target.createElement('div')
    header.setAttribute('data-chat-power-answer-header', '')
    const title = target.createElement('span')
    title.setAttribute('data-chat-power-answer-title', '')
    const error = target.createElement('span')
    error.setAttribute('data-chat-power-answer-error', '')
    error.setAttribute('role', 'status')
    const edit = target.createElement('button')
    edit.type = 'button'
    edit.setAttribute('data-chat-power-answer-edit', '')
    edit.setAttribute('aria-label', fallbackT('answerCard.editAnswer'))
    edit.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/></svg>'
    edit.title = fallbackT('answerCard.editAnswer')
    edit.addEventListener('click', event => {
      event.stopPropagation()
      try {
        const sessionId = row.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
        const nodeKey = row.getAttribute('data-chat-node-key')
        if (!sessionId || !nodeKey) throw new Error('无法定位这条回答，请重新打开会话')
        onEdit(sessionId, nodeKey)
        error.textContent = ''
      } catch (cause) {
        error.textContent = cause instanceof Error ? cause.message : String(cause)
      }
    })
    header.append(title, error, edit)
    if (onCopy) {
      const copy = target.createElement('button')
      copy.type = 'button'
      copy.setAttribute('data-chat-power-answer-copy', '')
      copy.setAttribute('aria-label', fallbackT('answerCard.copy'))
      copy.title = fallbackT('answerCard.copy')
      copy.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg>'
      copy.addEventListener('click', event => {
        event.stopPropagation()
        if (copy.disabled) return
        copy.disabled = true
        // 同步数据读取失败与异步剪贴板拒绝都在此收口。
        void (async () => {
          try {
            const sessionId = row.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
            const nodeKey = row.getAttribute('data-chat-node-key')
            if (!sessionId || !nodeKey) throw new Error('无法定位这条回答，请重新打开会话')
            await onCopy(sessionId, nodeKey)
            error.textContent = fallbackT('answerCard.copied')
          } catch (cause) {
            error.textContent = cause instanceof Error ? cause.message : String(cause)
          } finally { copy.disabled = false }
        })().catch(cause => { console.warn('[chat-power] copy feedback:', cause) })
      })
      header.append(copy)
    }
    row.prepend(header)
    headers.set(row, header)
    updateTitle(row, header)
  }
  let stopped = false
  let pending: number | undefined
  const observed = new Set<Element>()
  const schedule = (): void => {
    if (stopped || pending !== undefined) return
    pending = win.setTimeout(() => { pending = undefined; if (!stopped) sync() }, 16)
  }
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(schedule) : undefined
  const restore = (row: HTMLElement): void => {
    const old = managed.get(row)
    if (!old) return
    if (old.value) row.style.setProperty(HEIGHT, old.value, old.priority)
    else row.style.removeProperty(HEIGHT)
    managed.delete(row)
    headers.get(row)?.remove()
    headers.delete(row)
  }
  const sync = (): void => {
    const active = new Set<HTMLElement>()
    const sizes = new Set<Element>()
    for (const container of target.querySelectorAll<HTMLElement>('[data-conversation-scroll]')) {
      sizes.add(container)
      const composer = container.querySelector<HTMLElement>('[data-composer-seat]')
      if (composer) sizes.add(composer)
      const rows = [...container.querySelectorAll<HTMLElement>(ANSWER_FRAME_SELECTOR)]
        .filter(row => row.closest('[data-conversation-scroll]') === container)
      // 新用户轮已出现但尚无回答时，上一轮回答也应恢复为整页高。
      const turns = [...container.querySelectorAll('[data-chat-turn]')]
        .map(row => Number(row.getAttribute('data-chat-turn'))).filter(Number.isFinite)
      const latestTurn = turns.length ? Math.max(...turns) : undefined
      const page = container.clientHeight
      for (const row of rows) {
        if (page <= 0) continue // 隐藏视图不写入错误的最小高度。
        active.add(row)
        ensureHeader(row)
        const header = headers.get(row)
        if (header) updateTitle(row, header)
        if (!managed.has(row)) managed.set(row, {
          value: row.style.getPropertyValue(HEIGHT), priority: row.style.getPropertyPriority(HEIGHT),
        })
        const latest = latestTurn === undefined ? row === rows.at(-1)
          : row.hasAttribute('data-chat-turn') && Number(row.getAttribute('data-chat-turn')) === latestTurn
        // 宿主点赞/复制/文件尾行也占页面高度。只测回答之后的实际流行；
        // composer 是 sticky，不能用它的屏幕 top 推导正常流间距。
        const bottom = row.getBoundingClientRect().bottom
        let tailHeight = 0
        if (latest) for (const tail of container.querySelectorAll<HTMLElement>('[data-chat-flow-kind]')) {
          if (row.contains(tail) || tail.closest('[data-conversation-scroll]') !== container) continue
          if (!(row.compareDocumentPosition(tail) & 4)) continue
          const rect = tail.getBoundingClientRect()
          if (rect.height > 0) tailHeight = Math.max(tailHeight, rect.bottom - bottom)
          sizes.add(tail)
        }
        const height = `${answerFrameHeight(page, composer?.getBoundingClientRect().height ?? 0, latest, tailHeight)}px`
        if (row.style.getPropertyValue(HEIGHT) !== height) row.style.setProperty(HEIGHT, height)
      }
    }
    for (const row of managed.keys()) if (!active.has(row)) restore(row)
    for (const node of observed) if (!sizes.has(node)) { resize?.unobserve(node); observed.delete(node) }
    for (const node of sizes) if (!observed.has(node)) { resize?.observe(node); observed.add(node) }
  }
  const mutations = new win.MutationObserver(schedule)
  mutations.observe(target.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['data-chat-turn', 'data-chat-flow-kind', 'data-chat-group-part', 'data-turn-process-member', 'hidden'],
  })
  // 起止事件可先于 DOM 更新到达；定时只更新标题，不做布局测量。
  const titleTimer = win.setInterval(() => {
    if (!stopped) for (const [row, header] of headers) if (row.isConnected) updateTitle(row, header)
  }, 1000)
  win.addEventListener('resize', schedule)
  sync()
  return () => {
    stopped = true
    if (pending !== undefined) win.clearTimeout(pending)
    win.clearInterval(titleTimer)
    mutations.disconnect()
    resize?.disconnect()
    win.removeEventListener('resize', schedule)
    for (const row of managed.keys()) restore(row)
    for (const row of completedRows) row.removeAttribute('data-chat-power-completed-hidden')
    completedRows.clear()
    style.remove()
  }
}
