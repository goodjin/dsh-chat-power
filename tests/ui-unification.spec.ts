/**
 * 会话区 UI 统一改造的基础件：共享主题样式、统一发送控制器。
 *
 * 本仓库没有 jsdom / react-dom，测试沿用仓库惯例：纯逻辑直接测，DOM 注入用
 * 假 document（createElement / head.appendChild / querySelector 的最小面）。
 */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  UI_THEME_CSS,
  UI_THEME_TAG,
  injectUiThemeCss,
  panelClass,
  statusNoticeClass,
  uiButtonClass,
} from '../src/ui-theme.ts'
import { createSendController } from '../src/send-actions.ts'

/** compose-card 尚无渲染器可测，按仓库惯例先钉住源码级契约（bundle.spec 同路数）。 */
const composeCardSource = (): string =>
  readFileSync(new URL('../src/compose-card.tsx', import.meta.url), 'utf8')

/** 手写Promise 门：让 send 挂起，控制 resolve / reject 时机。 */
function deferred<T = void>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** 微任务 + 宏任务都排空，保证 then 回调已执行。 */
const flush = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

describe('统一 UI 主题', () => {
  it('类名常量出现在共享样式里（类名与样式一体维护，不许漂移）', () => {
    for (const cls of [uiButtonClass, panelClass, statusNoticeClass]) {
      expect(UI_THEME_CSS).toContain(`.${cls}`)
    }
  })

  it('颜色首选宿主语义 token；不得写死整套白底/深色浮层（旧选区弹条的问题）', () => {
    expect(UI_THEME_CSS).toContain('--dsw-alias-')
    expect(UI_THEME_CSS).not.toContain('background:#fff')
    expect(UI_THEME_CSS).not.toContain('#2b2b30')
    expect(UI_THEME_CSS).not.toContain('prefers-color-scheme')
  })

  it('数值基线齐全：控件 6px 圆角、32px 点击区、12px 辅助文字', () => {
    expect(UI_THEME_CSS).toContain('border-radius:6px')
    expect(UI_THEME_CSS).toContain('width:32px')
    expect(UI_THEME_CSS).toContain('font-size:12px')
  })

  it('注入是幂等的：同一页面只注入一份，内容就是导出的样式', () => {
    const appended: Array<{ tag: string; css: string }> = []
    const doc = {
      querySelector(selector: string): unknown {
        const tag = /data-plugin-css="([^"]+)"/.exec(selector)?.[1]
        return appended.find(element => element.tag === tag) ?? null
      },
      createElement(): { dataset: Record<string, string>; textContent: string } {
        return { dataset: {}, textContent: '' }
      },
      head: { appendChild(element: { dataset: Record<string, string>; textContent: string }): void {
        appended.push({ tag: element.dataset['pluginCss'] ?? '', css: element.textContent })
      } },
    }
    injectUiThemeCss(doc as unknown as Document)
    injectUiThemeCss(doc as unknown as Document)
    expect(appended).toHaveLength(1)
    expect(appended[0]!.tag).toBe(UI_THEME_TAG)
    expect(appended[0]!.css).toBe(UI_THEME_CSS)
  })
})

