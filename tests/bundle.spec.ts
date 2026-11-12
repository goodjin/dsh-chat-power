/**
 * 构建产物能不能装进页面。
 *
 * 这是**唯一**能提前发现的致命错误：DSH 把 exports["./client"] 那个文件原样塞进
 * 页面的模块表，格式是「window.__ModuleLoader__.load({ id, factory })」。产物要是
 * 没套这层壳、id 写错、或者 factory 一执行就抛，页面在下次启动时会在装配审计里
 * 直接把整页判成失败——不是少一个功能，是打不开界面。
 *
 * 所以这里按页面的方式执行一遍产物：把 lib/client.js 当文本读进来、在只给了
 * `window` 的沙箱里求值（不走 vitest 模块图，免得它去解析产物里对页面模块的
 * require），取出 factory → 用页面给的 require 取 react / primitives → 调 apply →
 * 看它有没有把会话 ID 条与文件阅读区注册进各自的座位。
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { MARKDOWN_TAIL_ID } from '../src/markdown-turn.tsx'

/** 会话头部工具行（会话作用域 list 插槽）。 */

const BUNDLE_PATH = fileURLToPath(new URL('../lib/client.js', import.meta.url))

/** 把产物当文本求值，取出它登记的工厂行（模拟 window.__ModuleLoader__.load）。 */
function loadBundleRow(): { id: string; factory: (require: (specifier: string) => unknown) => Record<string, unknown> } {
  const src = readFileSync(BUNDLE_PATH, 'utf8')
  const rows: { id: string; factory: (require: (specifier: string) => unknown) => Record<string, unknown> }[] = []
  const sandboxWindow = { __ModuleLoader__: { load: (row: typeof rows[number]) => { rows.push(row) } } }
  // 产物顶层只引用 window（factory 体内的 require/module/exports 由工厂参数提供）。
  const evaluate = new Function('window', src)
  evaluate(sandboxWindow)
  expect(rows.length, '产物必须调用一次 window.__ModuleLoader__.load').toBe(1)
  return rows[0]!
}

describe('lib/client.js 是页面能装的产物', () => {
  it('登记了正确的 id，factory 执行后 apply 能注册会话 ID 条', () => {
    const row = loadBundleRow()
    expect(row.id).toBe('@goodjin2/dsh-chat-power')

    // 页面给的 require 只能取到模块表里有的东西：react 与页面提供的 primitives
    // （答案卡片 / 文件阅读区用的图标与组件）。其余外置模块不该再要。
    const react = { createElement: () => null } as unknown as object
    const primitivesStub = new Proxy({}, { get: () => () => null })
    const loaded = row.factory((specifier: string) => {
      if (specifier === 'react-dom') return { createPortal: () => null }
      if (specifier.startsWith('@deepseek-ai/dsh-client-ui-sidebar-')) return { apply: () => {}, inject: [] }
      if (specifier === 'react' || specifier === 'react/jsx-runtime') return react
      if (specifier === '@deepseek-ai/dsh-client-ui-primitives') return primitivesStub
      throw new Error(`产物请求了模块表外的模块：${specifier}`)
    })
    expect(typeof loaded?.apply, '产物必须导出 apply').toBe('function')

    const injected: string[] = []
    const registered: Record<string, unknown>[] = []
    const ctx = {
      slots: {
        inject: (key: string, callback: () => unknown) => { injected.push(key); return callback() },
        register: (options: Record<string, unknown>) => { registered.push(options); return () => {} },
        // 文件阅读区与答案卡片 wrap 要在订阅回调里抓原生渲染器再重注册；
        // 假座位立即回调，并喂一个原生 assistant-step 渲染器。
        entries: () => [{ options: { key: 'assistant-step', priority: 0 }, component: () => null }],
        subscribe: (_key: string, callback: () => void) => { callback(); return () => {} },
      },
      logger: () => ({ info: () => {}, warn: () => {} }),
      effect: () => () => {},
      get: () => undefined,
    }
    ;(loaded?.apply as (ctx: unknown) => void)(ctx)
    // 文件阅读区注入轮次尾座位（会话 ID 条已移除：会话列表右键可查）。
    expect(injected).toContain('conversation.chat.turnTail')
    // 文件阅读区注册了；答案卡片包住了 assistant-step 渲染位。
    const registeredIds = registered.map(options => options.id)
    expect(registeredIds).toContain(MARKDOWN_TAIL_ID)
    expect(registered.some(options => options.key === 'assistant-step')).toBe(true)
  })
})
