/** Read-only bookmark discovery; old Host generations may not have this route yet. */
import type { Bookmark } from './state.ts'
export type ChromeResult = { bookmarks: Bookmark[] } | { root: string; profiles: { id: string; name: string }[] }
const reload = '书签读取接口尚未加载，请退出并重新打开 DeepSeek Harness 后重试；Web 版请重启 DSH 服务'
export async function requestChrome(root?: string, profile?: string, send: typeof fetch = fetch): Promise<ChromeResult> {
  const response = await send('/chat-power/chrome-bookmarks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ root: root || undefined, profile }) })
  // A missing route returns an empty 404/405, rather than a JSON error body.
  if (response.status === 404 || response.status === 405) throw new Error(reload)
  if (response.status === 401 || response.status === 403) throw new Error('读取书签未获授权，请重新登录 DSH 后重试')
  const text = await response.text()
  if (!text.trim()) throw new Error(`书签读取接口返回空响应（HTTP ${response.status}），请重启 DSH 后重试`)
  let result: any
  try { result = JSON.parse(text) } catch { throw new Error(`书签读取接口返回了无效响应（HTTP ${response.status}），请重启 DSH 后重试`) }
  if (!response.ok) throw new Error(typeof result?.error === 'string' ? result.error : `读取书签失败（HTTP ${response.status}）`)
  if (result && (Array.isArray(result.bookmarks) || (typeof result.root === 'string' && Array.isArray(result.profiles) && result.profiles.every((p: any) => typeof p?.id === 'string' && typeof p?.name === 'string')))) return result
  throw new Error('书签读取接口返回的数据格式不正确，请重启 DSH 后重试')
}
