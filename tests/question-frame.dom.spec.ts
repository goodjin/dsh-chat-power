// @vitest-environment jsdom
/**
 * 「提问记录」进回答框的**真实 DOM**回归。
 *
 * 宿主把「你回答了模型先前等待的问题」投影成一条 `question-reply` 节点。
 * 本包原来给它单独画一个框（标题「提问」），用户要它和回答在**同一个框**里。
 *
 * 做法：提问内容画进本包自带的容器（portal 的目标），DOM 路线再把**容器**
 * 搬进回答框底部预留的格子——搬容器不搬 React 子树，React 的调和不受影响。
 */
import { createElement, act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'

import {
  QUESTION_HOST_ATTR,
  QUESTION_SLOT_ATTR,
  placeQuestionHosts,
  QuestionRecord,
} from '../src/question-frame.tsx'

const ANSWER_ATTR = 'data-chat-power-answer-ready'

afterEach(() => { document.body.innerHTML = '' })

/** 搭一个回答框（带预留的提问格）与一条提问行。 */
function buildDom(): { answer: HTMLElement; slot: HTMLElement; questionRow: HTMLElement } {
  document.body.innerHTML = `
    <div data-chat-flow-kind="assistant-step" ${ANSWER_ATTR} id="answer">
      <div>回答正文</div>
      <div ${QUESTION_SLOT_ATTR} id="slot"></div>
    </div>
    <div data-chat-flow-kind="question-reply" id="qrow"></div>`
  return {
    answer: document.getElementById('answer') as HTMLElement,
    slot: document.getElementById('slot') as HTMLElement,
    questionRow: document.getElementById('qrow') as HTMLElement,
  }
}

describe('提问记录进回答框', () => {
  it('提问内容画进自带容器，容器被搬进回答框底部的那一格', async () => {
    const { answer, slot, questionRow } = buildDom()
    const root = createRoot(questionRow)
    await act(async () => {
      root.render(createElement(QuestionRecord, null, createElement('span', null, '你回答了模型的问题')))
    })
    // 内容画进自带容器（portal 的目标就是这个容器），DOM 路线随即把容器
    // 搬进回答框底部预留的格子。
    const host = slot.querySelector<HTMLElement>(`[${QUESTION_HOST_ATTR}]`)
    expect(host).not.toBeNull()
    expect(host!.textContent).toContain('你回答了模型的问题')
    expect(slot.textContent).toContain('你回答了模型的问题')
    expect(answer.contains(host!)).toBe(true)
  })

  it('搬走后宿主那条空行不留白', async () => {
    const { questionRow } = buildDom()
    const root = createRoot(questionRow)
    await act(async () => {
      root.render(createElement(QuestionRecord, null, createElement('span', null, '记录')))
    })
    placeQuestionHosts()
    expect(questionRow.getAttribute('data-chat-power-question-moved')).toBe('')
    expect(document.getElementById('slot')!.querySelector(`[${QUESTION_HOST_ATTR}]`)).not.toBeNull()
  })

  it('已经在回答框里的不再搬（幂等）', async () => {
    const { slot, questionRow } = buildDom()
    const root = createRoot(questionRow)
    await act(async () => {
      root.render(createElement(QuestionRecord, null, createElement('span', null, '记录')))
    })
    // 组件挂载时已经归位，再搬是空操作。
    expect(placeQuestionHosts()).toBe(0)
    expect(slot.querySelectorAll(`[${QUESTION_HOST_ATTR}]`)).toHaveLength(1)
  })

  it('前面没有回答框时留在原处，不硬塞', async () => {
    document.body.innerHTML = '<div data-chat-flow-kind="question-reply" id="qrow"></div>'
    const questionRow = document.getElementById('qrow') as HTMLElement
    const root = createRoot(questionRow)
    await act(async () => {
      root.render(createElement(QuestionRecord, null, createElement('span', null, '记录')))
    })
    expect(placeQuestionHosts()).toBe(0)
    expect(questionRow.querySelector(`[${QUESTION_HOST_ATTR}]`)).not.toBeNull()
    expect(document.querySelector(`[${QUESTION_SLOT_ATTR}] [${QUESTION_HOST_ATTR}]`)).toBeNull()
  })
})
