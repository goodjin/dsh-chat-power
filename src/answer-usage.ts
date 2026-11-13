/** 宿主 0.2.2-rc.1 的 turn-tail.tokenUsage 投影。 */
export interface TurnUsage {
  totalTokens: number
  uncachedInputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  reasoningTokens?: number
  routes?: readonly { provider: string; model: string }[]
}

const DATABASE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></svg>'
export function compactTokens(value: number): string {
  const scaled = (n: number): string => String(n >= 100 ? Math.round(n) : Math.round(n * 10) / 10)
  return value < 1000 ? String(value) : value < 1e6 ? `${scaled(value / 1000)}K` : `${scaled(value / 1e6)}M`
}

/** 自有节点复现原生用量入口，Popover 顶层避免被回答框的滚动裁切。 */
export function updateAnswerUsage(header: HTMLElement, usage?: TurnUsage): void {
  const doc = header.ownerDocument
  let details = header.querySelector<HTMLDetailsElement>('[data-chat-power-answer-usage]')
  if (!details) {
    details = doc.createElement('details')
    details.setAttribute('data-chat-power-answer-usage', '')
    const summary = doc.createElement('summary')
    summary.innerHTML = DATABASE_ICON + '<span></span>'
    summary.setAttribute('aria-haspopup', 'dialog')
    const panel = doc.createElement('div')
    panel.setAttribute('role', 'dialog')
    panel.setAttribute('aria-label', '本轮 Token 用量')
    details.append(summary, panel)
    const root = details
    const close = (): void => {
      if (typeof panel.hidePopover === 'function' && panel.matches(':popover-open')) panel.hidePopover()
      root.open = false
      summary.setAttribute('aria-expanded', 'false')
    }
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') { close(); summary.focus() }
    })
    if (typeof panel.showPopover === 'function') {
      panel.setAttribute('popover', 'auto')
      summary.addEventListener('click', event => {
        event.preventDefault()
        if (root.open) { close(); return }
        root.open = true
        panel.showPopover()
        const rect = summary.getBoundingClientRect()
        const win = doc.defaultView!
        const box = panel.getBoundingClientRect()
        panel.style.left = `${Math.max(12, Math.min(rect.right - box.width, win.innerWidth - box.width - 12))}px`
        panel.style.top = `${Math.max(12, Math.min(rect.bottom + 8, win.innerHeight - box.height - 12))}px`
        summary.setAttribute('aria-expanded', 'true')
      })
      panel.addEventListener('toggle', () => {
        root.open = panel.matches(':popover-open')
        summary.setAttribute('aria-expanded', String(root.open))
      })
    }
    header.insertBefore(details, header.querySelector('[data-chat-power-answer-edit]'))
  }
  const count = (n: number): string => n.toLocaleString('zh-CN')
  const valid = usage && Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0
  const label = valid ? `用量 ${compactTokens(usage.totalTokens)} tok` : '用量不可用'
  const rows: [string, string][] = valid ? [
    ...(usage.routes?.length ? [['模型', usage.routes.map(route => `${route.provider}/${route.model}`).join(', ')] as [string, string]] : []),
    ...(usage.cacheReadTokens !== undefined && usage.totalTokens > usage.outputTokens
      ? [['缓存命中率', `${Math.round(usage.cacheReadTokens / (usage.totalTokens - usage.outputTokens) * 1000) / 10}%`] as [string, string]] : []),
    ['输入（未缓存）', `${count(usage.uncachedInputTokens)} tok`],
    ...(usage.cacheReadTokens === undefined ? [] : [['缓存读取', `${count(usage.cacheReadTokens)} tok`] as [string, string]]),
    ...(usage.cacheWriteTokens === undefined ? [] : [['缓存写入', `${count(usage.cacheWriteTokens)} tok`] as [string, string]]),
    ['输出', `${count(usage.outputTokens)} tok`],
    ...(usage.reasoningTokens === undefined ? [] : [['其中思考', `${count(usage.reasoningTokens)} tok`] as [string, string]]),
  ] : [['说明', '宿主未提供本轮完整用量。模型未上报或历史数据不完整时无法准确统计，不代表用量为零。']]
  const summary = details.querySelector('summary')!
  const labelNode = summary.querySelector('span')!
  if (labelNode.textContent !== label) labelNode.textContent = label
  summary.setAttribute('aria-label', `本轮 Token 用量：${label}，展开明细`)
  const body = details.querySelector('div')!
  const signature = JSON.stringify(rows) + label
  if (body.dataset.usage === signature) return
  body.dataset.usage = signature
  const title = doc.createElement('div')
  title.setAttribute('data-chat-power-usage-title', '')
  const heading = doc.createElement('span')
  heading.textContent = '本轮用量'
  const total = doc.createElement('span')
  total.textContent = valid ? `${count(usage.totalTokens)} tok` : '未知'
  title.append(heading, total)
  const list = doc.createElement('dl')
  for (const [label, value] of rows) {
    const term = doc.createElement('dt')
    term.textContent = label
    const detail = doc.createElement('dd')
    detail.textContent = value
    list.append(term, detail)
  }
  body.replaceChildren(title, list)
}
