/**
 * 会话区通用表面的浏览器半边：答案卡片 + 会话尾部文件阅读区。
 *
 * 这两样与跑哪种 agent 无关，从 `@goodjin2/dsh-acp-agent` 迁来：
 *
 * - **会话尾部文件卡片**：挂进通用座位 `conversation.chat.turnTail`，排在官方
 *   改动卡片之后。readers 走会话的 workspaceFiles / session 口子。
 * - **答案卡片 / 思考帧（已拆除，2026-11-13）**：曾经包住 `assistant-step`
 *   渲染位（答案卡 + 思考帧 + ACP 段分派共用一个 wrap）。原生 AssistantNodeView
 *   声明了子座位 `conversation.chat.reasoning.body` 与
 *   `conversation.chat.message.images`（展开思考、答案图片都要走 renderSlot），
 *   而宿主对 renderSlot 逐 key 校验「本条目 children 表」：遮蔽 wrap 没声明的
 *   座位，原生一调用就抛 SlotOwnershipError，错误边界把整棵会话流卸掉；转发
 *   原生 children 又在 register 时抛 "already declared"（子座位单一存活 owner）。
 *   两条路都死，只能留给原生渲染。答案区的框与标题改由 turn-fold 的 DOM 路线
 *   （每轮一框）承担；ACP 段退回原生渲染。
 */

import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { ComponentType } from 'react'
import { ToolsFrame } from './tools-frame.tsx'
import { QuestionRecord, observeQuestionPlacement } from './question-frame.tsx'
import { createMarkdownTurnReaders } from './markdown-turn-sources.ts'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import { registerMarkdownTurn } from './markdown-turn.tsx'
import { registerExpandFilesChip } from './markdown-turn-chip.tsx'
import { registerLocalFileComposer } from './local-file.tsx'
import { registerSelectionEditComposer } from './selection-edit-card.tsx'
import { sessionKeyAccessorsOf } from './selection-actions.ts'
import { en, fallbackT, NAMESPACE, zh } from './locales.ts'
import type { RuntimeT } from './locales.ts'

/** 目标渲染位与帧 wrap 优先级（EXTRA_FRAMES 用；assistant-step 已不接管）。 */
const NODE_SLOT = 'conversation.chat.node'
const WRAP_PRIORITY = -50

type Surface = {
  readonly slots: unknown
  get(name: string): unknown
  effect(callback: () => (() => void), name?: string): unknown
}
type NodeSlotEntry = {
  options: Record<string, unknown>
  component: unknown
  locale?: string
  inject?: unknown
  key?: string
  priority?: number
}
type NodeSlots = {
  entries(key: string): readonly NodeSlotEntry[]
  subscribe(key: string, fn: () => void): () => void
  register(options: Record<string, unknown>, component: unknown): () => void
}
type SegmentRendererProps = { readonly segment: unknown; readonly t: unknown }
type SegmentRenderer = ComponentType<SegmentRendererProps>
type AssistantStepProps = Record<string, any>

/** 绑定本插件词典的 t；宿主 locale 服务给出 bind，缺席则 undefined。 */
function localeBindOf(ctx: Surface): RuntimeT | undefined {
  const service = ctx.get('locale')
  if (service === null || typeof service !== 'object') return undefined
  const bind = (service as { bind?: unknown }).bind
  if (typeof bind !== 'function') return undefined
  try {
    const bound = (bind as (ns: string) => unknown)(NAMESPACE)
    return typeof bound === 'function' ? (bound as RuntimeT) : undefined
  } catch {
    return undefined
  }
}

/** 当前会话编号。chat 节点的 view props 不带 sessionId，从会话根节点读。 */
function currentSessionIdFromDom(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const node = document.querySelector('[data-conversation-session]')
  const value = node?.getAttribute('data-conversation-session')
  return value === null || value === '' ? undefined : value
}

