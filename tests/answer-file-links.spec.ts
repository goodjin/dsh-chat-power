/**
 * 回答块文件链接的纯函数与接线约束。
 *
 * - 会话区文件地址的拼装要照官方语法来（docs/official/reference/subsystems/sidebar-right.md）：
 *   `dsh-resource://file/session/<会话号>/<逐段组件编码的路径>`，反斜杠归一成 `/`、
 *   前导 `./` 去掉、盘符 `:` 保留。
 * - 接线：回答卡把链接清单写进 DOM，拦截层按按钮 title 认领，认领后**先试文档预览
 *   标签（text），起不来再退回编辑标签（local）**——与右侧栏的文档预览同一份渲染，
 *   只是落点换成会话区。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

import { sessionFileAddressOf } from '../src/file-address.ts'
import { answerFileLinksAttr, ANSWER_FILE_LINKS_ATTR } from '../src/answer-file-links.ts'

/** 读插件源码（用于钉住实现约束）。 */
function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

describe('会话区文件地址', () => {
  it('相对路径原样进会话作用域', () => {
    expect(sessionFileAddressOf('s1', 'a.md')).toBe('dsh-resource://file/session/s1/a.md')
    expect(sessionFileAddressOf('s1', '.agents/skills/prd-builder/SKILL.md'))
      .toBe('dsh-resource://file/session/s1/.agents/skills/prd-builder/SKILL.md')
  })

  it('前导 ./ 去掉、反斜杠归一', () => {
    expect(sessionFileAddressOf('s1', './a.md')).toBe('dsh-resource://file/session/s1/a.md')
    expect(sessionFileAddressOf('s1', 'a\\b.md')).toBe('dsh-resource://file/session/s1/a/b.md')
  })

  it('路径逐段组件编码（空格、中文）', () => {
    expect(sessionFileAddressOf('s1', 'docs/中文 文件.md'))
      .toBe('dsh-resource://file/session/s1/docs/%E4%B8%AD%E6%96%87%20%E6%96%87%E4%BB%B6.md')
  })

  it('会话号也做组件编码', () => {
    expect(sessionFileAddressOf('s 1', 'a.md')).toBe('dsh-resource://file/session/s%201/a.md')
  })

  it('盘符冒号保留原样', () => {
    expect(sessionFileAddressOf('s1', 'C:\\x\\y.md')).toBe('dsh-resource://file/session/s1/C:/x/y.md')
  })
})

describe('链接清单的 DOM 值', () => {
  it('清单按行拼接（路径不允许换行，行是安全分隔符）', () => {
    expect(answerFileLinksAttr(['a.md', 'dir/b.md'])).toBe('a.md\ndir/b.md')
    expect(ANSWER_FILE_LINKS_ATTR).toBe('data-answer-file-links')
  })
})

describe('接线约束', () => {
  it('回答卡从正文算链接清单并写进 data 标记', () => {
    const card = source('../src/answer-card.tsx')
    expect(card).toContain('linkedFilePathsFromText')
    expect(card).toContain('ANSWER_FILE_LINKS_ATTR')
  })

  it('拦截层按「按钮 title 命中清单」认领回答块文件链接', () => {
    const tools = source('../src/conversation-tools.tsx')
    expect(tools).toContain('answerFileLinkPathAt')
    expect(tools).toContain("sessionFileAddressOf")
  })

  it('认领后先开文档预览标签（text），起不来退回编辑标签（local）', () => {
    const tools = source('../src/conversation-tools.tsx')
    expect(tools).toContain('openAnswerFile')
    const call = tools.slice(tools.indexOf('const openAnswerFile'))
    expect(call.indexOf('openResource')).toBeGreaterThan(-1)
    expect(call.indexOf('openWorkspaceEditor')).toBeGreaterThan(call.indexOf('openResource'))
  })
})
