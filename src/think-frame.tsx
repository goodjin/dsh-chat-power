/**
 * 思考帧：思考内容由本包接管渲染。
 *
 * 正文用宿主自己的 Markdown 组件渲染（`MarkdownText`，样式与官方一致）；**帧的
 * 外壳与标题行由我们决定**：标题行用官方图标 + 我们的文案，框的边框颜色按
 * 帧的类型区分；外框、裁切、贴底交给 DOM 层（`src/turn-fold.ts`）按帧的标记
 * 统一处理。
 *
 * 这样宿主「流式只给一行摘要」的预览规则就管不到我们：正文我们自己取，
 * 逐行长出来。
 */
import { IconThinkOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import { useState, type ReactNode } from 'react'
import { labelsFor } from './markdown-labels.ts'
import type { RuntimeT } from './locales.ts'
import styles from './think-frame.module.css'

/** 帧的 data 标记：DOM 层靠它认出「这是思考帧」。 */
export const THINK_FRAME_ATTR = 'data-chat-power-think-frame'

export function ThinkFrame(props: {
  /** 文案（标题「思考」）。 */
  readonly t: RuntimeT
  /** 思考正文（宿主节点的 reasoning 块拼起来的原文）。 */
  readonly text: string
  /** 是否还在流式输出。 */
  readonly running: boolean
}): ReactNode {
  const [open, setOpen] = useState(true)
  return (
    <div
      className={styles.frame}
      {...{
        [THINK_FRAME_ATTR]: '',
        'data-chat-power-frame-box': '',
        'data-chat-power-kind': 'thinking',
      }}
    >
      <div className={styles.header} data-chat-power-frame-header="">
        <IconThinkOutlineRegular size={14} className={styles.icon} />
        <span className={styles.title}>{props.t('turnFold.frameThinking')}</span>
        <span className={styles.state} data-chat-power-state="" />
      </div>
      {open && <MarkdownText text={props.text} streaming={props.running} labels={labelsFor(props.t)} />}
    </div>
  )
}
