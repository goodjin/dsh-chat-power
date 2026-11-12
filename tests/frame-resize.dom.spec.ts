// @vitest-environment jsdom
/**
 * 块的上下拖拽（jsdom 真 document）。
 *
 * 之前只有宿主的会话列左右拖拽；这里钉住两类上下拖拽：
 * 1. 每个插件输出框（回答卡 / 思考帧 / 工具帧…）底边的把手——上下拉动直接
 *    设定这块的高度（优先于自动限高），双击恢复自动高度；
 * 2. 输入框顶边的把手——向上拉加高输入区（放宽宿主的输入区高度上限），
 *    高度记进 localStorage（重开保留），向下拉回最小值以下即清除。
 */
import { afterEach, describe, expect, it } from 'vitest'

import { startTurnFold } from '../src/turn-fold.ts'
import {
  COMPOSER_HEIGHT_KEY,
  COMPOSER_RESIZE_ATTR,
  FRAME_RESIZE_ATTR,
} from '../src/frame-resize.ts'

function frameRow(turn: number, answer = false): HTMLElement {
  const row = document.createElement('div')
  row.setAttribute('data-chat-turn', String(turn))
  row.setAttribute('data-chat-flow-kind', answer ? 'assistant' : 'tool-call')
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
  readonly seat: HTMLElement
  readonly region: HTMLElement
  readonly boxes: HTMLElement[]
  readonly stop: () => void
}

/** 单轮会话：工具框 + 答案框，滚动层末尾是带文本区的 composer 座位。 */
function buildConversation(): Built {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's-resize')
  const scroller = document.createElement('div')
  scroller.setAttribute('data-conversation-scroll', '')
  const flow = document.createElement('div')
  const toolRow = frameRow(3)
  const answerRow = frameRow(3, true)
  flow.append(toolRow, answerRow)
  // composer：座位 → 卡 → 滚动文本区（overflow-y auto）→ 编辑器。
  const seat = document.createElement('div')
  seat.setAttribute('data-composer-seat', '')
  const card = document.createElement('div')
  const region = document.createElement('div')
  region.style.overflowY = 'auto'
  const editor = document.createElement('div')
  editor.setAttribute('contenteditable', 'true')
  region.appendChild(editor)
  card.appendChild(region)
  seat.appendChild(card)
  scroller.append(flow, seat)
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
  const boxes = Array.from(scroller.querySelectorAll<HTMLElement>('[data-chat-power-frame-box]'))
  return { scroller, seat, region, boxes, stop }
}

/** 指针拖拽：按下 → 移动 → 松开。 */
function drag(handle: Element, fromY: number, toY: number): void {
  handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientY: fromY }))
  window.dispatchEvent(new MouseEvent('pointermove', { clientY: toY }))
  window.dispatchEvent(new MouseEvent('pointerup', { clientY: toY }))
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
})

describe('块底边的上下拖拽把手', () => {
  it('当前轮每个输出框底边都有把手', () => {
    const { boxes } = buildConversation()
    expect(boxes.length).toBe(2)
    for (const box of boxes) {
      expect(box.querySelector(`[${FRAME_RESIZE_ATTR}]`)).not.toBeNull()
    }
  })

  it('向下拖动加高：松手后框上带有用户设定高度（优先于自动限高）', () => {
    const { boxes } = buildConversation()
    const box = boxes[0]!
    drag(box.querySelector(`[${FRAME_RESIZE_ATTR}]`)!, 500, 640)
    expect(box.style.getPropertyValue('--chat-power-resize')).toBe('140px')
  })

  it('向上拖到最小值以下：恢复自动高度（清除设定）', () => {
    const { boxes } = buildConversation()
    const box = boxes[0]!
    drag(box.querySelector(`[${FRAME_RESIZE_ATTR}]`)!, 500, 100)
    expect(box.style.getPropertyValue('--chat-power-resize')).toBe('')
  })

  it('双击把手恢复自动高度', () => {
    const { boxes } = buildConversation()
    const box = boxes[0]!
    const handle = box.querySelector(`[${FRAME_RESIZE_ATTR}]`)!
    drag(handle, 500, 640)
    expect(box.style.getPropertyValue('--chat-power-resize')).toBe('140px')
    handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    expect(box.style.getPropertyValue('--chat-power-resize')).toBe('')
  })
})

describe('输入框顶边的拖拽把手', () => {
  it('composer 座位顶边有把手', () => {
    const { seat } = buildConversation()
    expect(seat.querySelector(`[${COMPOSER_RESIZE_ATTR}]`)).not.toBeNull()
  })

  it('向上拖动加高输入区：放宽宿主上限 + 文本区最小高度，并记忆', () => {
    const { seat, region } = buildConversation()
    drag(seat.querySelector(`[${COMPOSER_RESIZE_ATTR}]`)!, 300, 180)
    expect(seat.style.getPropertyValue('--dsh-composer-text-max-height')).toBe('120px')
    expect(region.style.minHeight).toBe('120px')
    expect(localStorage.getItem(COMPOSER_HEIGHT_KEY)).toBe('120')
  })

  it('向下拖回最小值以下：清除设定与记忆', () => {
    const { seat, region } = buildConversation()
    const handle = seat.querySelector(`[${COMPOSER_RESIZE_ATTR}]`)!
    drag(handle, 300, 180)
    drag(handle, 180, 400)
    expect(seat.style.getPropertyValue('--dsh-composer-text-max-height')).toBe('')
    expect(region.style.minHeight).toBe('')
    expect(localStorage.getItem(COMPOSER_HEIGHT_KEY)).toBeNull()
  })

  it('重开（新的折叠控制器）后输入区保持上次的加高', () => {
    const first = buildConversation()
    drag(first.seat.querySelector(`[${COMPOSER_RESIZE_ATTR}]`)!, 300, 180)
    first.stop()
    // 停止时清掉页面上套的高度（记忆还在）；重开后从记忆恢复。
    expect(first.seat.style.getPropertyValue('--dsh-composer-text-max-height')).toBe('')
    const second = buildConversation()
    expect(second.seat.style.getPropertyValue('--dsh-composer-text-max-height')).toBe('120px')
    expect(second.region.style.minHeight).toBe('120px')
    second.stop()
  })
})
