/**
 * 提示词视图的数据层：会话角色判定 + 会话系统提示词的读/写。
 *
 * 数据与写回走 Router 插件的宿主路由（`/router/state`、`/router/prompt` ✓）——
 * 那是「当前生效系统提示词」的唯一权威来源 ✓。Router 未安装时（路由 404 ✓）
 * 一切按只读处理 ✓。
 *
 * 接口形状与 dsh-router 逐字对齐（GET `/router/prompt?sessionId=` ✓、
 * PUT `/router/prompt` `{ sessionId, prompt }` ✓、空 prompt = 清除覆盖回落默认 ✓）。
 */

/** fetch 的最小面（真实 fetch 满足它，测试里的假 fetch 也满足）。 */
export interface FetchLike {
  (input: string, init?: RequestInit): Promise<Response>
}

const STATE_PATH = '/router/state'
const PROMPT_PATH = '/router/prompt'

/** 会话角色：router/worker 会话可编辑；普通会话只读。 */
export type PromptSessionRole = 'editable' | 'readonly'

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * 判定会话角色：router 会话（`routerSessions` ✓）与 worker 会话（`tabs` ✓）
 * 可编辑；其余只读。Router 未安装或查询失败时抛错（调用方按只读 + 说明处理）。
 */
export async function detectSessionRole(sessionId: string, doFetch: FetchLike): Promise<PromptSessionRole> {
  const response = await doFetch(STATE_PATH, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`router state ${response.status}`)
  const body = await readJson(response)
  if (!isRecord(body)) throw new Error('router: state response missing body')
  const sessions = Array.isArray(body['routerSessions']) ? (body['routerSessions'] as unknown[]) : []
  const tabs = Array.isArray(body['tabs']) ? (body['tabs'] as unknown[]) : []
  const editable = [...sessions, ...tabs].some(
    row => isRecord(row) && row['sessionId'] === sessionId,
  )
  return editable ? 'editable' : 'readonly'
}

/** 当前生效的系统提示词（会话覆盖，无覆盖时为全局默认）。 */
export interface SessionPrompt {
  readonly prompt: string
  /** true = 无会话覆盖，当前显示的是全局默认。 */
  readonly isDefault: boolean
}

/** 读当前会话生效的系统提示词。 */
export async function fetchSessionPrompt(sessionId: string, doFetch: FetchLike): Promise<SessionPrompt> {
  const response = await doFetch(`${PROMPT_PATH}?sessionId=${encodeURIComponent(sessionId)}`, {
    headers: { accept: 'application/json' },
  })
  if (!response.ok) throw new Error(`router prompt ${response.status}`)
  const body = await readJson(response)
  const prompt = isRecord(body) && typeof body['prompt'] === 'string' ? body['prompt'] : ''
  const isDefault = isRecord(body) && body['isDefault'] === true
  return { prompt, isDefault }
}

/** 保存会话覆盖；prompt 传空串 = 清除覆盖、回落全局默认。 */
export async function saveSessionPrompt(sessionId: string, prompt: string, doFetch: FetchLike): Promise<void> {
  const response = await doFetch(PROMPT_PATH, {
    method: 'PUT',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, prompt }),
  })
  if (!response.ok) throw new Error(`router prompt save ${response.status}`)
}
