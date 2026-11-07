/**
 * 一轮最终答案的卡片（统一编辑链路）。
 *
 * 阅读态：轻量标题「回答」+ 右侧编辑 / 复制两个图标按钮；正文沿用原生渲染
 * （思考的折叠留在卡内）。编辑态换成 ComposeCard 统一外壳：标题「编辑回答副本」、
 * 说明「发送副本」、取消在头部、新建会话与发送在底部动作行。
 *
 * 发送走统一控制器：空白禁用、在途防重复、成功才退出编辑、失败保留正文并
 * 在编辑器下方给出可重试提示。草稿值经本卡的 ref 读取——同一会话多张答案卡
 * 同时编辑不会经全局 DOM 查询串值（2026-11 现场：readEditValue 用全局选择器，
 * 多卡同开可能读到别卡的输入）。
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconCheckOutlineRegular,
  IconCopyOutlineRegular,
  IconEditOutlineRegular,
  IconWarningOutlineRegular,
  Toast,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MarkdownTurnReaders } from './markdown-turn-sources.ts'
import { ComposeCard } from './compose-card.tsx'
import { copyTextToClipboard, createSendController } from './send-actions.ts'
import { inputClass, statusNoticeClass, uiButtonClass } from './ui-theme.ts'
import styles from './answer-card.module.css'

/** Plain-prose copyable text from the answer's text/reasoning blocks. */
function answerText(blocks: readonly { readonly kind: string; readonly text?: string }[]): string {
  return blocks
    .filter(block => (block.kind === 'text' || block.kind === 'reasoning') && (block.text?.trim() ?? '') !== '')
    .map(block => block.text ?? '')
    .join('\n\n')
}

/** 新建会话时，给内容加一句「来自结果框」的前缀，便于助手识别出处。 */
const NEW_SESSION_HEADER = '以下为会话结果框中的内容：'

export function AnswerCard(props: {
  readonly children: ReactNode
  readonly blocks: readonly { readonly kind: string; readonly text?: string }[]
  readonly sessionId: string | undefined
  readonly readers: MarkdownTurnReaders | undefined
  readonly t: (key: string) => string
}): ReactNode {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  // draft 为 null 表示还没动过键，显示原文；一旦输入就完全受控（清空即空，不回弹原文）。
  const [draft, setDraft] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ seq: number; text: string } | null>(null)
  const [toast, setToast] = useState<{ seq: number; text: string } | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const modeRef = useRef<'current' | 'new'>('current')
  const propsRef = useRef(props)
  propsRef.current = props
  const text = answerText(props.blocks)
  const canEdit = props.sessionId !== undefined && props.readers !== undefined
  const t = props.t

  // 发送控制器挂一次；props 经 ref 取最新值，避免闭包捕获旧会话号。
  const controller = useMemo(() => createSendController({
    send: (body: string): Promise<void> => {
      const { sessionId, readers } = propsRef.current
      if (readers === undefined) return Promise.reject(new Error('readers unavailable'))
      if (modeRef.current === 'new') {
        const prompt = `${NEW_SESSION_HEADER}\n\n${body}`
        return (sessionId === undefined
          ? readers.createSession({})
          : readers.createSession({ inheritCwdFrom: sessionId }))
          .then(newId => readers.sendToSession(newId, prompt))
      }
      if (sessionId === undefined) return Promise.reject(new Error('sessionId unavailable'))
      return readers.sendToSession(sessionId, body)
    },
    onPendingChange: setPending,
    onSuccess: () => { setEditing(false); setNotice(null) },
    onFailure: () => {
      const message = modeRef.current === 'new'
        ? propsRef.current.t('markdownTurn.newSessionFailed')
        : propsRef.current.t('markdownTurn.sendFailed')
      setNotice(current => ({ seq: (current?.seq ?? 0) + 1, text: message }))
    },
  }), [])

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
  const submitEdit = (mode: 'current' | 'new'): void => {
    modeRef.current = mode
    controller.submit(inputRef.current?.value ?? '')
  }
  const copyEdit = (): void => {
    void copyTextToClipboard(inputRef.current?.value ?? editValue).then(ok => {
      if (!ok) setToast({ seq: Date.now(), text: propsRef.current.t('markdownTurn.copyFailed') })
    })
  }
  const editValue = draft ?? text

  return (
    <div data-acp-answer-card>
      {editing ? (
        <ComposeCard
          title={t('answerCard.editAnswer')}
          subtitle={t('compose.copyHint')}
          onCancel={() => { if (!pending) setEditing(false) }}
          onCopy={copyEdit}
          onSend={() => { submitEdit('current') }}
          onSendNewSession={() => { submitEdit('new') }}
          sendDisabled={editValue.trim() === ''}
          pending={pending}
          labels={{ cancel: t('markdownTurn.cancel'), send: t('compose.sendCurrent'), newSession: t('compose.sendNewSession'), copy: t('compose.copy') }}
        >
          <textarea
            ref={inputRef}
            className={inputClass}
            data-answer-edit-input=""
            value={editValue}
            onChange={event => { setDraft(event.target.value) }}
            autoFocus
            aria-label={t('answerCard.edit')}
            style={{ minHeight: '50dvh' }}
          />
          {notice !== null && <p key={notice.seq} className={statusNoticeClass} data-variant="error" role="alert">{notice.text}</p>}
        </ComposeCard>
      ) : (
        <div className={styles.answerCard}>
          <div className={styles.answerCardHeader}>
            <span className={styles.answerCardTitle}>{t('answerCard.title')}</span>
            <div className={styles.answerHeaderActions}>
              {canEdit && (
                <Tooltip portal label={t('answerCard.edit')} side="bottom" delayMs={500}>
                  <button
                    type="button"
                    className={uiButtonClass}
                    data-action="edit-answer"
                    aria-label={t('answerCard.edit')}
                    title={t('answerCard.edit')}
                    onClick={() => { setDraft(null); setNotice(null); setEditing(true) }}
                  >
                    <IconEditOutlineRegular size={16} className={styles.answerCardIcon} />
                  </button>
                </Tooltip>
              )}
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
            </div>
          </div>
          <div className={styles.answerCardBody} data-answer-body="">{props.children}</div>
        </div>
      )}
      {toast !== null && <Toast
        key={toast.seq}
        text={toast.text}
        icon={<IconWarningOutlineRegular />}
        onDone={() => { setToast(null) }}
      />}
    </div>
  )
}
