/**
 * 工具调用帧：工具调用内容由本包接管编排。
 *
 * 内容仍由宿主渲染（我们把原生工具视图放进来，样式与官方一致）；**框的外壳、
 * 标题文案、裁切由我们决定**——与思考帧、回答帧同一套框机制。
 */
import type { ReactNode } from 'react'
import type { RuntimeT } from './locales.ts'
import styles from './tools-frame.module.css'

/** 帧的 data 标记：DOM 层靠它认出「这是工具调用帧」。 */
export const TOOLS_FRAME_ATTR = 'data-chat-power-tools-frame'

export function ToolsFrame(props: {
  /** 文案（标题「工具调用」）。 */
  readonly t: RuntimeT
  /** 内容（宿主的原生工具视图）。 */
  readonly children: ReactNode
}): ReactNode {
  return (
    <div className={styles.frame} {...{ [TOOLS_FRAME_ATTR]: '', 'data-chat-power-frame-box': '' }}>
      <div className={styles.label}>{props.t('turnFold.frameTools')}</div>
      {props.children}
    </div>
  )
}
