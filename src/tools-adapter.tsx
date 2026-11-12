/** Instantiate host feature factories against private services and private seats.
 * The host sidebar's registrations, stores, navigation and layout are untouched.
 */
import { createElement } from 'react'
import { browserState } from './browser/state.ts'
import { BrowserChrome } from './browser/workspace.tsx'
import * as files from '@deepseek-ai/dsh-client-ui-sidebar-files'
import * as browser from '@deepseek-ai/dsh-client-ui-sidebar-browser'
import * as terminal from '@deepseek-ai/dsh-client-ui-sidebar-terminal'
import * as documentPreview from '@deepseek-ai/dsh-client-ui-sidebar-documentpreview'
import { readDefaultLinkOpenMode, openInBrowser } from './link-open.ts'
import { toolsState, type ToolTab } from './tools-state.ts'
import { privateFactory, privateSlot, toolSlot } from './slot-names.ts'
export { toolSlot }
export const browserBodySlot = 'chat-power.browser.pane.tab'
export const features = [files, browser, terminal, documentPreview]

export function createToolsAdapter(ctx: any) {
  const definitions = new Map<string, any>()
  const closeHandlers = new Map<string, any>()
  const privateServices = new Map<string, any>()
  const facadeCache = new WeakMap<object, any>()
  const browserFacadeCache = new WeakMap<object, any>()
  const hostSidebar = ctx.get('sidebarRight')
  let browserSession: string | undefined
  const inventory = {
    subscribe: (fn: () => void) => { const a = toolsState.subscribe(fn); const b = browserState.subscribe(fn); return () => { a(); b() } },
    getSnapshot: () => [...toolsState.inventory().filter(t => t.kind !== 'browser'), ...browserState.get().pages.filter(p => p.type === 'page').map(p => ({ ...browserState.tab(p), sessionId: browserSession, tabId: p.id }))],
  }
  const open = (sessionId: string, kind: string, options?: any) => {
    const definition = definitions.get(kind)
    if (!definition) throw new Error(`会话工具未加载：${kind}`)
    if (kind === 'browser') {
      if (options?.params?.url || options?.revealIfOpened === false || !browserState.get().pages.length) browserState.open('page', options?.params?.url)
      return toolsState.open(sessionId, kind, '浏览器')
    }
    return toolsState.open(sessionId, kind, definition.title(`sidebar://${kind}`), `sidebar://${kind}`, options?.params,
      definition.multiple === true || options?.revealIfOpened === false)
  }
  const close = (sessionId: string, id: string) => {
    const tab = toolsState.get(sessionId).tabs.find(t => t.id === id)
    if (!tab) return
    closeHandlers.get(tab.kind)?.(sessionId, tab)
    toolsState.close(sessionId, id)
  }
  const openResource = (sessionId: string, address: string, options?: any) => {
    if (!address.startsWith('dsh-resource://file/')) throw new Error('此资源暂不支持在会话工具中打开')
    const tab = toolsState.open(sessionId, 'text', decodeURIComponent(address.split('/').at(-1) ?? '文件'), address, options?.params)
    ctx.get('resources').pin(address, tab.controller.signal)
    return tab
  }
  const actionsFor = (sessionId: string, tab: ToolTab) => ({
    bindCommands(commands: any) { tab.commands = commands; return () => { if (tab.commands === commands) tab.commands = {} } },
    openTab: (kind: string, options?: any) => {
      if (kind === 'browser' && options?.params?.url && readDefaultLinkOpenMode() === 'browser') {
        openInBrowser(options.params.url); return
      }
      open(sessionId, kind, options)
    },
    openResource: (address: string, options?: any) => openResource(sessionId, address, options),
    close: () => close(sessionId, tab.id),
  })
  const occurrences = new Map<string, any>()
  const occurrence = (sessionId: string, { id }: { id: string }) => {
    const tab = toolsState.get(sessionId).tabs.find(t => t.id === id) ?? browserState.get().pages.filter(p => p.type === 'page').map(p => browserState.tab(p)).find(t => t.id === id)
    if (!tab) throw new Error(`会话工具标签已关闭：${id}`)
    if (!occurrences.has(id)) {
      const navigation = { address: tab.contentId, params: tab.params, revision: 0 }
      occurrences.set(id, { id, sessionId, tabId: id, signal: tab.controller.signal,
        navigation: { subscribe: () => () => {}, getSnapshot: () => navigation }, tabActions: actionsFor(sessionId, tab) })
      tab.controller.signal.addEventListener('abort', () => occurrences.delete(id), { once: true })
    }
    return occurrences.get(id)
  }
  privateServices.set('sidebarRight', {
    openTabs: inventory, tabDomain: { occurrence },
    openTabIn: open, openResourceIn: openResource, closeIn: close,
    registerCloseHandler(kind: string, fn: any) { closeHandlers.set(kind, fn); return () => closeHandlers.delete(kind) },
  })
  // 宿主 0.2.2 起，标签登记表不再只有 register：宿主会问
  // 「有没有类型能打开这个地址」（entries / candidates / subscribe）。
  // 少一个方法，文件面板整个起不来（registry.entries is not a function），
  // 表现为会话区里点开「工作区文件」一片空白。读接口照抄宿主那套，
  // 答案取自宿主自己的登记表——问的是「这类地址能不能打开」，
  // 与类型登记在谁名下无关；登记仍然只进私有表，宿主右侧栏不受影响。
  const hostTabs = (): any => {
    try { return ctx.get('sidebarRightTabs') } catch { return undefined }
  }
  privateServices.set('sidebarRightTabs', {
    register(definition: any) { definitions.set(definition.kind, definition); return () => definitions.delete(definition.kind) },
    entries: () => hostTabs()?.entries?.() ?? [],
    candidates: (address: string) => hostTabs()?.candidates?.(address) ?? [],
    subscribe: (listener: () => void) => hostTabs()?.subscribe?.(listener) ?? (() => {}),
  })
  // 宿主的 store 作用域键**就是会话 ID**：文件面板拿它去列工作区文件、
  // 找标签实例。此前给键加了 `chat-power.tools.` 前缀，宿主 0.2.2 起
  // 这个键会一路传到远端请求——会话 ID 变成带前缀的怪串，文件列不出来
  // （面板只剩一个路径标题，没有条目）。这里原样传键：每个特性自己
  // 持有 store 实例，内存互不串味；落盘的键与宿主同名，存的是每面板
  // 自己的展开状态，互不影响。
  function facade(scope: any, browserFeature = false): any {
    const cache = browserFeature ? browserFacadeCache : facadeCache
    if (cache.has(scope)) return cache.get(scope)
    const seat = (name: string): string => browserFeature ? toolSlot(name).replace('chat-power.tools.', 'chat-power.browser.') : toolSlot(name)
    const slots = new Proxy(scope.slots, { get(target, key) {
      if (key === 'register') return (options: any, Component: any) => {
        const children = options.children && Object.fromEntries(Object.entries(options.children).map(([name, spec]) => [seat(name), spec]))
        return target.register({ ...options, name: seat(options.name), children, store: options.store }, (props: any) => {
          const shares = { ...props }
          for (const method of ['renderSlot', 'renderSlotChain', 'renderFactorySlot']) {
            if (props[method]) shares[method] = (name: string, ...args: any[]) => props[method](privateSlot(name), ...args)
          }
          const element = createElement(Component, shares)
          return options.name === 'sidebar.right.pane.tab' && options.key === '@deepseek-ai/dsh-client-ui-sidebar-browser'
            ? createElement(BrowserChrome, { hostProps: shares, children: element }) : element
        })
      }
      if (key === 'registerFactory') return (options: any, Component: any) => {
        try {
          return target.registerFactory({ ...options, name: privateFactory(options.name), store: options.store }, Component)
        } catch (error: unknown) {
          // 宿主 0.2.2 起，文件面板会注册固定名字的工厂（文件树 / 导航器）。
          // 宿主自己那份已经注册过，私有作用域再注册就撞名——撞名说明
          // 工厂本来就是共用的那一份，沿用它即可，不必再注册一次。
          if (String(error).includes('already has a definition')) return () => {}
          throw error
        }
      }
      if (['inject', 'entries', 'entriesOfSlot', 'subscribe', 'specDynamic'].includes(String(key))) return (name: string, ...args: any[]) => target[key](seat(name), ...args)
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value
    } })
    const proxy = new Proxy(scope, { get(target, key) {
      if (privateServices.has(String(key))) return privateServices.get(String(key))
      if (key === 'slots') return slots
      if (key === 'get') return (name: string) => privateServices.get(name) ?? target.get(name)
      if (key === 'reflect') return { provide(name: string, value: any) { privateServices.set(name, value); return () => privateServices.delete(name) } }
      if (key === 'locale') return new Proxy(target.locale, { get(locale, prop) { return prop === 'register' ? () => () => {} : typeof locale[prop] === 'function' ? locale[prop].bind(locale) : locale[prop] } })
      if (key === 'shortcuts') return new Proxy(target.shortcuts, { get(shortcuts, prop) { return prop === 'register' ? () => () => {} : shortcuts[prop] } })
      if (key === 'webTerminals') return new Proxy(target.webTerminals, { get(terminals, prop) {
        if (prop === 'retainTabs') return (tabs: any[]) => terminals.retainTabs([...(hostSidebar?.openTabs?.getSnapshot?.() ?? []).filter((t: any) => t.kind === 'terminal'), ...tabs])
        const value = terminals[prop]; return typeof value === 'function' ? value.bind(terminals) : value
      } })
      if (key === 'inject') return (names: string[], callback: any) => target.inject(names.filter(name => !privateServices.has(name)), (child: any) => callback(facade(child, browserFeature)))
      const value = target[key]; return typeof value === 'function' ? value.bind(target) : value
    } })
    cache.set(scope, proxy)
    return proxy
  }
  const install = () => {
    for (const feature of features) facade(ctx, feature === browser).inject(feature.inject, (scope: any) => {
      // 一个面板装载失败不该拖垮整条挂载行：记下原因，其余面板照常。
      try { feature.apply(scope) } catch (error: unknown) { console.error(`[chat-power] 会话工具面板装载失败：${feature.inject.join(', ')}`, error) }
    })
    ctx.effect(() => {
      // sidebarRight 已经写进 inject，正常路径下一定在；这里仍判空，是因为工具区
      // 不该因为宿主少一个服务就整块起不来（失败了就只是不接管终端标签）。
      const openTabs = hostSidebar?.openTabs
      if (openTabs === undefined || typeof openTabs.subscribe !== 'function') return
      const sync = () => ctx.get('webTerminals')?.retainTabs([...openTabs.getSnapshot().filter((t: any) => t.kind === 'terminal'), ...toolsState.inventory().filter(t => t.kind === 'terminal')])
      const off = openTabs.subscribe(sync)
      return () => { off(); toolsState.dispose(); sync() }
    }, 'chat-power: independent tools lifetime')
  }
  return { install, definitions, open, close, openResource, occurrence,
    setBrowserSession(id: string) { browserSession = id },
    tabInfo(sessionId: string, tab: ToolTab, visible: boolean) {
      const held = occurrence(sessionId, tab)
      return { sidebar: { expanded: true, fullscreen: false }, panel: { id: 'chat-power-tools' },
        tab: { ...tab, visible, navigation: held.navigation.getSnapshot(), signal: held.signal, actions: held.tabActions } }
    },
  }
}
