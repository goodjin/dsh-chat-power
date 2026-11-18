/**
 * 每轮「已编辑的文件」（宿主改动卡）点击改为在会话区打开（2026-11-18）。
 *
 * 宿主每轮末尾有一张官方的改动文件卡（`dsh-client-ui-deliverables` 画的，
 * 标记 `data-changed-files`）：卡头与每一行点下去都在**右侧 Sidebar** 打开本轮
 * 的 review 对比。用户要的是「也在会话区打开」——会话区里本来就有等价的
 * 文件列表（每轮文件块）与编辑入口。
 *
 * 这里认领那张卡的点击：从行里取出路径（工作区相对），交给会话区打开，
 * 宿主那条通往右侧栏的路走不通。
 */
import { describe, expect, it } from 'vitest'
import {
  CHANGED_FILES_SELECTOR,
  changedFilePathAt,
  isChangedFilesCard,
} from '../src/changed-files-click.ts'

/** 按宿主的结构搭一张官方改动卡（每行带一个隐藏的路径描述元素）。 */
function buildCard(files: readonly { path: string; display: string }[]): HTMLElement {
  const card = document.createElement('div')
  card.setAttribute('data-changed-files', '')
  files.forEach((file, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('aria-label', `查看 ${file.display} 的改动`)
    const described = document.createElement('span')
    described.id = `desc-${index}`
    described.hidden = true
    described.textContent = file.display
    button.setAttribute('aria-describedby', described.id)
    const path = document.createElement('span')
    path.textContent = file.display
    button.append(path)
    card.append(button, described)
  })
  return card
}

describe('官方改动卡的点击认领', () => {
  it('认得出官方改动卡', () => {
    const card = buildCard([{ path: 'src/a.ts', display: '/work/src/a.ts' }])
    expect(isChangedFilesCard(card)).toBe(true)
    expect(isChangedFilesCard(document.createElement('div'))).toBe(false)
  })

  it('从行里取出路径并转成工作区相对路径', () => {
    const card = buildCard([{ path: 'src/a.ts', display: '/work/src/a.ts' }])
    const row = card.querySelector('button')!
    expect(changedFilePathAt(row, '/work')).toBe('src/a.ts')
  })

  it('工作区根之外的路径原样给出（不硬拼）', () => {
    const card = buildCard([{ path: 'x.ts', display: '/elsewhere/x.ts' }])
    const row = card.querySelector('button')!
    expect(changedFilePathAt(row, '/work')).toBe('/elsewhere/x.ts')
  })

  it('没有工作区根时按显示路径原样给出', () => {
    const card = buildCard([{ path: 'x.ts', display: 'x.ts' }])
    const row = card.querySelector('button')!
    expect(changedFilePathAt(row, undefined)).toBe('x.ts')
  })

  it('点行内文字（不是按钮本身）也认得出路径', () => {
    const card = buildCard([{ path: 'src/a.ts', display: '/work/src/a.ts' }])
    const text = card.querySelector('span')!
    expect(changedFilePathAt(text, '/work')).toBe('src/a.ts')
  })

  it('不在改动卡里时不给路径', () => {
    const other = document.createElement('button')
    other.textContent = '随便'
    expect(changedFilePathAt(other, '/work')).toBeUndefined()
  })

  it('选择器指向官方改动卡的标记', () => {
    expect(CHANGED_FILES_SELECTOR).toBe('[data-changed-files]')
  })
})
