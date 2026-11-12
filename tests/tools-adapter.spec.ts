import { afterEach, describe, expect, it, vi } from 'vitest'
const fixture = vi.hoisted(() => ({ scopes: [] as string[], source: undefined as any, registry: undefined as any }))
vi.mock('@deepseek-ai/dsh-client-ui-sidebar-files', () => ({
  inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
  apply(ctx: any) {
    fixture.source = ctx
    ctx.sidebarRightTabs.register({ kind: 'files', id: 'files-test', title: () => 'Files' })
    // 宿主 0.2.2 起：装载时就会问「有没有类型能打开这个地址」。
    // 私有登记表少一个方法，这一行就是 TypeError，整个文件面板起不来。
    fixture.registry = {
      entries: ctx.sidebarRightTabs.entries(),
      candidates: ctx.sidebarRightTabs.candidates('dsh-resource://file/session/s1/a.md'),
    }
    ctx.sidebarRightTabs.subscribe(() => {})()
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'files-test',
      store: { create: (scope: string) => { fixture.scopes.push(scope); return {} } },
      children: { 'sidebar.right.tab.files.actions': { kind: 'list', scope: 'session' } },
    }, () => null)
  },
}))
vi.mock('@deepseek-ai/dsh-client-ui-sidebar-browser', () => ({
  inject: ['slots', 'sidebarRight', 'sidebarRightTabs'],
  apply(ctx: any) {
    ctx.sidebarRightTabs.register({ kind: 'browser', id: '@deepseek-ai/dsh-client-ui-sidebar-browser', title: () => '浏览器' })
    ctx.slots.register({ name: 'sidebar.right.pane.tab', key: '@deepseek-ai/dsh-client-ui-sidebar-browser' }, () => null)
  },
}))
import { createToolsAdapter } from '../src/tools-adapter.tsx'
import { browserState } from '../src/browser/state.ts'
import { toolsState } from '../src/tools-state.ts'
afterEach(() => { for (const p of browserState.get().pages) browserState.close(p.id); toolsState.dispose(); fixture.scopes.length = 0 })
function host() {
  const register = vi.fn(() => () => {})
  const nativeOpen = vi.fn()
  const original = { openTabIn: nativeOpen, openTabs: { getSnapshot: () => [], subscribe: () => () => {} } }
  // 宿主自己的标签登记表：文件面板会问它「有没有类型能打开这个地址」。
  const registry = {
    entries: () => [{ kind: 'textpreview', canOpen: () => true }],
    candidates: (address: string) => address.startsWith('dsh-resource://file/') ? [{ kind: 'textpreview' }] : [],
    subscribe: () => () => {},
  }
  const ctx: any = {
    slots: { register },
    get: (key: string) => key === 'sidebarRight' ? original : key === 'sidebarRightTabs' ? registry : undefined,
    inject: (_names: string[], callback: any) => callback(ctx),
    effect: () => {},
  }
  return { ctx, register, nativeOpen, registry }
}
describe('private feature adapter', () => {
  it('不同会话的浏览器入口共用网页集合，网页正文使用独立插槽', () => {
    const h = host(); const adapter = createToolsAdapter(h.ctx); adapter.install()
    adapter.open('one', 'browser', { params: { url: 'https://example.com' } })
    const page = browserState.get().pages[0]!
    adapter.open('two', 'browser')
    expect(browserState.get().pages).toHaveLength(1)
    expect(browserState.get().active).toBe(page.id)
    const occurrence = adapter.occurrence('one', browserState.tab(page))
    expect(occurrence.navigation.getSnapshot().params.url).toBe('https://example.com/')
    expect((h.register.mock.calls as unknown as [any][]).some(call => call[0].name === 'chat-power.browser.pane.tab')).toBe(true)
    expect(h.nativeOpen).not.toHaveBeenCalled()
  })
  it('私有标签登记表答得上宿主的新问法（没有它，文件面板整个起不来）', () => {
    const h = host(); const adapter = createToolsAdapter(h.ctx); adapter.install()
    expect(fixture.registry.entries.map((d: any) => d.kind)).toEqual(['textpreview'])
    expect(fixture.registry.candidates.map((d: any) => d.kind)).toEqual(['textpreview'])
  })
  it('namespaces seats and persisted stores without changing the native sidebar', () => {
    const h = host(); const adapter = createToolsAdapter(h.ctx); adapter.install()
    const [options] = h.register.mock.calls[0] as unknown as [any]
    expect(options.name).toBe('chat-power.tools.pane.tab')
    expect(Object.keys(options.children)).toEqual(['chat-power.tools.tab.files.actions'])
    options.store.create('session-one')
    // store 的作用域键就是会话 ID：加了前缀会被一路带到远端请求，
    // 宿主 0.2.2 的文件面板就列不出文件（只剩一个路径标题）。
    expect(fixture.scopes).toEqual(['session-one'])
    fixture.source.sidebarRight.openTabIn('session-one', 'files')
    expect(toolsState.get('session-one').tabs).toHaveLength(1)
    expect(h.nativeOpen).not.toHaveBeenCalled()
  })
  it('aborts private tab lifetime and runs its resource cleanup on close', () => {
    const h = host(); const adapter = createToolsAdapter(h.ctx); adapter.install()
    const close = vi.fn()
    fixture.source.sidebarRight.registerCloseHandler('files', close)
    const tab = adapter.open('one', 'files')
    const occurrence = adapter.occurrence('one', tab)
    adapter.close('one', tab.id)
    expect(close).toHaveBeenCalledWith('one', tab)
    expect(occurrence.signal.aborted).toBe(true)
    expect(h.nativeOpen).not.toHaveBeenCalled()
  })
})