describe('统一编辑卡外壳 ComposeCard', () => {
  /** 去掉注释后的源码，用于「不写死文案」类断言。 */
  const codeWithoutComments = (): string => composeCardSource().replace(/\/\*[\s\S]*?\*\//g, '')
  it('用统一面板类与稳定 data 属性（React 与纯 DOM 宿主都按同一套类名复用）', () => {
    const source = composeCardSource()
    expect(source).toContain('panelClass')
    expect(source).toContain('uiButtonClass')
    expect(source).toContain('data-compose-card')
    expect(source).toContain('data-compose-cancel')
    expect(source).toContain('data-compose-new-session')
    expect(source).toContain('data-compose-send')
  })

  it('取消在头部、新会话与发送在动作行右侧；发送在 pending 或空白时禁用', () => {
    const source = composeCardSource()
    expect(source).toContain('props.pending')
    expect(source).toContain('props.sendDisabled')
    expect(source.indexOf('data-compose-cancel')).toBeLessThan(source.indexOf('data-compose-send'))
    expect(source.indexOf('data-compose-new-session')).toBeLessThan(source.indexOf('data-compose-send'))
  })

  it('所有编辑器顶栏都有复制，文件编辑底部另提供仅保存', () => {
    const source = composeCardSource()
    expect(source).toContain('onCopy')
    expect(source).toContain('data-compose-copy')
    expect(source).toContain('onSave')
    expect(source).toContain('data-compose-save')
    expect(source.indexOf('data-compose-copy')).toBeLessThan(source.indexOf('data-compose-cancel'))
    expect(source.indexOf('data-compose-save')).toBeLessThan(source.indexOf('data-compose-new-session'))
  })

  it('动作文案经由 labels 注入，不在组件里写死中文', () => {
    const source = composeCardSource()
    expect(source).toContain('labels.cancel')
    expect(source).toContain('labels.send')
    expect(source).toContain('labels.newSession')
    expect(codeWithoutComments()).not.toMatch(/[\u4e00-\u9fff]/)
  })
})

describe('统一编辑链路', () => {
  /** 四处编辑器：答案副本、本机文件、选区编辑、工作区文件（tab 复用本机文件组件）。 */
  const EDITORS = ['../src/answer-card.tsx', '../src/local-file.tsx', '../src/selection-edit-card.tsx']
  const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8')

  it('答案编辑不再经全局 DOM 查询读值（多卡同开不串值）', () => {
    const source = read('../src/answer-card.tsx')
    expect(source).not.toContain("document.querySelector('[data-answer-edit-input]')")
    expect(source).toContain('useRef')
  })

  it('四处编辑器全部接统一发送控制器与统一外壳', () => {
    for (const file of EDITORS) {
      const source = read(file)
      expect(source).toContain('createSendController')
      expect(source).toContain('ComposeCard')
    }
    expect(read('../src/conversation-tools.tsx')).toContain('LocalFileComposerCard')
  })

  it('发送动作文案统一：发送到当前会话 / 新建会话并发送', () => {
    for (const file of EDITORS) {
      const source = read(file)
      expect(source).toContain('compose.sendCurrent')
      expect(source).toContain('compose.sendNewSession')
    }
  })

  it('只有发送成功才收起：收起逻辑落在 onSuccess 回调里', () => {
    for (const file of EDITORS) {
      expect(read(file)).toContain('onSuccess')
    }
  })

  it('发送副本语义有提示：编辑卡带 copyHint 说明', () => {
    for (const file of EDITORS) {
      expect(read(file)).toContain('compose.copyHint')
    }
  })

  it('答案、选区和文件编辑全部使用统一顶栏复制，不在底栏另放复制', () => {
    for (const file of EDITORS) {
      const source = read(file)
      expect(source).toContain('onCopy=')
      expect(source).not.toContain('data-local-collapse')
    }
  })

  it('工具标签并入宿主「对话 / 轨迹」行：不再画第二排，改在宿主行上补挂自己的标签', () => {
    // 宿主 conversation.view 条目是全局的（标签行每个会话渲染同一份），放不下
    // 「每个会话各自的文件标签」；所以沿用文件树行控件的同款做法——在宿主
    // 渲染出来的标签行里补挂控件，选中状态仍归 toolsState。
    const tools = read('../src/conversation-tools.tsx')
    const row = read('../src/tools-tabs.ts')
    expect(tools).not.toContain('resourceTabs(')
    expect(tools).toContain('attachToolsRow')
    expect(row).toContain('data-conversation-tabs')
    expect(row).toContain('data-chat-tools-row')
    expect(row).toContain('data-chat-tools-tab-close')
    expect(row).toContain('data-chat-tools-live')
  })

  it('打开本机文件与链接偏好入口挂进宿主会话头部动作槽位', () => {
    expect(read('../src/conversation-tools.tsx')).toContain("name: 'conversation.session.header.actions'")
  })

  it('工具标签 Chrome 风格：框线分隔、当前标签突出、关闭钮在标签框内、过多时横向滚动', () => {
    const css = read('../src/conversation-tools.module.css')
    expect(css).toMatch(/\[data-chat-tools-tab\][^{]*\{[^}]*border/)
    expect(css).toMatch(/\[data-chat-tools-tab-active\][^{]*\{[^}]*border/)
    expect(css).toMatch(/\[data-chat-tools-tab-close\][^{]*\{[^}]*width:\s*(24|28)px/)
    expect(css).toMatch(/\[data-chat-tools-group\][^{]*\{[^}]*overflow-x:\s*auto/)
    expect(css).toMatch(/\[data-chat-tools-live\][^{]*\{[^}]*opacity/)
    // 关闭钮在标签框里：外壳（标题 + ×）自带框线，框内的关闭钮是一枚小圆钮。
    expect(css).toMatch(/\[data-chat-tools-tab-wrap\][^{]*\{[^}]*border/)
    expect(css).toMatch(/\[data-chat-tools-tab-wrap\]\s*\[data-chat-tools-tab-close\][^{]*\{[^}]*width:\s*(16|18|20)px/)
  })

  it('打开文件时：文件内容与上方（标签行）、下方（输入框）各留 10px', () => {
    const css = read('../src/conversation-tools.module.css')
    // 文件类标签激活时工具区带标记，样式据此给内容上下留白。
    expect(css).toMatch(/\[data-chat-tools-file-live\][^{]*\.body[^{]*\{[^}]*padding:\s*10px 0/)
    const tools = read('../src/conversation-tools.tsx')
    expect(tools).toContain('data-chat-tools-file-live')
    // 只有文件类标签（编辑标签 / 文档预览）算「打开文件」。
    expect(tools).toMatch(/fileLive[\s\S]{0,200}kind === 'local'[\s\S]{0,200}kind === 'text'/)
  })

  it('仅保存只给工作区文件的编辑：edit:// 开头的标签接写回通道，本机文件没有保存钮', () => {
    const tools = read('../src/conversation-tools.tsx')
    expect(tools).toContain('saveWorkspaceText')
    expect(tools).toMatch(/contentId\.startsWith\('edit:\/\/'\)/)
  })

  it('链接偏好收进更多菜单：工具栏不再有 select，文件打开菜单不再写全局偏好', () => {
    expect(read('../src/conversation-tools.tsx')).not.toContain('<select')
    expect(read('../src/markdown-turn-open.tsx')).not.toContain('writeDefaultLinkOpenMode')
  })
})

describe('文件卡片与选区统一', () => {
  const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8')

  it('批注锚点在文档变化后仍挂对应段落之后', async () => {
    const { composeWithComments, segmentWithComments } = await import('../src/markdown-turn.tsx')
    const source = '第一段。\n\n第二段。\n\n第三段。'
    const segments = segmentWithComments(source, [{ id: 1, blockText: '第二段。', comment: '看这段' }])
    expect(segments[0]!.text).toContain('第二段。')
    expect(segments[0]!.comments.map(comment => comment.comment)).toEqual(['看这段'])
    const composed = composeWithComments(source, [
      { blockText: '第二段。', comment: '批注甲' },
      { blockText: '第二段。', comment: '批注乙' },
    ])
    expect(composed.indexOf('批注甲')).toBeGreaterThan(composed.lastIndexOf('第二段。') - '第二段。'.length)
    expect(composed.indexOf('批注乙')).toBeGreaterThan(composed.indexOf('批注甲'))
  })

  it('汇总发送只在成功后清空批注：不再发送即清', () => {
    const source = read('../src/markdown-turn.tsx')
    expect(source).toContain('createSendController')
    expect(source).not.toMatch(/sendText\([^)]*\);\s*setComments\(\[\]\)/)
    expect(source).toMatch(/onSuccess[\s\S]{0,120}setComments\(\[\]\)/)
  })

  it('「本轮文件 · n」入口在点赞栏那排，文件行主名 + 目录辅助行', () => {
    const chip = read('../src/markdown-turn-chip.tsx')
    expect(chip).toContain('markdownTurn.filesGroup')
    const turn = read('../src/markdown-turn.tsx')
    expect(turn).toContain('nameDir')
    const locale = read('../src/locales.ts')
    expect(locale).toContain("'markdownTurn.filesGroup'")
    expect(locale).toContain("'markdownTurn.commentsPending'")
    expect(locale).toContain("'selection.collectedCount'")
  })

  it('选区与收集浮层只用宿主 token 材质；移除热区 24px、面板限高内部滚动', () => {
    const source = read('../src/selection-actions.ts')
    expect(source).not.toContain('background:#fff')
    expect(source).not.toContain('#2b2b30')
    expect(source).not.toContain('rgb(30 30 30')
    expect(source).not.toContain('prefers-color-scheme')
    expect(source).toMatch(/\.dshca-bar-remove\{[^}]*width:24px/)
    expect(source).toContain('max-height')
    expect(source).toMatch(/\.dshca-panel\{[^}]*overflow-y:auto/)
  })

  it('文件阅读区样式不再自带深色媒体查询（主题交给宿主 token）', () => {
    const css = read('../src/markdown-turn.module.css')
    expect(css).not.toContain('@media (prefers-color-scheme')
    expect(css).not.toContain('#2b2b30')
    expect(css).not.toContain('#4d6bfe')
  })
})

describe('余面统一：Mermaid、短 ID、宽表', () => {
  const read = (relative: string): string => readFileSync(new URL(relative, import.meta.url), 'utf8')

  it('Mermaid 状态可见：加载中、失败原因与重试都有界面入口', () => {
    const source = read('../src/mermaid.ts')
    expect(source).toContain('data-th-mermaid-status')
    expect(source).toContain('data-th-mermaid-error')
    expect(source).toContain('data-th-mermaid-retry')
    const locale = read('../src/locales.ts')
    expect(locale).toContain("'mermaid.renderFailed'")
    expect(locale).toContain("'mermaid.loading'")
  })

  it('复制按钮 32px 点击区、16px 图标；整条不再整体降透明度；换会话复位状态', () => {
    const css = read('../src/session-id-bar/session-id-bar.module.css')
    expect(css).toMatch(/width:\s*32px/)
    expect(css).not.toContain('opacity')
    const source = read('../src/session-id-bar/index.ts')
    expect(source).toMatch(/\[sessionId\]/)
    expect(source).toContain('copyViaClipboard')
    const locale = read('../src/locales.ts')
    expect(locale).toContain("'panel.sessionBar.copyUnavailable'")
  })

  it('宽表末列边距同时覆盖表头与单元格，选择器仍锚定 md-table-wide', () => {
    const source = read('../src/table-pad.ts')
    expect(source).toContain('md-table-wide td:last-child')
    expect(source).toContain('th:last-child')
  })

  it('退出文件编辑会丢弃草稿，关闭时移除暂存文本', () => {
    const source = read('../src/conversation-tools.tsx')
    expect(source).toMatch(/closeDocument[\s\S]{0,180}docs\.delete/)
  })
})

describe('统一发送控制器', () => {
  it('空白文本直接拒绝：不发起请求、不进入 pending、不回调', async () => {
    const sent: string[] = []
    const events: string[] = []
    const controller = createSendController({
      send: text => { sent.push(text); return Promise.resolve() },
      onSuccess: () => { events.push('success') },
      onFailure: () => { events.push('failure') },
      onPendingChange: pending => { events.push(`pending:${String(pending)}`) },
    })
    controller.submit('   ')
    await flush()
    expect(sent).toEqual([])
    expect(controller.pending).toBe(false)
    expect(events).toEqual([])
  })

  it('同一时刻只允许一次在途发送；上一笔完成后才能再发', async () => {
    const sent: string[] = []
    const succeeded: string[] = []
    const gate = deferred()
    const controller = createSendController({
      send: text => { sent.push(text); return gate.promise },
      onSuccess: text => { succeeded.push(text) },
    })
    controller.submit('第一笔')
    controller.submit('第二笔')
    expect(sent).toEqual(['第一笔'])
    expect(controller.pending).toBe(true)
    gate.resolve()
    await flush()
    expect(succeeded).toEqual(['第一笔'])
    expect(controller.pending).toBe(false)
    const gate2 = deferred()
    const sent2: string[] = []
    const controller2 = createSendController({ send: text => { sent2.push(text); return gate2.promise } })
    controller2.submit('第三笔')
    expect(sent2).toEqual(['第三笔'])
    gate2.resolve()
    await flush()
  })

  it('只有成功才报 onSuccess；失败走 onFailure 且原文交还（UI 据此保留草稿）', async () => {
    const outcomes: string[] = []
    const failureGate = deferred()
    const failing = createSendController({
      send: () => failureGate.promise,
      onSuccess: () => { outcomes.push('success') },
      onFailure: (_error, text) => { outcomes.push(`failure:${text}`) },
    })
    failing.submit('会失败的内容')
    failureGate.reject(new Error('网络断了'))
    await flush()
    expect(outcomes).toEqual(['failure:会失败的内容'])
    expect(failing.pending).toBe(false)

    const successGate = deferred()
    const succeeding = createSendController({
      send: () => successGate.promise,
      onSuccess: text => { outcomes.push(`success:${text}`) },
      onFailure: () => { outcomes.push('failure') },
    })
    succeeding.submit('会成功的内容')
    successGate.resolve()
    await flush()
    expect(outcomes.slice(1)).toEqual(['success:会成功的内容'])
    expect(succeeding.pending).toBe(false)
  })

  it('dispose 之后不再回报任何回调', async () => {
    const events: string[] = []
    const gate = deferred()
    const controller = createSendController({
      send: () => gate.promise,
      onSuccess: () => { events.push('success') },
      onFailure: () => { events.push('failure') },
      onPendingChange: pending => { events.push(`pending:${String(pending)}`) },
    })
    controller.submit('在途')
    expect(controller.pending).toBe(true)
    controller.dispose()
    expect(controller.pending).toBe(false)
    expect(events).toEqual(['pending:true', 'pending:false'])
    gate.resolve()
    await flush()
    expect(events).toEqual(['pending:true', 'pending:false'])
  })
})
