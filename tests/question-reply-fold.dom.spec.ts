// @vitest-environment jsdom
/**
 * 「模型提问，用户回答」场景的折叠回归（jsdom 真 document）。
 *
 * 宿主把用户对提问的回答渲染成 `question-reply` 行（user-questions 界面认领，
 * 不带 user / steering 标记）——折叠逻辑此前漏掉它，回答块一直占着当前轮的
 * 空间，把回答框往下挤。这里钉住：question-reply 行与用户请求行一样折进
 * 「请求 · 首句」条，点条可展开、再点收起；回答框限高后它也一并收起。
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  CAPPED_ATTR,
  REQUEST_BAR_ATTR,
  REQUEST_HIDDEN_ATTR,
  USER_ROW_SELECTOR,
  startTurnFold,
} from '../src/turn-fold.ts'

/** 一条会话行：带轮次号与 flow kind。 */
function chatRow(turn: number, kind: string, text = ''): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-turn', String(turn))
  row.setAttribute('data-chat-flow-kind', kind)
  if (text !== '') row.textContent = text
  return row
}

/** 一条带插件输出框的行；answer=true 时框里带答案正文标记。 */
function frameRow(turn: number, answer = false): HTMLElement {
  const row = chatRow(turn, answer ? 'assistant' : 'tool-call')
  const box = document.createElement('div')
  box.setAttribute('data-chat-power-frame-box', '')
  if (answer) {
    const body = document.createElement('div')
    body.setAttribute('data-answer-body', '')
    box.appendChild(body)
  }
  row.appendChild(box)
  return row
}

interface Built {
  readonly scroller: HTMLElement
  readonly flow: HTMLElement
  readonly userRow: HTMLElement
  readonly questionReplyRow: HTMLElement
  readonly answerRow: HTMLElement
  readonly stop: () => void
  readonly sync: () => void
}

/** 搭一棵单轮会话：用户请求 → 问题卡 → 用户回答（question-reply）→ 回答。 */
function buildConversation(): Built {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's-qa')
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const flow = document.createElement('div')
  const userRow = chatRow(7, 'user', '帮我把这个仓库的测试跑一遍')
  const cardRow = frameRow(7)
  const questionReplyRow = chatRow(7, 'question-reply', '选择：只跑受影响的包')
  const answerRow = frameRow(7, true)
  flow.append(userRow, cardRow, questionReplyRow, answerRow)
  scroller.appendChild(flow)
  session.appendChild(scroller)
  document.body.appendChild(session)
  // jsdom 恒 0 的 clientHeight 抬起来，让限高链路（CAPPED）走得通。
  Object.defineProperty(scroller, 'clientHeight', { value: 800, configurable: true })
  let sync: (() => void) | undefined
  const stop = startTurnFold({
    root: () => scroller,
    observe: (_target, callback) => {
      sync = callback
      return () => {}
    },
  })
  return { scroller, flow, userRow, questionReplyRow, answerRow, stop, sync: () => sync?.() }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('question-reply 行折进请求条', () => {
  it('识别范围覆盖 question-reply（否则回答块永远不折）', () => {
    expect(USER_ROW_SELECTOR).toContain('question-reply')
  })

  it('回答块默认随请求条收起，不再占据当前轮空间', () => {
    const { userRow, questionReplyRow } = buildConversation()
    expect(userRow.hasAttribute(REQUEST_HIDDEN_ATTR)).toBe(true)
    expect(questionReplyRow.hasAttribute(REQUEST_HIDDEN_ATTR)).toBe(true)
  })

  it('点请求条展开时回答块一起展开，再点收起', () => {
    const { scroller, questionReplyRow } = buildConversation()
    const bar = scroller.querySelector(`[${REQUEST_BAR_ATTR}]`)
    expect(bar).not.toBeNull()
    bar!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(questionReplyRow.hasAttribute(REQUEST_HIDDEN_ATTR)).toBe(false)
    bar!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(questionReplyRow.hasAttribute(REQUEST_HIDDEN_ATTR)).toBe(true)
  })

  it('回答框限高后：回答块（排在框前）也被收起', () => {
    const { sync, answerRow, questionReplyRow } = buildConversation()
    sync()
    expect(answerRow.querySelector('[data-chat-power-frame-box]')?.hasAttribute(CAPPED_ATTR)).toBe(true)
    expect(questionReplyRow.hasAttribute(REQUEST_HIDDEN_ATTR)).toBe(true)
  })
})
