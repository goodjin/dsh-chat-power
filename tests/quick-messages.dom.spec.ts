// @vitest-environment jsdom
/**
 * 快捷信息面板（jsdom 真 document，走 startTurnFold 真实管线）。
 *
 * 点赞行里的快捷信息按钮：点开是一个信息列表浮层——点信息条直接发送到当前会话；
 * 条右侧「编辑」打开编辑框改文本、「删除」删掉这条；底部「新增」进草稿编辑态，
 * 保存后才入库（空草稿取消即丢弃）；再点按钮关闭；点面板外也关闭。
 * 列表存 localStorage，重开保留。
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  QUICK_BTN_ATTR,
  QUICK_MESSAGES_KEY,
  QUICK_PANEL_ATTR,
  startTurnFold,
} from '../src/turn-fold.ts'

/** 一条答案行 + 点赞行（宿主把按钮组画在 holder 里），挂进单轮会话。 */
function buildConversation(sessionId = 's-q'): { holder: HTMLElement; scroller: HTMLElement; sync: () => void; stop: () => void } {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', sessionId)
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const flow = document.createElement('div')
  const row = document.createElement('div')
  row.setAttribute('data-chat-turn', '1')
  const answerRow = document.createElement('div')
  answerRow.setAttribute('data-chat-turn', '1')
  const box = document.createElement('div')
  box.setAttribute('data-chat-power-frame-box', '')
  const body = document.createElement('div')
  body.setAttribute('data-answer-body', '')
  box.appendChild(body)
  answerRow.appendChild(box)
  const holder = document.createElement('div')
  const like = document.createElement('button')
  like.setAttribute('aria-pressed', 'false')
  holder.appendChild(like)
  answerRow.appendChild(holder)
  flow.append(row, answerRow)
  scroller.appendChild(flow)
  session.appendChild(scroller)
  document.body.appendChild(session)
  Object.defineProperty(scroller, 'clientHeight', { value: 800, configurable: true })
  let sync: (() => void) | undefined
  const stop = startTurnFold({
    root: () => scroller,
    observe: (_target, callback) => {
      sync = callback
      return () => {}
    },
    onSendQuick: text => {
      // 测试只关心文本被发出（会话号由夹具保证存在）。
      void text
    },
  })
  sync?.()
  return { holder, scroller, sync: () => sync?.(), stop }
}

function panelOf(): HTMLElement | null {
  return document.querySelector(`[${QUICK_PANEL_ATTR}]`)
}

function quickButtonOf(): HTMLElement | null {
  return document.querySelector(`[${QUICK_BTN_ATTR}]`)
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.removeItem(QUICK_MESSAGES_KEY)
})

