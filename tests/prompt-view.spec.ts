import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseListing } from '../src/file-tree-lazy.tsx'
import { detectSessionRole, fetchSessionPrompt } from '../src/prompt-view-data.ts'

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

/** 假 fetch：按路径返回固定响应。 */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  return async (input: string): Promise<Response> => {
    const route = routes[input]
    if (route === undefined) throw new Error(`unexpected fetch: ${input}`)
    const status = route.status ?? 200
    const body = JSON.stringify(route.body)
    return { ok: status >= 200 && status < 300, status, json: async () => JSON.parse(body) } as Response
  }
}

describe('提示词视图', () => {
  it('注册成宿主会话视图，id 带包名前缀（不与 router 的提示词视图撞名）', () => {
    const view = source('../src/prompt-view.tsx')
    expect(view).toContain('conversation.view')
    expect(view).toContain('chat-power-prompt')
    const tools = source('../src/conversation-tools.tsx')
    expect(tools).toContain('registerPromptView')
  })

  it('router/worker 会话可编辑：路由会话与 worker 标签都算', async () => {
    const editable = await detectSessionRole('r1', fakeFetch({
      '/router/state': { body: { routerSessions: [{ sessionId: 'r1', title: 'x' }], tabs: [] } },
    }))
    expect(editable).toBe('editable')
    const worker = await detectSessionRole('w1', fakeFetch({
      '/router/state': { body: { routerSessions: [], tabs: [{ sessionId: 'w1', title: 'w' }] } },
    }))
    expect(worker).toBe('editable')
  })

  it('普通会话只读', async () => {
    const role = await detectSessionRole('plain', fakeFetch({
      '/router/state': { body: { routerSessions: [{ sessionId: 'r1', title: 'x' }], tabs: [{ sessionId: 'w1', title: 'w' }] } },
    }))
    expect(role).toBe('readonly')
  })

  it('读提示词：取生效文本与会话覆盖标记', async () => {
    const data = await fetchSessionPrompt('r1', fakeFetch({
      '/router/prompt?sessionId=r1': { body: { prompt: '你是路由器', isDefault: false } },
    }))
    expect(data).toEqual({ prompt: '你是路由器', isDefault: false })
  })

  it('保存走 PUT，请求体是 { sessionId, prompt }', async () => {
    const calls: { input: string; init?: RequestInit }[] = []
    const doFetch = (async (input: string, init?: RequestInit) => {
      calls.push({ input, init })
      return { ok: true, status: 200, json: async () => ({}) } as Response
    }) as never
    const { saveSessionPrompt } = await import('../src/prompt-view-data.ts')
    await saveSessionPrompt('r1', '新提示词', doFetch)
    expect(calls[0]!.input).toBe('/router/prompt')
    expect(calls[0]!.init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0]!.init?.body))).toEqual({ sessionId: 'r1', prompt: '新提示词' })
  })
})
