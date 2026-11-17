/**
 * 回合失败行：把回合级失败直接画进轨迹。
 *
 * 背景（2026-11-17 现场）：回合失败只写进会话文件的 turn/end 事件，界面轨迹
 * 完全不显示——要知道失败原因只能翻文件。宿主自己的回合错误行依赖客户端
 * 事件流的渲染条件，实测并不总是出现；这一行独立读收尾原因，任何错误收尾都
 * 显示一行「第 N 轮失败：消息（代码）」。用户主动停（aborted）不算失败，
 * 不渲染。
 *
 * 数据面：回合候选自带收尾事件（`turn.end.data.reason`），kind='error' 时
 * `reason.error` 是结构化失败（message/code）。整条链路包 try/catch——这是
 * 浏览器半边的纪律：读不到、形状不对，就当没有失败，安静降级为不渲染。
 */

const LINE_ORDER = 6

export const TURN_FAILURE_LINE_ID = 'threadharbor-turn-failure'

/** turnTail 座位宿主的结构类型（与找回入口同一写法）。 */
interface TailSlotHost {
  inject(key: string, callback: () => (() => void) | Iterable<() => void, void, void>): () => void
  register(options: {
    name: string
    id?: string
    order?: number
    locale?: string
  }, component: unknown): () => void
}

/** 从回合候选里读出要显示的失败；没有要显示的返回 undefined。 */
export function failureOf(turn: unknown): { readonly message: string; readonly code?: string; readonly turnNumber?: number } | undefined {
  try {
    const candidate = turn as {
      turn?: unknown
      end?: { data?: { reason?: { kind?: unknown; error?: { message?: unknown; code?: unknown } } } }
    } | undefined
    const reason = candidate?.end?.data?.reason
    if (typeof reason !== 'object' || reason === null || (reason as { kind?: unknown }).kind !== 'error') return undefined
    const failure = (reason as { error?: unknown }).error
    if (typeof failure !== 'object' || failure === null) return undefined
    const message = (failure as { message?: unknown }).message
    if (typeof message !== 'string' || message === '') return undefined
    const code = (failure as { code?: unknown }).code
    const turnNumber = candidate?.turn
    return {
      message,
      ...(typeof code === 'string' && code !== '' ? { code } : {}),
      ...(typeof turnNumber === 'number' ? { turnNumber } : {}),
    }
  } catch {
    return undefined
  }
}

/** 行的样式：小字、 danger 色、贴回合尾部。 */
const lineStyle = {
  fontSize: '12px',
  lineHeight: '1.6',
  color: 'var(--dsh-color-danger, #e5484d)',
  padding: '2px 0 4px',
  userSelect: 'text',
} as const

/** 画一行失败说明；没有失败就不画（渲染 null）。 */
export function TurnFailureLine({ turn }: { readonly turn?: unknown }): React.ReactNode {
  const failure = failureOf(turn)
  if (failure === undefined) return null
  return (
    <div style={lineStyle} role="status">
      {failure.turnNumber === undefined ? '失败：' : `第 ${failure.turnNumber} 轮失败：`}
      {failure.message}
      {failure.code === undefined ? '' : `（${failure.code}）`}
    </div>
  )
}

/** 把失败行挂进轮次尾部的座位（同找回入口的注册写法）。 */
export function registerTurnFailureLine(slots: TailSlotHost): () => void {
  return slots.inject('conversation.chat.turnTail', () => slots.register(
    { name: 'conversation.chat.turnTail', id: TURN_FAILURE_LINE_ID, order: LINE_ORDER },
    (props: { readonly turn?: unknown }) => <TurnFailureLine turn={props.turn} />,
  ))
}
