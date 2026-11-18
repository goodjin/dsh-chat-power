// @vitest-environment jsdom
/**
 * 滚动条回归（2026-11-17 现场：编辑长内容没有滚动条、看不到上文；
 * 文件多时列表被裁掉看不到下面的文件）。
 *
 * 两处都要有滚动条，但都不能让外层布局跟着滚：
 * - 编辑卡：文本域自身滚（textarea 撑到编辑区高度）；
 * - 文件树：整棵树滚动，且滚动条在树自己身上、不裁内容。
 *
 * 文件树这份样式表（file-tree-lazy.module.css）是唯一进产物的那份
 * （见 tsdown 的 css 插件说明）。
 */
// jsdom 里 new URL 相对解析不认 file: 协议，用 Node 的 fileURLToPath 走直路。
// 直接 import 两个 css 文件会撞 css-modules 的 ?url 不支持，所以只引文字面量：
// 读路径与被测样式文件无关，用 node:path 拼即可。
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const cssText = (name: string): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'src', name), 'utf8')
const lazyCss = (): string => cssText('file-tree-lazy.module.css')
const toolsCss = (): string => cssText('conversation-tools.module.css')

describe('编辑卡：文本域自身滚动', () => {
  it('编辑面是宿主输入框那层（不是从前那个已不存在的 textarea）', () => {
    // 11-12 起编辑统一到宿主输入框：编辑面是 `[data-input-scroll]` 那层。
    const css = toolsCss()
    expect(css).not.toMatch(/textarea\[data-local-file-text\]/)
    expect(css).toMatch(/\[data-input-scroll\][^{]*\{[^}]*overflow-y:\s*auto/)
  })
})

describe('工作区文件树：整棵树滚动', () => {
  const ruleFor = (css: string, selector: string): string | undefined => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = css.match(new RegExp(escaped.replace(/\s+/g, '\\s*') + '\\s*\\{([^}]*)\\}'))
    return m?.[1]
  }
  it('树容器占满可用高度并自己滚', () => {
    const body = ruleFor(lazyCss(), '.tree')
    expect(body).toBeDefined()
    expect(body).toMatch(/flex:\s*1\s+1\s+auto/)
    expect(body).toMatch(/min-height:\s*0/)
    expect(body).toMatch(/overflow-y:\s*auto/)
  })
  it('列表不再自身裁剪（滚动交给树容器，避免文件被裁掉看不见）', () => {
    const body = ruleFor(lazyCss(), '.list')
    expect(body).toBeDefined()
    expect(body).not.toMatch(/overflow:\s*hidden/)
    expect(body).not.toMatch(/overflow-y:\s*hidden/)
  })
})

describe('工作区文件树：根路径栏与当前文件高亮', () => {
  const ruleFor = (css: string, selector: string): string | undefined => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const m = css.match(new RegExp(escaped.replace(/\s+/g, '\\s*') + '\\s*\\{([^}]*)\\}'))
    return m?.[1]
  }
  it('根路径栏：目录段弱化、末段高亮', () => {
    const css = lazyCss()
    expect(ruleFor(css, '.root')).toBeDefined()
    expect(ruleFor(css, '.rootLeaf')).toBeDefined()
    expect(ruleFor(css, '.rootPart')).toBeDefined()
  })
  it('当前文件那一行有底色标出', () => {
    const body = ruleFor(lazyCss(), '.row[data-current]')
    expect(body).toBeDefined()
    expect(body).toMatch(/background:/)
  })
  it('键盘聚焦的行有可见焦点环', () => {
    expect(ruleFor(lazyCss(), '.row:focus-visible')).toMatch(/outline:/)
  })
})