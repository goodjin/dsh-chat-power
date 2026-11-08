/**
 * 工具调用帧（也用于错误、重试、压缩等其它节点类型）：内容由宿主渲染，
 * **框的外壳、标题、裁切由我们决定**——与思考帧、回答帧同一套框机制。
 */
import type { ReactNode } from 'react'
import type { RuntimeT } from './locales.ts'
import styles from './tools-frame.module.css'

/** 帧的 data 标记：DOM 层靠它认出「这是工具调用帧」。 */
export const TOOLS_FRAME_ATTR = 'data-chat-power-tools-frame'

export function ToolsFrame(props: {
  /** 文案（标题「工具调用」）。 */
  readonly t: RuntimeT
  /** 标题文案；不传就用「工具调用」。 */
  readonly label?: string
  /** 帧的类型（决定边框颜色）。 */
  readonly kind?: string
  /** 内容（宿主的原生渲染）。 */
  readonly children: ReactNode
}): ReactNode {
  return (
    <div
      className={styles.frame}
      {...{
        [TOOLS_FRAME_ATTR]: '',
        'data-chat-power-frame-box': '',
        'data-chat-power-kind': props.kind ?? 'tools',
      }}
    >
      <div className={styles.header} data-chat-power-frame-header="">
        <span className={styles.title}>{props.label ?? props.t('turnFold.frameTools')}</span>
        <span className={styles.state} data-chat-power-state="" />
      </div>
      {props.children}
    </div>
  )
}
