/**
 * 「提问记录」放进回答框里。
 *
 * 宿主把「你回答了模型先前等待的问题」投影成一条 `question-reply` 节点（会话级，
 * 没有轮次号）。本包原来给它单独画一个框（标题「提问」），于是它在会话里是
 * 一个和回答框平级的独立盒子——用户要的是它和回答**在同一个框里**。
 *
 * 宿主行不能搬（挪走破坏 React 调和，2026-11-13 现场：会话区直接清空），所以
 * 走「搬容器、不搬 React 子树」这条路：
 *
 * - 提问内容由本包渲染成一个**自带的宿主 div**（`data-chat-power-question-host`），
 *   React 用 portal 画进这个 div——portal 的目标就是这个 div 本身；
 * - DOM 路线再把这个 div 整个搬进回答框底部预留的那一格
 *   （`data-chat-power-answer-question`）。
 *
 * 搬的是 portal 的**目标容器**，React 只关心目标还是不是一个 DOM 元素，
 * 不关心它被挪到了哪里——所以调和不会坏（这与「把 React 渲染出来的节点搬走」
 * 是两回事：那种搬法会让 React 在卸载时报「要删的节点不是子节点」）。
 *
 * 目标回答框的选法：提问记录在 DOM 里**前面**最近的那个回答框——提问是模型在
 * 那一轮里提出的，记录归那一轮的答案。找不到就留在原处（照旧是自己的框），
 * 不硬塞。
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import './question-frame.module.css'

/** 提问内容的宿主 div（portal 的目标）：DOM 路线把它搬进回答框。 */
export const QUESTION_HOST_ATTR = 'data-chat-power-question-host'
/** 回答框里预留的那一格：提问记录搬进来后落在框底。 */
export const QUESTION_SLOT_ATTR = 'data-chat-power-answer-question'
/** 回答框（答案行）标记，与 answer-frame.ts 一致。 */
const ANSWER_BOX_ATTR = 'data-chat-power-answer-ready'

/**
 * 提问记录的内容。
 *
 * @param props - 提问内容（宿主自己的提问/回答视图）。
 * @returns 一个可被搬动的宿主 div。
 */
export function QuestionRecord({ children }: { children: ReactNode }): ReactNode {
  const hostRef = useRef<HTMLDivElement>(null)
  const [host, setHost] = useState<HTMLDivElement | null>(null)
  useEffect(() => { setHost(hostRef.current) }, [])
  // 画进自带容器后，DOM 路线再把容器搬进回答框。
  useEffect(() => { if (host !== null) placeQuestionHosts() }, [host, children])
  return <div ref={hostRef} {...{ [QUESTION_HOST_ATTR]: '' }}>{host === null ? null : createPortal(children, host)}</div>
}

/** 提问记录前面的那个回答框；没有就 undefined。 */
function answerBoxBefore(node: Element): HTMLElement | null {
  let found: HTMLElement | null = null
  for (const box of Array.from(document.querySelectorAll<HTMLElement>(`[${ANSWER_BOX_ATTR}]`))) {
    const precedes = (box.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    if (precedes) found = box
  }
  return found
}

/**
 * 把还没归位的提问记录搬进前面那个回答框。
 *
 * @returns 搬动了几条。
 */
export function placeQuestionHosts(): number {
  if (typeof document === 'undefined') return 0
  let moved = 0
  for (const host of Array.from(document.querySelectorAll<HTMLElement>(`[${QUESTION_HOST_ATTR}]`))) {
    // 已经在回答框里（或没有目标）就不动。
    if (host.closest(`[${ANSWER_BOX_ATTR}]`) !== null) continue
    const box = answerBoxBefore(host)
    if (box === null) continue
    let slot = box.querySelector<HTMLElement>(`[${QUESTION_SLOT_ATTR}]`)
    if (slot === null) {
      slot = document.createElement('div')
      slot.setAttribute(QUESTION_SLOT_ATTR, '')
      box.appendChild(slot)
    }
    // 原来那条宿主行：搬走之前先记住（搬完之后它在回答框里了）。
    const originRow = host.closest('[data-chat-flow-kind]')
    slot.appendChild(host)
    // 宿主那条行现在空了：藏掉它，免得留一条空白。
    if (originRow !== null && originRow !== box && originRow.querySelector(`[${QUESTION_HOST_ATTR}]`) === null) {
      originRow.setAttribute('data-chat-power-question-moved', '')
    }
    moved += 1
  }
  return moved
}

let observer: MutationObserver | undefined

/**
 * 盯着页面变化：回答框是后出现的（回答完成才画框），提问记录要等它。
 * @returns 停止观察的函数。
 */
export function observeQuestionPlacement(): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  if (observer === undefined) {
    observer = new MutationObserver(() => { placeQuestionHosts() })
    observer.observe(document.body, { childList: true, subtree: true })
  }
  return () => {}
}
