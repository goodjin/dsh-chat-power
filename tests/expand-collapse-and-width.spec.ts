/**
 * 两个现场修复（2026-11-18）：
 *
 * 1. **输入框向上展开后按删除键会被收掉**。根因是「输入框内容变空就收起」
 *    这条规则把**发送**和**手动删光字**混成了一件事：删完字输入框一空，
 *    大编辑区就自己收了，正在写的稿子凭空消失。收起有向下的箭头按钮，
 *    用户想收自己点——所以只在**真的发出去了**时才收。
 * 2. **会话两侧那两条列宽拖拽边，在别的标签界面里也露着**。它们拖的是对话
 *    内容列的宽度，在文件 / 浏览器 / 终端界面里没有意义。
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { notifySent, onSent } from '../src/send-signal.ts'

const cssText = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8')

describe('发送信号', () => {
  it('按会话送达', () => {
    const a = vi.fn()
    const b = vi.fn()
    const offA = onSent('s1', a)
    const offB = onSent('s2', b)
    notifySent('s1')
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
    offA(); offB()
  })

  it('退订后不再收到', () => {
    const listener = vi.fn()
    const off = onSent('s3', listener)
    off()
    notifySent('s3')
    expect(listener).not.toHaveBeenCalled()
  })

  it('一个订阅者出错不影响其他人', () => {
    const good = vi.fn()
    const off1 = onSent('s4', () => { throw new Error('boom') })
    const off2 = onSent('s4', good)
    expect(() => notifySent('s4')).not.toThrow()
    expect(good).toHaveBeenCalled()
    off1(); off2()
  })
})

describe('大编辑区只在真的发送后收起', () => {
  it('不再用「输入框变空」当收起信号', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'expand-editor.tsx'), 'utf8')
    // 旧规则：观察输入框内容变空就收起（删字也会触发）。
    expect(source).not.toMatch(/textContent\s*\)?\s*===\s*''/)
    expect(source).not.toMatch(/characterData:\s*true/)
  })

  it('收起改由发送信号驱动', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'expand-editor.tsx'), 'utf8')
    expect(source).toMatch(/onSent\(/)
  })
})

describe('工具标签激活时藏掉会话列宽拖拽边', () => {
  it('滚动层里有激活态工具正文时，同层的把手不显示', () => {
    const css = cssText('conversation-tools.module.css')
    expect(css).toMatch(
      /\[data-conversation-content\]:has\(\[data-conversation-scroll\] \[data-chat-strip-live\]\)\s*>\s*\[data-width-handle\]\s*\{[^}]*display:\s*none/,
    )
  })

  it('标记只在工具标签激活时出现（回对话标签就撤掉）', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'conversation-tools.tsx'), 'utf8')
    expect(source).toMatch(/body\.dataset\.chatStripLive\s*=/)
    expect(source).toMatch(/delete body\.dataset\.chatStripLive/)
  })
})
