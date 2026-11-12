import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { IconChevronDownOutlineRegular, IconFolderOpenOutlineRegular, IconRightUpOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { toolsState } from './tools-state.ts'
import { createToolsAdapter, toolSlot } from './tools-adapter.tsx'
import { attachToolsRow } from './tools-tabs.ts'
import { createToolMessageHider, isToolMessageNode, mountToolBody, toolHiddenNodes } from './tools-layout.ts'
import { attachFilesTreeAugment, hasHistoryForPhase, type AugmentHandlers } from './file-tree-augment.tsx'
import { LazyFileTree } from './file-tree-lazy.tsx'
import { registerPromptView } from './prompt-view.tsx'
import { checkedFiles, toolsNotice } from './checked-files.ts'
import { createReferenceApplier } from './composer-references.ts'
import { readEntireWorkspaceText } from './workspace-text.ts'
import { saveWorkspaceText } from './workspace-save.ts'
import { startSendWatch, USER_NODE_SELECTOR } from './send-watch.ts'
import { LOCAL_FILE_ACCEPT, LOCAL_FILE_MAX_BYTES, LocalFileComposerCard } from './local-file.tsx'
import { createMarkdownTurnReaders } from './markdown-turn-sources.ts'
import { answerFileLinkPathAt } from './answer-file-links.ts'
import { sessionFileAddressOf } from './file-address.ts'
import { fallbackT } from './locales.ts'
import { readDefaultLinkOpenMode, writeDefaultLinkOpenMode, openInBrowser } from './link-open.ts'
import { statusNoticeClass } from './ui-theme.ts'
import css from './conversation-tools.module.css'
const ROOT = 'chat-power.tools'
const BODY = toolSlot('sidebar.right.pane.tab')

/** 草稿文本按「会话 + contentId」保管：关闭标签不删，重开同内容自动找回。 */
const docKey = (sessionId: string, contentId: string): string => `${sessionId}:${contentId}`

/** 工具入口的图标：文件夹、地球、终端。 */
const TOOL_ENTRY_ICONS = {
  chat: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.6 4.2c0-.66.54-1.2 1.2-1.2h8.4c.66 0 1.2.54 1.2 1.2v5.2c0 .66-.54 1.2-1.2 1.2H6.6L3.6 13.2c-.3.2-.7 0-.7-.4v-2.2c-.19-.12-.3-.31-.3-.52V4.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  files: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4.2c0-.66.54-1.2 1.2-1.2h2.4l1.5 1.8h5.7c.66 0 1.2.54 1.2 1.2v6c0 .66-.54 1.2-1.2 1.2H3.2c-.66 0-1.2-.54-1.2-1.2V4.2Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  browser: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.6" stroke="currentColor" stroke-width="1.3"/><path d="M2.6 8h10.8M8 2.4c1.5 1.6 2.2 3.5 2.2 5.6S9.5 12 8 13.6C6.5 12 5.8 10.1 5.8 8S6.5 4 8 2.4Z" stroke="currentColor" stroke-width="1.3"/></svg>',
  terminal: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.4" y="3" width="11.2" height="10" rx="1.6" stroke="currentColor" stroke-width="1.3"/><path d="M5 6.6 7.2 8.4 5 10.2M8.8 10.6h2.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

export function registerConversationTools(ctx: any) {
  if (typeof ctx.inject !== 'function') return
  const adapter = createToolsAdapter(ctx)
  const readers = createMarkdownTurnReaders(() => ctx.get('remote'))
  const docs = new Map<string, { name: string; text: string; seq: number }>()
  const currentId = () => ctx.get('uiSession')?.adapter.current.getSnapshot().key as string | undefined
  // 退出文件编辑：丢弃草稿（暂存文本移除、草稿标记清除），再关标签。
  // 重开同一路径会重新读文件，不会悄悄找回旧草稿。
  const closeDocument = (sessionId: string, tabId: string): void => {
    const tab = toolsState.get(sessionId).tabs.find(t => t.id === tabId)
    if (tab === undefined) return
    docs.delete(docKey(sessionId, tab.contentId))
    toolsState.markDraft(sessionId, tabId, false)
    adapter.close(sessionId, tabId)
  }
  // 勾选 → 输入框引用：优先走宿主输入外壳（引用渲染成卡片 chip），
  // 外壳不可达退回 execCommand 插入纯文本提及（选区弹条同款通道）。
  const applyReference = createReferenceApplier({
    shellOf: sessionId => {
      const conversation = ctx.get('conversation') as any
      const shell = conversation?.input?.shell?.(sessionId)
      return typeof shell === 'object' && shell !== null ? shell : undefined
    },
    insertViaCommand: text => {
      const composer = document.querySelector<HTMLElement>('[data-composer-input]')
      if (composer === null || typeof document.execCommand !== 'function') return false
      composer.focus()
      return document.execCommand('insertText', false, text)
    },
  })
  // 文件行编辑：读整篇（5 MB / 20000 行上限）→ 打开本机文件卡编辑标签。
  const openWorkspaceEditor = (sessionId: string, path: string): void => {
    const controller = new AbortController()
    void readEntireWorkspaceText(sessionId, path,
      offset => readers.readPage(sessionId, path, offset, controller.signal),
      controller.signal,
    ).then(text => {
      const name = path.split('/').at(-1) ?? path
      // contentId 里的路径做过编码：读取侧要对称解码（带 % 或非 ASCII 的文件名）。
      const tab = toolsState.open(sessionId, 'local', name, `edit://${encodeURIComponent(path)}`)
      docs.set(docKey(sessionId, tab.contentId), { name, text, seq: Date.now() })
      toolsState.select(sessionId, tab.id)
      toolsNotice.clear(sessionId)
    }, error => {
      toolsNotice.set(sessionId, `读取失败：${String(error)}`)
    })
  }
  // 回答块文件链接的落点：先开**文档预览**标签（text）——与右侧栏的文档预览同一份
  // 渲染，只是落点换到会话区；私有预览起不来（资源服务缺席等）再退回编辑标签（local）。
  const openAnswerFile = (sessionId: string, path: string): void => {
    try {
      adapter.openResource(sessionId, sessionFileAddressOf(sessionId, path))
    } catch (error) {
      console.warn(`[chat-power] 回答文件链接：文档预览打不开，退回编辑标签——${String(error)}`)
      openWorkspaceEditor(sessionId, path)
    }
  }
  // 行控件按会话走：会话 ID 写在控件上，点击时不用再猜是哪个会话。
  const augmentHandlers = (): AugmentHandlers => ({
    checked: (sessionId, path) => checkedFiles.has(sessionId, path),
    onToggle: (sessionId, path, checked) => {
      if (!applyReference(sessionId, path, checked)) {
        toolsNotice.set(sessionId, checked ? '暂时无法写入输入框引用' : '输入框暂不可访问，未能移除该引用')
        return
      }
      checkedFiles.toggle(sessionId, path, checked)
      toolsNotice.clear(sessionId)
    },
    onEdit: (sessionId, path) => openWorkspaceEditor(sessionId, path),
    subscribeChanges: listener => checkedFiles.subscribe(listener),
    statSize: (sessionId, path) => readers.statSize(sessionId, path),
    onBlockedOpen: (sessionId, path, sizeBytes) => {
      toolsNotice.set(sessionId, `文件 ${path.split('/').at(-1)}（${(sizeBytes / 1048576).toFixed(1)} MB）超过预览上限，已阻止打开；请在编辑器中查看或勾选后引用。`)
    },
  })
  // 打开（或聚焦）一个会话视图：同种类标签已开就选中，没有才新建。
  const openKind = (sessionId: string, kind: 'files' | 'browser' | 'terminal'): void => {
    const existing = toolsState.get(sessionId).tabs.find(t => t.kind === kind)
    if (existing !== undefined) { toolsState.select(sessionId, existing.id); return }
    try { adapter.open(sessionId, kind) } catch (error) { toolsNotice.set(sessionId, String(error)) }
  }
  function ToolArea(props: any) {
    const id = props.sessionId as string
    const s = useSyncExternalStore(toolsState.subscribe, () => toolsState.get(id), () => toolsState.get(id))
    const notice = useSyncExternalStore(toolsNotice.subscribe, () => toolsNotice.get(id), () => toolsNotice.get(id))
    const activeTab = s.tabs.find(t => t.id === s.active)
    // 文件类标签（工作区文件编辑 / 文档预览）激活时：给工具区打标记，
    // 样式据此让文件内容与上方（标签行）、下方（输入框）各留 10px。
    const fileLive = activeTab !== undefined && (activeTab.kind === 'local' || activeTab.kind === 'text')
    return <section className={css.tools} data-chat-tools="" data-chat-tools-file-live={fileLive ? '' : undefined} aria-label="会话工具">
      {(notice !== '') && <p role="alert" className={statusNoticeClass} data-variant="error">{notice}</p>}
      <div className={css.content} data-chat-tools-bodies="" data-chat-tools-session={id}>
        {s.tabs.map(tab => {
          if (tab.kind === 'chat') return null
          const visible = tab.id === s.active
          const definition = adapter.definitions.get(tab.kind)
          const info = adapter.tabInfo(id, tab, visible)
          const doc = docs.get(docKey(id, tab.contentId))
          return <div key={tab.id} hidden={!visible} className={css.body}>
            {tab.kind === 'local' && doc !== undefined
              ? <LocalFileComposerCard variant="tab" doc={doc} readers={readers} t={fallbackT} sessionId={id}
                  onReveal={tab.contentId.startsWith('edit://') ? () => {
                    const path = decodeURIComponent(tab.contentId.slice('edit://'.length))
                    void readers.revealFile(id, path).catch(() => { toolsNotice.set(id, `打开所在文件夹失败：${path}`) })
                  } : undefined}
                  onDraftChange={text => {
                    docs.set(docKey(id, tab.contentId), { ...doc, text, seq: Date.now() })
                    toolsState.markDraft(id, tab.id, true)
                  }}
                  onSent={() => toolsState.activateChat(id)}
                  // 仅保存：来自工作区文件的编辑写回原文件（受限写回通道，不发送）；
                  // 本机文件没有可写回路径，不提供保存。
                  onSave={tab.contentId.startsWith('edit://')
                    ? (text: string) => saveWorkspaceText(id, decodeURIComponent(tab.contentId.slice('edit://'.length)), text)
                    : undefined}
                  // 卡内「退出编辑」直接丢弃草稿：暂存文本移除，重开重新读文件。
                  onClose={() => closeDocument(id, tab.id)} />
              : tab.kind === 'files'
                // 工作区文件：自己画一棵懒加载树——只列当前目录的直接子项，
                // 点开文件夹才加载下一层，每层最多显示一百条（其余用「加载更多」）。
                // 宿主那棵树一次画完整目录，工作区一大就卡住。
                ? <LazyFileTree
                    sessionId={id}
                    remote={() => ctx.get('remote')}
                    t={fallbackT}
                    onOpenFile={path => { openWorkspaceEditor(id, path) }} />
                : definition && props.renderSlot(BODY, {}, { entryKey: definition.id, hookContext: () => info })}
          </div>
        })}
      </div>
    </section>
  }
  // The tab strip is an independently owned session view in normal conversation
  // flow, inserted before the conversation content. We never reparent host React
  // nodes or borrow their slot authorization.
  function PortalRoot(props: any) {
    const id = useSyncExternalStore(ctx.get('uiSession').adapter.current.subscribe, currentId, currentId)
    const s = useSyncExternalStore(toolsState.subscribe, () => toolsState.get(id ?? ''), () => toolsState.get(id ?? ''))
    const activeTab = s.tabs.find(t => t.id === s.active)
    const toolActive = activeTab !== undefined && activeTab.kind !== 'chat'
    // 编辑标签（edit://）打开：连输入框一起隐藏，编辑卡距底 20px。
    const editorActive = toolActive && activeTab !== undefined && activeTab.kind === 'local' && activeTab.contentId.startsWith('edit://')
    const [mounts, setMounts] = useState<{ button: HTMLElement | null; body: HTMLElement; content: Element | null } | null>(null)
    const [reference, setReference] = useState<any>(null)
    useEffect(() => {
      if (!id) { setReference(null); return }
      const ref = ctx.get('sessions').retain(id, { source: 'chatPowerTools' })
      setReference({ id, ref })
      void ref.ready.catch((error: unknown) => console.error('Conversation tools session:', error))
      return () => ref.release()
    }, [id])
    useLayoutEffect(() => {
      let attached: HTMLElement | null = null
      let body: HTMLElement | null = null
      const attach = () => {
        const leading = document.querySelector<HTMLElement>('[data-conversation-header-leading]')
        let root = leading?.closest('header')?.parentElement
        while (root && !root.querySelector('[data-conversation-content]')) root = root.parentElement
        if (!leading || !root || (attached === root && body !== null && body.isConnected)) return
        body?.remove()
        attached = root
        const content = root.querySelector('[data-conversation-content]')
        body = document.createElement('div'); body.className = css.chat ?? ''
        body.dataset.chatToolsMount = ''
        // 正文挂进会话内容的滚动层（宿主视图之后、composer 之前）：激活工具标签时
        // 顺序固定为「标签行在上、正文居中、composer 在下」。此前挂在 content 之前、
        // 激活时 content 塌缩，标签行被挤到正文下方、输入框之上（2026-11-08 空白现场）。
        if (content) mountToolBody(content, body); else root.append(body)
        setMounts({ button: null as unknown as HTMLElement, body, content })
      }
      attach()
      // attach 自己的 remove/insert 也是 childList 变异：回调末尾吞掉本次造成的
      // 记录，掐断「自己触发自己」的无限微任务循环（2026-11-07 空转现场：该循环
      // 打满一核且饿死定时器/console/调试器）。外来变异不受影响，照常触发。
      const observer = new MutationObserver(() => {
        attach()
        observer.takeRecords()
      })
      observer.observe(document.body, { childList: true, subtree: true })
      return () => { observer.disconnect(); body?.remove() }
    }, [])
    // 会话接线：首次见到会话时按内容相位定默认标签（hero=新会话→工作区文件；
    // active=旧会话→会话标签），并侦测发送（聊天流新增用户消息→切到会话标签）。
    useEffect(() => {
      if (!id || !mounts) return
      const content = mounts.content
      if (!content) return
      let observer: MutationObserver | undefined
      let fallback: ReturnType<typeof setTimeout> | undefined
      const teardown = (): void => {
        observer?.disconnect(); observer = undefined
        if (fallback !== undefined) { clearTimeout(fallback); fallback = undefined }
      }
      const decide = (): void => {
        const decision = hasHistoryForPhase(content.getAttribute('data-content-phase'))
        if (decision !== undefined) { toolsState.seed(id, decision); teardown(); return }
        if (observer === undefined) {
          observer = new MutationObserver(decide)
          observer.observe(content, { attributes: true, attributeFilter: ['data-content-phase'] })
        }
      }
      // 兜底：相位迟迟不定（宿主变化）就按聊天流里已有的用户消息判定。
      fallback = setTimeout(() => {
        toolsState.seed(id, content.querySelectorAll(USER_NODE_SELECTOR).length > 0)
        teardown()
      }, 5000)
      decide()
      const stopWatch = startSendWatch({
        root: () => content.querySelector('[data-conversation-scroll]'),
        isUserTurn: node => node.matches?.(USER_NODE_SELECTOR) === true || node.querySelector?.(USER_NODE_SELECTOR) !== null,
        onSend: () => { toolsState.activateChat(id); checkedFiles.clear(id) },
      })
      return () => { teardown(); stopWatch() }
    }, [id, mounts])
    // 布局切换：工具标签激活时收起聊天消息（composer 留在下方），工具条带撑满；
    // 会话标签激活时恢复宿主布局。正文已挂在滚动层里，content 保持宿主 flex:1
    // 不动——塌缩它才会把标签行挤到正文下方。
    useLayoutEffect(() => {
      if (!mounts) return
      const body = mounts.body
      body.hidden = !id
      const content = mounts.content
      const scroll = content?.querySelector<HTMLElement>('[data-conversation-scroll]') ?? null
      // 工具标签激活才收起宿主视图（对话/轨迹）；回到对话 / 轨迹即恢复——content 保持
      // 宿主 flex:1 不塌缩，正文（flex:1）自然落在标签行与 composer 之间。
      // 初始视图与激活期间宿主新补渲染的视图都走同一个 hider：隐藏时记原 display，
      // 退出时一并恢复——不再只还初始节点（否则「激活→插入新视图→退出」后新视图永远
      // display:none，2026-11-08 审查发现）。
      const hider = createToolMessageHider()
      const messages = scroll === null
        ? []
        : toolHiddenNodes(scroll, body, toolActive).filter((node): node is HTMLElement =>
            node instanceof HTMLElement)
      let guard: MutationObserver | undefined
      let hiddenComposer: HTMLElement | undefined
      if (toolActive && id) {
        for (const node of messages) hider.hide(node)
        body.dataset.chatStripLive = ''
        if (editorActive) {
          body.dataset.chatEditorLive = ''
          const composer = content?.querySelector<HTMLElement>('[data-composer-seat]') ?? null
          if (composer !== null) { composer.style.display = 'none'; hiddenComposer = composer }
        }
        // 兜底：工具标签激活期间宿主补渲染的新视图节点也要收起。
        if (scroll !== null && typeof MutationObserver !== 'undefined') {
          guard = new MutationObserver(records => {
            for (const record of records) {
              for (const node of record.addedNodes) {
                if (node instanceof HTMLElement && isToolMessageNode(node, body)) hider.hide(node)
              }
            }
          })
          guard.observe(scroll, { childList: true })
        }
      } else {
        delete body.dataset.chatStripLive
        delete body.dataset.chatEditorLive
      }
      return () => {
        guard?.disconnect()
        hiddenComposer?.style.removeProperty('display')
        delete body.dataset.chatEditorLive
        hider.restore()
      }
    }, [mounts, toolActive, id, editorActive])
    if (!mounts) return null
    return <>
      {reference && reference.id === id && createPortal(
        <props.SessionProvider session={reference.ref}>{props.renderSlot(ROOT, {})}</props.SessionProvider>, mounts.body)}
    </>
  }
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'chat-power-tools-portal',
    children: { [ROOT]: { kind: 'single', scope: 'session' } },
  }, PortalRoot))
  ctx.slots.inject(ROOT, () => ctx.slots.register({ name: ROOT, children: {
    [BODY]: { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: (_: any, hook: any) => hook } } },
    [toolSlot('sidebar.right.pane.tab.title')]: { kind: 'keyed', scope: 'session', inject: { hooks: { tabInfo: (_: any, hook: any) => hook } } },
    [toolSlot('sidebar.right.tab.guide.entry')]: { kind: 'keyed', scope: 'session' },
  } }, ToolArea))
  // 会话头部动作槽位：打开本机文件 + 链接偏好「更多」菜单。
  // 工具标签并进宿主标签行后，这两个入口不再占标签行的位置。
  function HeaderToolsEntry(props: { readonly sessionId?: string }) {
    const id = props.sessionId
    const [mode, setMode] = useState(readDefaultLinkOpenMode)
    const [moreOpen, setMoreOpen] = useState(false)
    if (id === undefined || id === '') return null
    return <>
      <Menu
        open={moreOpen}
        portal
        dense
        align="end"
        onClose={() => { setMoreOpen(false) }}
        items={[
          { type: 'label', id: 'link-mode-label', text: fallbackT('tools.linkOpenDefault') },
          { id: 'link-right', icon: <IconRightUpOutlineRegular />, label: fallbackT('markdownTurn.linkOpenRight') },
          { id: 'link-browser', icon: <IconFolderOpenOutlineRegular />, label: fallbackT('markdownTurn.linkOpenBrowser') },
        ]}
        selectedId={mode === 'browser' ? 'link-browser' : 'link-right'}
        anchor={<button type="button" className={css.iconEntry} aria-haspopup="menu" aria-expanded={moreOpen}
          aria-label={fallbackT('tools.more')} title={fallbackT('tools.more')} onClick={() => { setMoreOpen(value => !value) }}>
          <IconChevronDownOutlineRegular size={14} />
        </button>}
        onSelect={(selected: string | number) => {
          if (selected === 'link-right') { writeDefaultLinkOpenMode('right'); setMode('right') }
          else if (selected === 'link-browser') { writeDefaultLinkOpenMode('browser'); setMode('browser') }
          setMoreOpen(false)
        }}
      />
    </>
  }
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'chat-power-tools-entry',
    inject: (sessionId: string) => ({ sessionId }),
  }, HeaderToolsEntry))
  // 工具标签并入宿主「对话 / 轨迹」行：在宿主渲染出来的标签行上补挂自己的标签。
  // 文件标签的关闭走丢弃草稿的关闭；其余标签直接关。
  ctx.effect(() => attachToolsRow({
    snapshot: id => toolsState.get(id),
    activateChat: id => toolsState.activateChat(id),
    selectTab: (id, tabId) => toolsState.select(id, tabId),
    openKind,
    closeTab: (id, tabId) => {
      const tab = toolsState.get(id).tabs.find(t => t.id === tabId)
      if (tab !== undefined && (tab.kind === 'local' || tab.kind === 'text')) { closeDocument(id, tabId); return }
      adapter.close(id, tabId)
    },
    subscribe: listener => toolsState.subscribe(listener),
    labels: {
      chat: fallbackT('tools.chat'),
      kinds: {
        files: fallbackT('tools.files'),
        browser: fallbackT('tools.browser'),
        terminal: fallbackT('tools.terminal'),
      },
    },
    icons: TOOL_ENTRY_ICONS,
  }), 'chat-power: tools tab row')
  function DocumentActions({ sessionId, absolutePath }: { sessionId: string; absolutePath: string }) {
    const [status, setStatus] = useState('')
    const [busy, setBusy] = useState(false)
    const lifetime = useRef<AbortController>()
    useEffect(() => { const c = new AbortController(); lifetime.current = c; return () => c.abort() }, [])
    const run = async (edit: boolean) => {
      if (busy || !lifetime.current) return
      const signal = lifetime.current.signal
      setBusy(true); setStatus('')
      try {
        const text = await readEntireWorkspaceText(sessionId, absolutePath,
          offset => readers.readPage(sessionId, absolutePath, offset, signal), signal)
        if (edit) {
          const name = absolutePath.split('/').at(-1) ?? absolutePath
          // 暂存键位与 openWorkspaceEditor 同一套：docKey(sessionId, contentId)，
          // 路径编码对称，标签里才能取到这份正文。
          const contentId = `edit://${encodeURIComponent(absolutePath)}`
          const tab = toolsState.open(sessionId, 'local', name, contentId)
          docs.set(docKey(sessionId, tab.contentId), { name, text, seq: Date.now() }); toolsState.select(sessionId, tab.id)
        } else { await navigator.clipboard.writeText(text); setStatus('已复制全文') }
      } catch (error) { if (!signal.aborted) setStatus(`操作失败：${String(error)}`) }
      finally { if (!signal.aborted) setBusy(false) }
    }
    return <><button disabled={busy} onClick={() => void run(false)}>复制全文</button><button disabled={busy} onClick={() => void run(true)}>编辑并发送</button><span role="status">{status}</span></>
  }
  ctx.slots.inject(toolSlot('sidebar.right.tab.document.actions'), () => ctx.slots.register({
    name: toolSlot('sidebar.right.tab.document.actions'), id: 'chat-power-document-actions',
  }, DocumentActions))
  adapter.install()
  // 文件树行控件：宿主 0.2.2 起不能再包宿主面板，改为在渲染出来的树上补控件。
  // 「提示词」视图：查看/编辑当前会话的系统提示词（router/worker 可编辑，普通会话只读）。
  ctx.effect(() => registerPromptView(ctx), 'chat-power: prompt view')
  // 回答块里的文档链接：改为在会话区打开，不再跳右侧栏。宿主有**两种**渲染形态：
  // 1. markdown 相对文件链接渲染成 `<button type="button" title="{路径}">`——不是 <a>，
  //    也没有任何资源地址属性（三次旧修复都栽在只认 <a> / 地址属性上）。认领靠
  //    「按钮 title 命中回答卡写进 data-answer-file-links 的链接清单」（answer-file-links.ts）；
  // 2. 文档卡片（CSV 等）不一定带 href：地址可能放在任意层的属性里——从点击处向上
  //    逐层扫属性，命中文件资源地址即认领。
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {}
    const pathFrom = (value: string): string => {
      let path = value
      const idx = path.indexOf('dsh-resource://file/')
      if (idx >= 0) path = path.slice(idx + 'dsh-resource://file/'.length)
      else if (path.startsWith('file://')) path = path.slice('file://'.length)
      try { path = decodeURIComponent(path) } catch { /* 保留原文 */ }
      return path.replace(/^\/+/, '')
    }
    const addressAt = (node: Element): string | undefined => {
      for (const attr of Array.from(node.attributes)) {
        const value = attr.value
        if (value.includes('dsh-resource://file/') || value.startsWith('file://')) return pathFrom(value)
        const name = attr.name.toLowerCase()
        if ((name.includes('resource') || name.includes('textpreview')) && value !== '' && !value.startsWith('#') && !value.startsWith('http')) {
          return pathFrom(value)
        }
      }
      return undefined
    }
    let lastKey = ''
    let lastAt = 0
    const onOpen = (event: Event): void => {
      const target = event.target as Element | null
      if (target === null || typeof target.closest !== 'function') return
      if (target.closest('[data-chat-power-frame-box]') === null) return
      // 形态一：宿主的文件链接按钮（回答块）。认领后不再走属性扫描——
      // 按钮自身的属性不该被当成文档卡片的地址。
      const answered = answerFileLinkPathAt(target)
      if (answered !== undefined) {
        const answerSession = target.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
        if (answerSession === '') return
        event.preventDefault()
        event.stopPropagation()
        const answerKey = answerSession + '|' + answered
        const now = Date.now()
        if (answerKey === lastKey && now - lastAt < 800) return
        lastAt = now
        lastKey = answerKey
        openAnswerFile(answerSession, answered)
        return
      }
      let node: Element | null = target
      let path: string | undefined
      while (node !== null) {
        // 锚点：markdown 文档链接（相对工作区路径）→ 会话区打开；网页链接放行。
        if (node.tagName === 'A') {
          const href = node.getAttribute('href') ?? ''
          if (/^(https?:|mailto:|javascript:|#)/i.test(href)) return
          if (href !== '') { path = pathFrom(href); break }
        }
        const found = addressAt(node)
        if (found !== undefined && found !== '') { path = found; break }
        node = node.parentElement
      }
      if (path === undefined || path === '') return
      const sessionId = target.closest('[data-conversation-session]')?.getAttribute('data-conversation-session') ?? ''
      if (sessionId === '') return
      event.preventDefault()
      event.stopPropagation()
      const key = sessionId + '|' + path
      const now = Date.now()
      if (key === lastKey && now - lastAt < 800) return
      lastAt = now
      lastKey = key
      openAnswerFile(sessionId, path)
    }
    // 捕获阶段、pointerdown 与 click 都拦：宿主可能绑在任意一处。
    document.addEventListener('pointerdown', onOpen, true)
    document.addEventListener('click', onOpen, true)
    return () => {
      document.removeEventListener('pointerdown', onOpen, true)
      document.removeEventListener('click', onOpen, true)
    }
  }, 'chat-power: answer link open')
  ctx.effect(() => attachFilesTreeAugment(augmentHandlers), 'chat-power: files tree augment')
  // 选区编辑卡打开时：若正处于编辑标签（输入框隐藏 ✓），切回聊天，
  // 让输入框恢复、选区卡锚回输入框上方（否则卡片会掉到输入框下面）。
  ctx.effect(() => {
    if (typeof window === 'undefined') return () => {}
    const onOpen = (event: Event): void => {
      const sessionId = (event as CustomEvent).detail?.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') return
      const s = toolsState.get(sessionId)
      if (s.tabs.some(tab => tab.id === s.active && tab.kind !== 'chat')) toolsState.activateChat(sessionId)
    }
    window.addEventListener('chat-power:selection-edit-open', onOpen)
    return () => { window.removeEventListener('chat-power:selection-edit-open', onOpen) }
  }, 'chat-power: selection edit composer restore')
  // One policy for ordinary HTTP links across the application. Explicit modifiers
  // retain browser conventions. Native browser's external button remains explicit.
  ctx.effect(() => {
    const click = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const anchor = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, location.href)
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === location.origin) return
      const id = currentId(); if (!id) return
      event.preventDefault(); event.stopImmediatePropagation()
      if (readDefaultLinkOpenMode() === 'browser') { openInBrowser(url.href); return }
      // 复用策略：普通外链只让位**最近一个**内置浏览器标签（腾出宿主工厂的
      // 单页面位），其余浏览器标签原样保留——此前批量关闭会丢掉用户正在
      // 阅读的页面。
      const browserTabs = toolsState.get(id).tabs.filter(t => t.kind === 'browser')
      const latest = browserTabs.at(-1)
      if (latest !== undefined) adapter.close(id, latest.id)
      adapter.open(id, 'browser', { params: { url: url.href } })
    }
    document.addEventListener('click', click, true)
    return () => document.removeEventListener('click', click, true)
  })
}
