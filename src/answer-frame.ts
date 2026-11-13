import { fallbackT } from './locales.ts'

/** 0.2.2-rc.1 DOM 适配；保留原生节点所有权和工作步骤可见性。 */
export const ANSWER_FRAME_SELECTOR = '[data-chat-flow-kind="assistant-step"]:not([data-chat-group-part="reasoning"]):not([data-turn-process-member])'
const HEIGHT = '--chat-power-answer-height'
export const ANSWER_FRAME_CSS = `
${ANSWER_FRAME_SELECTOR} {
  box-sizing: border-box;
  min-width: 0;
  height: var(${HEIGHT}, auto);
  overflow-y: auto;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1, transparent);
}
${ANSWER_FRAME_SELECTOR}::before {
  content: ${JSON.stringify(fallbackT('answerCard.title'))};
  display: block;
  position: sticky;
  top: -14px;
  z-index: 1;
  margin: -14px -16px 14px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.2));
  background: var(--dsw-alias-bg-layer-1, #fff);
  color: var(--dsw-alias-label-secondary, inherit);
  font-size: 13px;
  line-height: 20px;
  font-weight: 600;
}
`

/** 页内留 24px 呼吸空间；极小窗口保留标题及最小正文区。 */
export function answerFrameHeight(page: number, composer: number, latest: boolean): number {
  return Math.max(80, Math.floor(page - 24 - (latest ? Math.max(0, composer) : 0)))
}

/**
 * 标题用伪元素，既不插入也不搬运 React 拥有的子节点。
 * 只测量会话视口/输入框，绝不改外层 scrollTop 或工作步骤 hidden 状态。
 */
export function installAnswerFrame(doc?: Document): () => void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document)
  const win = target?.defaultView
  if (!target || !win) return () => {}
  const style = target.createElement('style')
  style.dataset.pluginCss = 'chat-power-native-answer-frame'
  style.textContent = ANSWER_FRAME_CSS
  target.head.append(style)
  const managed = new Map<HTMLElement, { value: string; priority: string }>()
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
        if (!managed.has(row)) managed.set(row, {
          value: row.style.getPropertyValue(HEIGHT), priority: row.style.getPropertyPriority(HEIGHT),
        })
        const latest = latestTurn === undefined ? row === rows.at(-1)
          : row.hasAttribute('data-chat-turn') && Number(row.getAttribute('data-chat-turn')) === latestTurn
        const height = `${answerFrameHeight(page, composer?.getBoundingClientRect().height ?? 0, latest)}px`
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
  win.addEventListener('resize', schedule)
  sync()
  return () => {
    stopped = true
    if (pending !== undefined) win.clearTimeout(pending)
    mutations.disconnect()
    resize?.disconnect()
    win.removeEventListener('resize', schedule)
    for (const row of managed.keys()) restore(row)
    style.remove()
  }
}
