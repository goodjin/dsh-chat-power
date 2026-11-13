/** Host-only, admitted, read-only Chrome bookmark discovery. */
import { readFile, stat, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve, basename } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { chromeBookmarks } from './browser/state.ts'
export const name = 'chat-power-chrome-bookmarks'
export const inject = ['webServer', 'connection']
export const ROUTE = '/chat-power/chrome-bookmarks'
const MAX = 10 * 1024 * 1024
export function chromeRoot(platform = process.platform, home = homedir()): string {
  return platform === 'darwin' ? join(home, 'Library/Application Support/Google/Chrome') : platform === 'win32' ? join(process.env.LOCALAPPDATA ?? join(home, 'AppData/Local'), 'Google/Chrome/User Data') : join(home, '.config/google-chrome')
}
async function jsonFile(path: string) {
  if ((await stat(path)).size > MAX) throw new Error('书签文件超过 10 MB')
  const data = await readFile(path)
  if (data.length > MAX) throw new Error('书签文件超过 10 MB')
  return JSON.parse(data.toString('utf8'))
}
export async function readChromeBookmarks(root = chromeRoot(), profile?: string) {
  root = resolve(root)
  if (profile !== undefined) {
    if (!/^(Default|Profile \d+)$/.test(profile)) throw new Error('无效的 Chrome 用户配置')
    return { bookmarks: chromeBookmarks(await jsonFile(join(root, profile, 'Bookmarks'))), source: join(root, profile, 'Bookmarks') }
  }
  if (basename(root) === 'Bookmarks') return { bookmarks: chromeBookmarks(await jsonFile(root)), source: root }
  let names: Record<string, any> = {}
  try { names = (await jsonFile(join(root, 'Local State'))).profile?.info_cache ?? {} } catch { /* Directory scan is sufficient. */ }
  const entries = await readdir(root, { withFileTypes: true })
  const profiles = []
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^(Default|Profile \d+)$/.test(entry.name)) continue
    try { if ((await stat(join(root, entry.name, 'Bookmarks'))).isFile()) profiles.push({ id: entry.name, name: String(names[entry.name]?.name ?? entry.name) }) } catch { /* Profiles without bookmarks are omitted. */ }
  }
  return { root, profiles }
}
export function apply(ctx: any): void {
  // register returns a disposer; bind it to the plugin scope so reloads cannot
  // leave a handler holding an inactive Cordis context.
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: ROUTE, handler: async (req: IncomingMessage, res: ServerResponse) => {
    const send = (status: number, body: unknown) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
    let stage = '访问准入'
    try {
      const admission = ctx.connection.admit(req)
      if ('rejection' in admission) { send(admission.rejection, { error: '访问未获授权' }); return }
      if (req.method !== 'POST') { send(405, { error: '仅支持 POST' }); return }
      stage = '读取请求'
      const chunks: Buffer[] = []; let size = 0
      for await (const chunk of req) { const b = Buffer.from(chunk); size += b.length; if (size > 8192) { send(413, { error: '请求过大' }); return }; chunks.push(b) }
      let body: any
      try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { send(400, { error: '无效请求' }); return }
      if (!body || (body.root !== undefined && (typeof body.root !== 'string' || !body.root.trim())) || (body.profile !== undefined && typeof body.profile !== 'string')) { send(400, { error: '无效目录或用户配置' }); return }
      stage = '读取 Chrome 文件'
      send(200, await readChromeBookmarks(body.root, body.profile))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.warn(`[chat-power] Chrome bookmarks failed at ${stage}: ${detail}`)
      const inactive = /inactive context/.test(detail)
      const code = (error as NodeJS.ErrnoException)?.code
      const reason = inactive ? '书签服务上下文已失效，请退出并重新打开 DeepSeek Harness' :
        code === 'ENOENT' ? 'Chrome 目录或书签文件不存在，请检查同步设置中的路径' :
        code === 'EACCES' || code === 'EPERM' ? '当前 DSH 进程没有读取 Chrome 文件的权限' :
        error instanceof SyntaxError ? 'Chrome 书签文件不是有效的 JSON，请稍后重试' : `${stage}失败：${detail}`
      send(inactive || stage !== '读取 Chrome 文件' ? 503 : 400, { error: reason })
    }
  } }), 'chat-power-chrome-bookmarks-route')
}
