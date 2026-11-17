/**
 * 编辑期间的工具区落点（2026-11-17 现场）。
 *
 * 1. 打开编辑不该把会话滚到底部——编辑输入框是 sticky 的，本来就一直在视野里，
 *    把会话拽到底只是让正文跳一下（用户说「打开文件编辑不要默认滚到底部」）。
 * 2. 工作区文件打开编辑、关掉之后要回到**工作区文件界面**，不是对话。
 *    打开编辑时那一路广播会把工具区切到对话（编辑卡要挂在输入框上方），
 *    关掉时得把切走的那一格还回去。
 *
 * 这里钉的是两件事的判定逻辑：滚动不被动、落点要还原。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CHAT_TAB_ID, ToolsState } from '../src/tools-state.ts'
import { editingViewOf, restoreEditingView } from '../src/editing-view.ts'

describe('打开编辑不动会话滚动位置', () => {
  it('编辑卡打开时不写会话滚动容器的 scrollTop', () => {
    const source = readFileSync(new URL('../src/composer-edit.tsx', import.meta.url), 'utf8')
    expect(source).not.toMatch(/viewport\.scrollTop\s*=/)
  })
})

describe('编辑关闭后回到打开前的那一格', () => {
  it('打开编辑时记住当前激活标签；关掉后还原它', () => {
    const state = new ToolsState()
    state.seed('one', true)
    const files = state.open('one', 'files', '工作区文件')
    expect(state.get('one').active).toBe(files.id)
    // 打开编辑：工具区被切到对话（编辑卡要挂在输入框上方）。
    const remembered = editingViewOf(state, 'one')
    state.activateChat('one')
    expect(state.get('one').active).toBe(CHAT_TAB_ID)
    // 关掉编辑：回到工作区文件，而不是停在对话。
    restoreEditingView(state, 'one', remembered)
    expect(state.get('one').active).toBe(files.id)
  })

  it('没有工具标签时关掉编辑仍回对话', () => {
    const state = new ToolsState()
    state.seed('one', true)
    const remembered = editingViewOf(state, 'one')
    expect(remembered).toBeUndefined()
    restoreEditingView(state, 'one', remembered)
    expect(state.get('one').active).toBe(CHAT_TAB_ID)
  })

  it('记住的那一格已被关掉时不动当前激活', () => {
    const state = new ToolsState()
    state.seed('one', true)
    const files = state.open('one', 'files', '工作区文件')
    const remembered = editingViewOf(state, 'one')
    state.activateChat('one')
    state.close('one', files.id)
    restoreEditingView(state, 'one', remembered)
    expect(state.get('one').active).toBe(CHAT_TAB_ID)
  })
})