describe('快捷信息面板', () => {
  it('点赞行挂上快捷按钮（幂等：重渲染不重复挂）', () => {
    const { sync } = buildConversation()
    expect(quickButtonOf()).not.toBeNull()
    sync()
    expect(document.querySelectorAll(`[${QUICK_BTN_ATTR}]`).length).toBe(1)
  })

  it('点按钮开面板，再点关闭', () => {
    const { } = buildConversation()
    const btn = quickButtonOf()!
    btn.click()
    expect(panelOf()).not.toBeNull()
    btn.click()
    expect(panelOf()).toBeNull()
  })

  it('面板里有内置条目；点信息条发送并关面板', () => {
    const sent: string[] = []
    const session = document.querySelector('[data-conversation-session]')
    session?.setAttribute('data-conversation-session', 's-send')
    const { stop } = buildConversation('s-send')
    stop()
    // 重新起一个控制器，这次捕获发送的文本。
    const scroller = document.querySelector('[data-conversation-scroll]')!
    const stop2 = startTurnFold({
      root: () => scroller,
      observe: () => () => {},
      onSendQuick: text => { sent.push(text) },
    })
    quickButtonOf()!.click()
    const panel = panelOf()!
    const items = panel.querySelectorAll('[data-chat-power-quick-row]')
    expect(items.length).toBeGreaterThanOrEqual(3)
    ;(items[0] as HTMLElement).click()
    expect(sent).toHaveLength(1)
    expect(sent[0]!.length).toBeGreaterThan(0)
    expect(panelOf()).toBeNull()
    stop2()
  })

  it('点条目右侧「删除」：条目从列表移除并存回 localStorage', () => {
    buildConversation()
    quickButtonOf()!.click()
    const before = panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length
    const del = panelOf()!.querySelector('[data-chat-power-quick-remove-btn]') as HTMLElement
    del.click()
    expect(panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length).toBe(before - 1)
    // 面板还开着（继续管理列表），存储同步更新。
    expect(panelOf()).not.toBeNull()
    expect(JSON.parse(localStorage.getItem(QUICK_MESSAGES_KEY) ?? '[]')).toHaveLength(before - 1)
  })

  it('点「编辑」进入编辑框（textarea），保存后文本更新', () => {
    buildConversation()
    quickButtonOf()!.click()
    const panel = panelOf()!
    ;(panel.querySelector('[data-chat-power-quick-edit-btn]') as HTMLElement).click()
    const box = panel.querySelector('[data-chat-power-quick-edit]') as HTMLTextAreaElement
    expect(box).not.toBeNull()
    box.value = '改过的内容'
    ;(panel.querySelector('[data-chat-power-quick-actions] button') as HTMLElement).click()
    const stored = JSON.parse(localStorage.getItem(QUICK_MESSAGES_KEY) ?? '[]') as { text: string }[]
    expect(stored.some(item => item.text === '改过的内容')).toBe(true)
    // 编辑完回到列表态。
    expect(panel.querySelector('[data-chat-power-quick-edit]')).toBeNull()
  })

  it('点底部「新增」：进独立编辑态；保存入库、回到列表；空草稿取消不入库', () => {
    buildConversation()
    quickButtonOf()!.click()
    // 内置三条只是展示默认值：未保存前 localStorage 仍是空的。
    const rowsBefore = panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length
    expect(rowsBefore).toBeGreaterThanOrEqual(3)
    expect(JSON.parse(localStorage.getItem(QUICK_MESSAGES_KEY) ?? '[]')).toHaveLength(0)
    ;(panelOf()!.querySelector('[data-chat-power-quick-add]') as HTMLElement).click()
    // 独立编辑态：已有记录全部隐藏，只有编辑框与按钮区。
    const editor = panelOf()!.querySelector('[data-chat-power-quick-edit]') as HTMLTextAreaElement
    expect(editor).not.toBeNull()
    expect(panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length).toBe(0)
    // 取消：不入库（存储仍空），回到列表态。
    const cancelBtn = panelOf()!.querySelectorAll('[data-chat-power-quick-actions] button')[1] as HTMLElement
    cancelBtn.click()
    expect(JSON.parse(localStorage.getItem(QUICK_MESSAGES_KEY) ?? '[]')).toHaveLength(0)
    expect(panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length).toBe(rowsBefore)
    // 再走一次：保存入库，回到列表态，条数加一。
    ;(panelOf()!.querySelector('[data-chat-power-quick-add]') as HTMLElement).click()
    const editor2 = panelOf()!.querySelector('[data-chat-power-quick-edit]') as HTMLTextAreaElement
    editor2.value = '新加的一条'
    ;(panelOf()!.querySelector('[data-chat-power-quick-actions] button') as HTMLElement).click()
    const stored = JSON.parse(localStorage.getItem(QUICK_MESSAGES_KEY) ?? '[]') as { text: string }[]
    expect(stored.some(item => item.text === '新加的一条')).toBe(true)
    expect(panelOf()!.querySelectorAll('[data-chat-power-quick-row]').length).toBe(rowsBefore + 1)
  })

  it('面板打开时点面板外关闭', () => {
    buildConversation()
    quickButtonOf()!.click()
    expect(panelOf()).not.toBeNull()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, bubblesPhase: true } as MouseEventInit))
    expect(panelOf()).toBeNull()
  })

  it('面板挂在 body 下（宿主重渲染消息区不冲掉面板）', () => {
    buildConversation()
    quickButtonOf()!.click()
    const panel = panelOf()!
    // 面板的父级是 body：宿主把点赞行整块重画也碰不到它。
    expect(panel.parentElement).toBe(document.body)
  })

  it('面板内点击不冒泡出面板（宿主监听不到面板内部交互）', () => {
    buildConversation()
    quickButtonOf()!.click()
    const panel = panelOf()!
    let escaped = false
    document.addEventListener('click', () => { escaped = true }, { once: true })
    // 模拟点击面板本体（编辑框内点击同样路径：面板容器拦截传播）。
    panel.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(escaped).toBe(false)
  })

  it('点「新增」：切换到独立编辑界面（列表隐藏，只有编辑框与保存/取消）', () => {
    buildConversation()
    quickButtonOf()!.click()
    ;(panelOf()!.querySelector('[data-chat-power-quick-add]') as HTMLElement).click()
    const panel = panelOf()!
    // 独立编辑界面：没有已有记录的条目，只有编辑框和按钮区。
    expect(panel.querySelectorAll('[data-chat-power-quick-row]').length).toBe(0)
    expect(panel.querySelector('[data-chat-power-quick-edit]')).not.toBeNull()
    expect(panel.querySelector('[data-chat-power-quick-actions]')).not.toBeNull()
  })
})