/** 把本包词典装进 host locale 注册中心；拿不到就安静退回。 */
function registerLocales(ctx: Surface): void {
  try {
    const service = ctx.get('locale')
    const register = service !== null && typeof service === 'object'
      ? (service as { register?: unknown }).register
      : undefined
    if (typeof register !== 'function') return
    // 签名是 `register(namespace, { locale: dict })`。早先按 `register({ [NS]: {...} })`
    // 单参数调用：namespace 位置收到对象、第二参数 undefined，内部
    // `Object.entries(undefined)` 抛 TypeError 被这里吞掉，于是座位的 `t` 解不出词条，
    // 界面上显示成 `panel.sessionBar.copy` 这种键名（2026-11-03 现场）。
    const dispose = (register as (ns: string, dicts: Record<string, Record<string, string>>) => unknown)
      .call(service, NAMESPACE, { zh: { ...zh }, en: { ...en } })
    if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
      ctx.effect(() => dispose as () => void, 'dsh-chat-power: locale dictionaries')
    }
  } catch (error) {
    // 重复注册（同一命名空间已有该语言）也会抛：留一行，别静默。
    console.warn(`[dsh-chat-power] locale dictionaries: ${error instanceof Error ? error.message : String(error)}`)
  }
}

/**
 * 注册会话尾部文件卡片 + 答案卡片 wrap。
 *
 * 本函数只管通用件；ACP 进程段渲染器由 acp-agent 注册进 {@link SEGMENT_RENDERER_SLOT}，
 * wrap 在渲染时按座位取名，故注册顺序无所谓。
 * @param ctx - 宿主上下文（slots / remote / locale）。
 */
