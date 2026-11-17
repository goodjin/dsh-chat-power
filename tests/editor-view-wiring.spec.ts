/**
 * 走真实路径：打开编辑 → 工具区被切到对话 → 关掉编辑 → 回到工作区文件。
 *
 * 这是接线测试（editor-view-landing.spec.ts 钉的是判定逻辑）：编辑的开启与
 * 关闭都经 composer-edit-state，落点的记忆与还原必须真的发生在那条链上。
 */
import { describe, expect, it } from 'vitest'
import { closeComposerEdit, openComposerEdit } from '../src/composer-edit-state.ts'
import { CHAT_TAB_ID, toolsState } from '../src/tools-state.ts'

describe('编辑落点：走 composer-edit-state 的真实链路', () => {
  it('工作区文件里打开编辑、关掉后回到工作区文件那一格', () => {
    const session = 'editor-view-wiring'
    toolsState.seed(session, true)
    const files = toolsState.open(session, 'files', '工作区文件')
    expect(toolsState.get(session).active).toBe(files.id)

    // 打开编辑（真实入口）。
    expect(openComposerEdit({ sessionId: session, title: 'a.md', text: '正文', send: async () => {} })).toBe(true)
    // 打开编辑会把工具区切到对话（编辑卡挂在输入框上方）。
    toolsState.activateChat(session)
    expect(toolsState.get(session).active).toBe(CHAT_TAB_ID)

    // 主动退出编辑。
    closeComposerEdit(session, 'cancel')
    expect(toolsState.get(session).active).toBe(files.id)
    toolsState.dispose()
  })

  it('发送成功后落点留在对话，不还原工具区那一格', () => {
    const session = 'editor-view-wiring-sent'
    toolsState.seed(session, true)
    const files = toolsState.open(session, 'files', '工作区文件')
    openComposerEdit({ sessionId: session, title: 'a.md', text: '正文', send: async () => {} })
    toolsState.activateChat(session)
    closeComposerEdit(session, 'sent')
    expect(toolsState.get(session).active).toBe(CHAT_TAB_ID)
    toolsState.dispose()
  })
})
