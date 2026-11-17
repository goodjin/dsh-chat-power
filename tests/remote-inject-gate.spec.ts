/**
 * remote 命名空间的 inject 门（2026-11-17 现场：编辑回答 → 创建新会话报
 * 「cannot get property "remote.workspace" without inject」）。
 *
 * 宿主浏览器侧的 remote 是 cordis 的 traceable 服务代理：读 `remote.workspace`
 * 会被解析成 `ctx['remote.workspace']`，而 cordis 对未写进本插件 inject 的
 * 服务名**直接抛错**（不是返回 undefined）。所以 `isRecord(holder.workspace)`
 * 这类守卫拦不住它——属性访问本身就炸。
 *
 * 旧测试用裸对象当 remote，永远测不出这道门。这里按宿主真实语义造一个
 * 「只放行 inject 里声明过的 remote.<ns>」的守卫代理，并把**源码里真实的
 * inject 声明**喂给它：声明漏了哪个命名空间，走到那条路就当场红。
 *
 * inject 声明从 src/index.ts 的文本里取（那是纯字符串数组字面量）：整图
 * import index.ts 会拉进 mermaid 等重依赖并在 node 环境挂住，不值得。
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createMarkdownTurnReaders } from '../src/markdown-turn-sources.ts'

/** 源码里真实的 inject 声明（export const inject = [...] as const）。 */
function declaredInject(): string[] {
  const src = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  const m = src.match(/export const inject\s*=\s*\[([^\]]*)\]/)
  expect(m, 'src/index.ts 必须导出 inject 数组').not.toBeNull()
  return [...m![1]!.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]!)
}

/** 按 cordis traceable + ReflectService 的语义守卫 remote 的命名空间读取。 */
function guardedRemote(target: Record<string, unknown>, declared: readonly string[]): unknown {
  return new Proxy(target, {
    get(t, prop) {
      if (typeof prop !== 'string') return Reflect.get(t, prop)
      const key = `remote.${prop}`
      if (!declared.includes(key)) {
        throw new Error(`cannot get property "${key}" without inject`)
      }
      return Reflect.get(t, prop)
    },
  })
}

/** 能建会话、能查工作区的最小 remote（形状与 new-session-cwd.spec 同源）。 */
function minimalRemote() {
  const createCalls: unknown[] = []
  const base = {
    workspace: {
      async *follow() {
        yield { type: 'baseline', value: { items: [{ workspaceId: 'mine', sessionIds: ['s1'] }] } }
      },
    },
    session: {
      async list() { return { items: [{ sessionId: 's1', cwd: '/x' }] } },
      async create(args: unknown) {
        createCalls.push(args)
        return { ok: true, value: { sessionId: 'session-new' } }
      },
      async prompt() { return { ok: true } },
    },
    workspaceFiles: {},
  }
  return { base, createCalls }
}

describe('remote 命名空间读取必须被 inject 声明覆盖', () => {
  it('编辑回答 → 创建新会话：穿过宿主 inject 门仍能继承工作区', async () => {
    const { base, createCalls } = minimalRemote()
    const remote = guardedRemote(base, declaredInject())
    const readers = createMarkdownTurnReaders(() => remote)
    const newId = await readers.createSession({ inheritCwdFrom: 's1' })
    expect(newId).toBe('session-new')
    expect(createCalls).toEqual([{ workspaceId: 'mine' }])
  })

  it('编辑回答 → 发送到当前会话：session 面同样穿门可用', async () => {
    const { base } = minimalRemote()
    const remote = guardedRemote(base, declaredInject())
    const readers = createMarkdownTurnReaders(() => remote)
    await expect(readers.sendToSession('s1', '改后的回答')).resolves.toBeUndefined()
  })
})