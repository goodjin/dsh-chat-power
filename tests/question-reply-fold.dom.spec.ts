// @vitest-environment jsdom
/**
 * 「模型提问，用户回答」场景（jsdom 真 document）。
 *
 * 宿主把用户对提问的回答渲染成 `question-reply` 行（user-questions 界面认领，
 * 不带 user / steering 标记）。每轮一框的设计下，这类行归入「请求」页签——
 * 与用户请求一样，点框标题行的「请求」页签才展示，不占默认（结果）视图的空间。
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  TAB_HIDDEN_ATTR,
  TURN_FRAME_ATTR,
  TURN_TAB_ATTR,
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

/** 一条带答案正文的行。 */
function answerRow(turn: number): HTMLElement {
  const row = chatRow(turn, 'assistant')
  const box = document.createElement('div')
  box.setAttribute('data-answer-body', '')
  row.appendChild(box)
  return row
}

/** 搭一棵单轮会话：用户请求 → 用户回答（question-reply）→ 回答 → composer。 */
function buildConversation(): { scroller: HTMLElement; rows: HTMLElement[]; stop: () => void } {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's-qa')
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const flow = document.createElement('div')
  const userRow = chatRow(7, 'user', '帮我把这个仓库的测试跑一遍')
  const questionReplyRow = chatRow(7, 'question-reply', '选择：只跑受影响的包')
  const answer = answerRow(7)
  flow.append(userRow, questionReplyRow, answer)
  scroller.appendChild(flow)
  const seat = document.createElement('div')
  seat.setAttribute('data-composer-seat', '')
  scroller.appendChild(seat)
  session.appendChild(scroller)
  document.body.appendChild(session)
  Object.defineProperty(scroller, 'clientHeight', { value: 800, configurable: true })
  const stop = startTurnFold({
    root: () => scroller,
    observe: (_target, callback) => {
      callback()
      return () => {}
    },
  })
  return { scroller, rows: [userRow, questionReplyRow, answer], stop }
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('question-reply 行归入请求页签', () => {
  it('识别范围覆盖 question-reply（否则回答块进不了请求视图）', () => {
    expect(USER_ROW_SELECTOR).toContain('question-reply')
  })

  it('默认结果视图：question-reply 行隐藏，不占结果的空间', () => {
    const { rows } = buildConversation()
    const [, questionReplyRow] = rows
    expect(questionReplyRow!.hasAttribute(TAB_HIDDEN_ATTR)).toBe(true)
  })

  it('点「请求」页签：question-reply 行与用户请求一起展示', () => {
    const { scroller, rows } = buildConversation()
    const frame = scroller.querySelector(`[${TURN_FRAME_ATTR}]`)!
    const requestTab = frame.querySelector(`[${TURN_TAB_ATTR}][data-tab='request']`) as HTMLElement
    expect(requestTab).not.toBeNull()
    requestTab.click()
    const [, questionReplyRow, answer] = rows
    expect(questionReplyRow!.hasAttribute(TAB_HIDDEN_ATTR)).toBe(false)
    // 结果行（答案）在请求视图里隐藏。
    expect(answer!.hasAttribute(TAB_HIDDEN_ATTR)).toBe(true)
  })
})
