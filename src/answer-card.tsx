/** Answer cards keep their read view; editing is owned by the host composer. */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconWarningOutlineRegular,
  Toast,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { linkedFilePathsFromText, type MarkdownTurnReaders } from './markdown-turn-sources.ts'
import { answerFileLinksAttr, ANSWER_FILE_LINKS_ATTR } from './answer-file-links.ts'
import { openComposerEdit } from './composer-edit-state.ts'
import { copyTextToClipboard } from './send-actions.ts'
import { uiButtonClass } from './ui-theme.ts'
import styles from './answer-card.module.css'

/** Plain-prose copyable text from the answer's text/reasoning blocks. */
function answerText(blocks: readonly { readonly kind: string; readonly text?: string }[]): string {
  return blocks
    .filter(block => (block.kind === 'text' || block.kind === 'reasoning') && (block.text?.trim() ?? '') !== '')
    .map(block => block.text ?? '')
    .join('\n\n')
}

/**
 * 回答正文里的文件链接清单（宿主会把这些相对路径渲染成文件链接按钮）。
 *
 * 代码块 / 行内代码里的不算（宿主也不把它们渲染成链接），图片不算
 * （宿主给图片走预览），同一路径只留一次。拦截层靠这份清单认按钮。
 */
function answerFileLinks(blocks: readonly { readonly kind: string; readonly text?: string }[]): readonly string[] {
  const paths: string[] = []
  const seen = new Set<string>()
  for (const block of blocks) {
    if (block.kind !== 'text' && block.kind !== 'reasoning') continue
    for (const path of linkedFilePathsFromText(block.text ?? '')) {
      if (seen.has(path)) continue
      seen.add(path)
      paths.push(path)
    }
  }
  return paths
}

/** 新建会话时，给内容加一句「来自结果框」的前缀，便于助手识别出处。 */
const NEW_SESSION_HEADER = '以下为会话结果框中的内容：'

export function AnswerCard(props: {
  readonly children: ReactNode
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  readonly sessionId: string | undefined
  readonly readers: MarkdownTurnReaders | undefined
  readonly t: (key: string) => string
  /** 宿主给答案步的状态：running=还在流式输出，settled=已完成。 */
  readonly status?: string
}): ReactNode {
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const propsRef = useRef(props)
  propsRef.current = props
  const text = answerText(props.blocks)
  const canEdit = props.sessionId !== undefined && props.readers !== undefined
  const t = props.t
  // 还在流式输出时先不给编辑/复制按钮——回答完成了才出现。
  const settled = props.status !== 'running'

  const run = (): void => {
    void copyTextToClipboard(text).then(ok => {
      if (ok) {
        setCopied(true)
        window.setTimeout(() => { setCopied(false) }, 2000)
        return
      }
      setToast({ seq: Date.now(), text: propsRef.current.t('markdownTurn.copyFailed') })
    })
  }
  // 正文里的文件链接清单：写进 DOM，拦截层据此认出宿主渲染的文件链接按钮。
  const fileLinks = useMemo(() => answerFileLinks(props.blocks), [props.blocks])

  return (
    <div data-acp-answer-card>
        <div className={styles.answerCard} data-answer-card="" data-chat-power-frame-box="" data-chat-power-kind="answer" data-answer-status={props.status ?? 'settled'}>
          <div className={styles.answerCardHeader} data-answer-header="" data-chat-power-frame-header="">
            <span className={styles.answerCardTitle} data-answer-title="">{t('answerCard.title')}</span>
            <span className={styles.answerState} data-chat-power-state="" />
            <div className={styles.answerHeaderActions}>
              {canEdit && settled && (
                <Tooltip portal label={t('answerCard.edit')} side="bottom" delayMs={500}>
                  <button
                    type="button"
                    className={uiButtonClass}
                    data-action="edit-answer"
                    aria-label={t('answerCard.edit')}
                    title={t('answerCard.edit')}
                    onClick={() => {
                      if (!props.sessionId || !props.readers) return
                      const id = props.sessionId, readers = props.readers
                      if (!openComposerEdit({ sessionId: id, title: t('answerCard.editAnswer'), text,
                        send: async (body, target) => {
                          const destination = target === 'new' ? await readers.createSession({ inheritCwdFrom: id }) : id
                          await readers.sendToSession(destination, target === 'new' ? `${NEW_SESSION_HEADER}\n\n${body}` : body)
                        },
                      })) setToast({ seq: Date.now(), text: '请先完成当前编辑' })
                    }}
                  >
                    <IconEditOutlineRegular size={16} className={styles.answerCardIcon} />
                  </button>
                </Tooltip>
              )}
              {settled && (
                <button
                  type="button"
                  className={uiButtonClass}
                  data-action="copy-answer"
                  data-copied={copied || undefined}
                  aria-label={copied ? t('answerCard.copied') : t('answerCard.copy')}
                  title={copied ? t('answerCard.copied') : t('answerCard.copy')}
                  onClick={run}
                >
                  {copied
                    ? <IconCheckOutlineRegular size={16} className={styles.copiedIcon} />
                    : <IconCopyOutlineRegular size={16} className={styles.answerCardIcon} />}
                </button>
              )}
            </div>
          </div>
          <div
            className={styles.answerCardBody}
            data-answer-body=""
            {...{ [ANSWER_FILE_LINKS_ATTR]: fileLinks.length > 0 ? answerFileLinksAttr(fileLinks) : undefined }}
          >{props.children}</div>
        </div>
      {toast !== null && <Toast
        key={toast.seq}
        text={toast.text}
        icon={<IconWarningOutlineRegular />}
        onDone={() => { setToast(null) }}
      />}
    </div>
  )
}
