/**
 * 统一编辑卡外壳：标题 / 说明 + 正文 + 动作行。
 *
 * 答案副本、本机文件、选区编辑、工作区文件编辑共用这一层外壳：
 * - 顶栏左侧是来源（图标 + 标题），右侧固定「复制」与「退出编辑」；
 * - 底部动作行右侧依次是「仅保存」（只有文件编辑提供）、「新建会话并发送」
 *   与圆形发送钮；弱操作经 `actions` 放在动作行左侧；
 * - 正文（textarea）由调用方作为 children 提供——ref 与草稿留在调用方手里，
 *   多张卡同开也不会经全局 DOM 查询串值；
 * - 发送在 `pending`（在途）或 `sendDisabled`（空白）时禁用，防重复提交；
 * - 文案全部经 `labels` 注入，组件不写死任何语言。
 *
 * 样式全部来自 ui-theme.ts 的共享类；深浅主题随宿主 token。
 */
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconCheckOutlineRegular, IconCloseOutlineRegular, IconCopyOutlineRegular, IconNewChatOutlineRegular, IconSendOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import {
  btnClass,
  panelActionsClass,
  panelClass,
  panelHeadClass,
  panelSpacerClass,
  panelSubtitleClass,
  panelTitleClass,
  panelTitleWrapClass,
  sendClass,
  uiButtonClass,
} from './ui-theme.ts'

/** 动作文案；由调用方从词典取好再传入，组件内不写死语言。 */
export interface ComposeCardLabels {
  readonly cancel: string
  readonly send: string
  readonly newSession: string
  /** 顶栏复制钮的文案。 */
  readonly copy: string
  /** 底部「仅保存」钮的文案；只在文件编辑（有写回目标）时需要。 */
  readonly save?: string
}

export function ComposeCard(props: {
  /** 挂入宿主输入框的两个自有节点，不移动宿主编辑器。 */
  readonly mounts?: { head: Element; actions: Element }
  /** 标题：内容来源（如文件名、「编辑回答副本」）。 */
  readonly title: ReactNode
  /** 标题下的辅助说明（如「发送副本」提示）。 */
  readonly subtitle?: ReactNode
  /** 头部最左的附加内容（文件图标、计数等）。 */
  readonly headExtra?: ReactNode
  /** 头部右侧、取消钮之前的附加按钮（如「收起」）。 */
  readonly headerActions?: ReactNode
  /** 附加到面板根元素的类名（覆盖层填充等布局微调）。 */
  readonly className?: string
  /** 动作行左侧的弱操作（复制全文等）。 */
  readonly actions?: ReactNode
  /** 正文本体；调用方持有 textarea 的 ref 与草稿。 */
  readonly children: ReactNode
  /** 取消（退出编辑）：缺席则头部不出现退出钮。退出编辑直接丢弃草稿。 */
  readonly onCancel?: () => void
  /** 顶栏复制：把正文写进剪贴板，不发送、不影响草稿。 */
  readonly onCopy?: () => void
  /** 发送到当前会话。 */
  readonly onSend?: () => void
  /** 新建会话并发送。 */
  readonly onSendNewSession?: () => void
  /** 仅保存（写回文件，不发送）：只有文件编辑提供，缺席则底部不出现保存钮。 */
  readonly onSave?: () => void
  /** 空白禁用发送。 */
  readonly sendDisabled?: boolean
  /** 在途禁用发送（防重复提交）。 */
  readonly pending?: boolean
  readonly labels: ComposeCardLabels
}): ReactNode {
  const sendDisabled = props.sendDisabled === true || props.pending === true
  const head = (
      <div className={panelHeadClass}>
        {props.headExtra}
        <div className={panelTitleWrapClass}>
          <span className={panelTitleClass}>{props.title}</span>
          {props.subtitle !== undefined && <span className={panelSubtitleClass}>{props.subtitle}</span>}
        </div>
        {props.headerActions}
        {props.onCopy !== undefined && (
          <button
            type="button"
            className={uiButtonClass}
            data-compose-copy=""
            aria-label={props.labels.copy}
            title={props.labels.copy}
            onClick={props.onCopy}
          >
            <IconCopyOutlineRegular size={16} />
          </button>
        )}
        {props.onCancel !== undefined && (
          <button
            type="button"
            className={uiButtonClass}
            data-compose-cancel=""
            aria-label={props.labels.cancel}
            title={props.labels.cancel}
            onClick={props.onCancel}
          >
            <IconCloseOutlineRegular size={16} />
          </button>
        )}
      </div>
  )
  const actions = (
    (props.onSend !== undefined || props.onSendNewSession !== undefined || props.onSave !== undefined || props.actions !== undefined) && (
        <div className={panelActionsClass}>
          {props.actions}
          <span className={panelSpacerClass} aria-hidden="true" />
          {props.onSave !== undefined && (
            <button
              type="button"
              className={btnClass}
              data-compose-save=""
              aria-label={props.labels.save ?? ''}
              title={props.labels.save ?? ''}
              disabled={props.pending === true}
              onClick={props.onSave}
            >
              <IconCheckOutlineRegular size={15} /> {props.labels.save ?? ''}
            </button>
          )}
          {props.onSendNewSession !== undefined && (
            <button
              type="button"
              className={btnClass}
              data-compose-new-session=""
              aria-label={props.labels.newSession}
              title={props.labels.newSession}
              disabled={sendDisabled}
              onClick={props.onSendNewSession}
            >
              <IconNewChatOutlineRegular size={15} /> {props.labels.newSession}
            </button>
          )}
          {props.onSend !== undefined && (
            <button
              type="button"
              className={sendClass}
              data-compose-send=""
              aria-label={props.labels.send}
              title={props.labels.send}
              disabled={sendDisabled}
              onClick={props.onSend}
            >
              <IconSendOutlineRegular size={16} />
            </button>
          )}
        </div>
      )
  )
  if (props.mounts) return <>{createPortal(head, props.mounts.head)}{createPortal(<>{props.children}{actions}</>, props.mounts.actions)}</>
  return <div className={props.className === undefined ? panelClass : `${panelClass} ${props.className}`} data-compose-card="">
    {head}{props.children}{actions}
  </div>
}