export function registerConversationSurfaces(ctx: Surface): void {
  const slots = ctx.slots as NodeSlots
  const dshT: RuntimeT = localeBindOf(ctx) ?? fallbackT
  const readers: MarkdownTurnReaders = createMarkdownTurnReaders(() => ctx.get('remote'))

  registerLocales(ctx)

  // assistant-step 不接管：原生 AssistantNodeView 声明了子座位
  // conversation.chat.reasoning.body 与 conversation.chat.message.images（展开思考、
  // 答案图片都要走 renderSlot）。宿主对 renderSlot 逐 key 校验「本条目 children 表」，
  // 遮蔽 wrap 没声明的座位，原生一调用就抛 SlotOwnershipError、错误边界卸掉整棵会话流；
  // 转发原生 children 又在 register 时抛 "already declared"（子座位单一存活 owner）。
  // 两条路都死，留给原生渲染（2026-11-13 与 tool-call 同批确认）。答案区的框与标题
  // 由 turn-fold 的 DOM 路线承担。

  // 工具调用节点（tool-call）不接管：原生 ToolCallTree 声明了子座位
  // tool.call.toolview，宿主的「子座位单一所有者」契约不允许遮蔽 wrap 再声明它
  // （register 抛 "slot ... is already declared"），而不带 children 接管又会让
  // 原生拿不到 renderSlot、一渲染就 TypeError 把整棵会话流卸掉。两条路都死，
  // 所以这一格留给原生渲染，不套框（2026-11-13 现场）。

  // 其余节点类型也各成一帧：标题说清这一块是什么，内容仍是宿主渲染。
  const EXTRA_FRAMES: readonly { key: string; label: string; kind: string }[] = [
    { key: 'turn-error', label: 'turnFold.frameError', kind: 'error' },
    { key: 'model-retry', label: 'turnFold.frameRetry', kind: 'retry' },
    { key: 'compaction', label: 'turnFold.frameCompaction', kind: 'plain' },
    { key: 'manual-compaction', label: 'turnFold.frameCompaction', kind: 'plain' },
    { key: 'context', label: 'turnFold.frameContext', kind: 'plain' },
    { key: 'turn-max-tokens', label: 'turnFold.frameLimit', kind: 'plain' },
    { key: 'workflow-run', label: 'turnFold.frameWorkflow', kind: 'plain' },
  ]
  // 提问记录（宿主把「你回答了模型先前等待的问题」投影成的一条节点）：
  // 它与回答是同一件事的两面，用户要它们在**同一个框**里。做法见
  // question-frame.tsx——内容画进本包自带的容器，再由 DOM 路线把容器搬进
  // 前面那个回答框底部预留的格子。
  const removeQuestionRenderer = (() => {
    const entry = slots.entries(NODE_SLOT).find(
      candidate => candidate.options.key === 'question-reply' && (candidate.options.priority as number | undefined ?? 0) >= 0,
    )
    if (entry === undefined) return () => {}
    const NativeQuestion = entry.component as ComponentType<AssistantStepProps>
    return slots.register({
      name: NODE_SLOT, key: 'question-reply', priority: WRAP_PRIORITY,
      ...(entry.locale === undefined ? {} : { locale: entry.locale }),
      ...(entry.inject === undefined ? {} : { inject: entry.inject }),
    }, (props: AssistantStepProps) => createElement(QuestionRecord, null, createElement(NativeQuestion, props)))
  })()

  const removeExtraRenderers: (() => void)[] = []
  const originalExtraComponents = new Map<string, unknown>()
  let installingExtra = false
  const attachExtraRenderers = (): void => {
    if (installingExtra) return
    installingExtra = true
    try {
      for (const frame of EXTRA_FRAMES) {
        const entry = slots.entries(NODE_SLOT).find(
          candidate => candidate.options.key === frame.key && (candidate.options.priority as number | undefined ?? 0) >= 0,
        )
        if (entry === undefined) continue
        if (originalExtraComponents.get(frame.key) === entry.component) continue
        originalExtraComponents.set(frame.key, entry.component)
        const NativeNode = entry.component as ComponentType<AssistantStepProps>
        const Renderer = (props: AssistantStepProps): ReactNode => createElement(
          ToolsFrame,
          {
            t: dshT,
            label: dshT(frame.label as never),
            kind: frame.kind,
            children: createElement(NativeNode, props),
          },
        )
        removeExtraRenderers.push(slots.register({
          name: NODE_SLOT, key: frame.key, priority: WRAP_PRIORITY,
          ...(entry.locale === undefined ? {} : { locale: entry.locale }),
          ...(entry.inject === undefined ? {} : { inject: entry.inject }),
        }, Renderer))
      }
    } finally { installingExtra = false }
  }
  const unsubscribeExtraRenderer = slots.subscribe(NODE_SLOT, attachExtraRenderers)
  attachExtraRenderers()
  // 回答框是后画的（回答完成才有框）：盯着页面，提问记录随时归位。
  const stopQuestionPlacement = observeQuestionPlacement()
  ctx.effect(() => () => { stopQuestionPlacement(); removeQuestionRenderer() }, 'dsh-chat-power: question placement')

  // 会话尾部文件卡片：通用座位，排在官方改动卡片之后。
  try {
    registerMarkdownTurn(slots as unknown as Parameters<typeof registerMarkdownTurn>[0], readers)
  } catch (error) {
    if (typeof console !== 'undefined') console.warn(`[dsh-chat-power] markdown turn: registration failed — ${error instanceof Error ? error.message : String(error)}`)
  }

  // 「本轮文件」入口：注册进点赞栏那排（assistant-actions 插槽），点开展开下方的文件列表。
  try {
    registerExpandFilesChip(slots as unknown as Parameters<typeof registerExpandFilesChip>[0], { t: dshT })
  } catch (error) {
    if (typeof console !== 'undefined') console.warn(`[dsh-chat-power] expand files chip: registration failed — ${error instanceof Error ? error.message : String(error)}`)
  }

  // 本机文件卡：composer 上方的 overlay 座位，入口在会话头部（会话 ID 左侧）。
  // 与 wrap 相互隔离：座位冲突（比如和宿主附件区撞了）只损失本机文件卡，
  // 不能再把答案卡片一起带走（2026-11-04 现场）。
  try {
    registerLocalFileComposer(slots as unknown as Parameters<typeof registerLocalFileComposer>[0], readers, dshT)

    // 选区编辑卡：弹条「编辑」/ 多选浮动「编辑」钮打开（overlay 座位）。
    // sessionKey 访问器让卡片只显示在打开时的那个会话视图里。
    const sessionKey = sessionKeyAccessorsOf(ctx)
    registerSelectionEditComposer(
      slots as unknown as Parameters<typeof registerSelectionEditComposer>[0],
      readers,
      dshT,
      sessionKey,
      id => {
        try { return (ctx.get('conversation') as any)?.input?.shell(id) } catch { return undefined }
      },
    )
  } catch (error) {
    if (typeof console !== 'undefined') console.warn(`[dsh-chat-power] local file composer: registration failed — ${error instanceof Error ? error.message : String(error)}`)
  }
}
