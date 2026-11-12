import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { Readable } from 'node:stream'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readChromeBookmarks, apply } from '../src/chrome-bookmarks.ts'
const dirs: string[] = []
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }) })
describe('本机 Chrome 书签读取', () => {
  it('自动发现配置、直读文件并保持原目录结构，不改写 Chrome 数据', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-power-chrome-')); dirs.push(dir)
    await mkdir(join(dir, 'Default')); await mkdir(join(dir, 'Profile 2'))
    await writeFile(join(dir, 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: '本机' } } } }))
    const file = join(dir, 'Default/Bookmarks')
    await writeFile(file, JSON.stringify({ roots: { bookmark_bar: { type: 'folder', name: '书签栏', children: [{ type: 'url', name: '文档', url: 'https://example.com' }] } } }))
    expect((await readChromeBookmarks(dir)).profiles).toEqual([{ id: 'Default', name: '本机' }])
    expect((await readChromeBookmarks(file)).bookmarks?.[0]?.children?.[0]?.url).toBe('https://example.com/')
    await expect(readChromeBookmarks(dir, '../Default')).rejects.toThrow()
  })
  it('已准入的查找请求返回完整 JSON，随后可预览书签', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-power-route-')); dirs.push(dir)
    await mkdir(join(dir, 'Default'))
    await writeFile(join(dir, 'Default/Bookmarks'), JSON.stringify({ roots: { bookmark_bar: { type: 'folder', name: '书签栏', children: [] } } }))
    let route: any
    apply({ webServer: { register: (r: any) => { route = r } }, connection: { admit: () => ({ peer: {} }) } })
    const request = async (profile?: string) => {
      const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ root: dir, profile }))]), { method: 'POST' })
      let status = 0; let body = ''
      await route.handler(req, { writeHead: (s: number) => { status = s }, end: (s: string) => { body = s } })
      expect(status).toBe(200)
      return JSON.parse(body)
    }
    expect((await request()).profiles).toEqual([{ id: 'Default', name: 'Default' }])
    expect((await request('Default')).bookmarks[0].name).toBe('书签栏')
  })
  it('未准入的请求不读取本机文件', async () => {
    let route: any
    apply({ webServer: { register: (r: any) => { route = r } }, connection: { admit: () => ({ rejection: 401 }) } })
    let status = 0; let body = ''
    await route.handler({ method: 'POST' }, { writeHead: (s: number) => { status = s }, end: (s: string) => { body = s } })
    expect(status).toBe(401); expect(body).toContain('访问未获授权')
  })
})
