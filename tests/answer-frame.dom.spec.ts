import { afterEach, expect, it } from 'vitest'
import { ANSWER_FRAME_SELECTOR, installAnswerFrame } from '../src/answer-frame.ts'

afterEach(() => { document.body.innerHTML = ''; document.head.innerHTML = '' })

it('只框住原生回答：保留图片、思考/工具节点、宿主隐藏态和节点位置', () => {
  document.body.innerHTML = `<main data-conversation-scroll>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="reasoning"><div data-slot="conversation.chat.node">思考</div></div>
    <div data-chat-flow-kind="assistant-step" data-turn-process-member="true" hidden><div data-slot="conversation.chat.node">中间回复</div></div>
    <div data-chat-flow-kind="tool-call"><div data-slot="conversation.chat.node">工具</div></div>
    <div data-chat-flow-kind="assistant-step" data-chat-group-part="response" id="answer"><div data-slot="conversation.chat.node" style="display:contents">回答<img src="data:," /></div></div>
  </main>`
  const before = document.body.innerHTML
  const answer = document.getElementById('answer')!
  const stop = installAnswerFrame(document)
  expect([...document.querySelectorAll(ANSWER_FRAME_SELECTOR)]).toEqual([answer])
  expect(getComputedStyle(answer).borderTopWidth).toBe('1px')
  expect(document.body.innerHTML).toBe(before)
  // 流式替换正文无需插件观察器或搬运；同一原生槽位继续承载内容。
  answer.append('继续输出')
  expect(document.querySelector(ANSWER_FRAME_SELECTOR)).toBe(answer)
  stop()
  expect(document.head.querySelector('style')).toBeNull()
  expect(answer.textContent).toBe('回答继续输出')
})
