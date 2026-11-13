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

/** 只创建插件自己的详情入口，不搬运或复制宿主 React DOM。 */
export function updateAnswerUsage(header: HTMLElement, usage?: TurnUsage): void {
  let details = header.querySelector<HTMLDetailsElement>('[data-chat-power-answer-usage]')
  if (!details) {
    details = header.ownerDocument.createElement('details')
    details.setAttribute('data-chat-power-answer-usage', '')
    details.append(header.ownerDocument.createElement('summary'), header.ownerDocument.createElement('div'))
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape') { details!.open = false; details!.querySelector('summary')?.focus() }
    })
    header.insertBefore(details, header.querySelector('[data-chat-power-answer-edit]'))
  }
  const count = (n: number): string => n.toLocaleString('zh-CN')
  const valid = usage && Number.isSafeInteger(usage.totalTokens) && usage.totalTokens >= 0
  const label = valid ? `${count(usage.totalTokens)} tok` : '用量未知'
  const rows = valid ? [
    `本轮累计：${count(usage.totalTokens)} tok`,
    ...(usage.routes?.map(route => `模型：${route.provider}/${route.model}`) ?? []),
    `输入（未缓存）：${count(usage.uncachedInputTokens)} tok`,
    ...(usage.cacheReadTokens === undefined ? [] : [`缓存读取：${count(usage.cacheReadTokens)} tok`]),
    ...(usage.cacheWriteTokens === undefined ? [] : [`缓存写入：${count(usage.cacheWriteTokens)} tok`]),
    `输出：${count(usage.outputTokens)} tok`,
    ...(usage.reasoningTokens === undefined ? [] : [`其中思考：${count(usage.reasoningTokens)} tok`]),
  ] : ['本轮尚未结算，或模型未提供完整用量数据。']
  const summary = details.querySelector('summary')!
  const body = details.querySelector('div')!
  if (summary.textContent !== label) summary.textContent = label
  summary.setAttribute('aria-label', `本轮 Token 用量：${label}，展开明细`)
  const text = rows.join('\n')
  if (body.textContent !== text) body.textContent = text
}
