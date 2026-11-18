// @vitest-environment jsdom
/**
 * 官方改动文件卡的点击：认领下来，改在会话区打开（2026-11-18）。
 *
 * 宿主那张卡点下去原本开右侧栏的 review 对比；这里要确认：
 * - 点击被认领，交给会话区打开；
 * - 宿主自己的处理走不成（右侧栏不会开）。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { installChangedFilesInterception } from '../src/changed-files-intercept.ts'

afterEach(() => { document.body.innerHTML = '' })

/** 搭一份宿主改动卡所在的会话结构。 */
function buildTurn(files: readonly { display: string }[]): HTMLElement {
  const session = document.createElement('div')
  session.setAttribute('data-conversation-session', 's1')
  const card = document.createElement('div')
  card.setAttribute('data-changed-files', '')
  files.forEach((file, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    const described = document.createElement('span')
    described.id = `desc-${index}`
    described.hidden = true
    described.textContent = file.display
    button.setAttribute('aria-describedby', described.id)
    const label = document.createElement('span')
    label.textContent = file.display
    button.append(label)
    card.append(button, described)
  })
  session.append(card)
  document.body.append(session)
  return session
}

describe('官方改动卡的点击拦截', () => {
  it('点行 → 认领并在会话区打开，宿主那条路走不成', () => {
    const session = buildTurn([{ display: '/work/src/a.ts' }])
    const row = session.querySelector('button')!
    const opened: string[] = []
    let hostSaw = false
    row.addEventListener('click', () => { hostSaw = true })
    const stop = installChangedFilesInterception({
      open: (sessionId, path) => { opened.push(sessionId + '|' + path) },
      rootOf: () => '/work',
    })
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual(['s1|src/a.ts'])
    expect(hostSaw).toBe(false)
  })

  it('点行里的文字也认领', () => {
    const session = buildTurn([{ display: '/work/src/a.ts' }])
    const text = session.querySelector('span:not([hidden])')!
    const opened: string[] = []
    const stop = installChangedFilesInterception({
      open: (sessionId, path) => { opened.push(sessionId + '|' + path) },
      rootOf: () => '/work',
    })
    text.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual(['s1|src/a.ts'])
  })

  it('一次点击只开一次（pointerdown 与 click 都来时去重）', () => {
    const session = buildTurn([{ display: '/work/src/a.ts' }])
    const row = session.querySelector('button')!
    const opened: string[] = []
    const stop = installChangedFilesInterception({
      open: (sessionId, path) => { opened.push(sessionId + '|' + path) },
      rootOf: () => '/work',
    })
    row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }))
    row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toHaveLength(1)
  })

  it('改动卡之外的点击不认领', () => {
    const session = document.createElement('div')
    session.setAttribute('data-conversation-session', 's1')
    const other = document.createElement('button')
    other.textContent = '别的按钮'
    session.append(other)
    document.body.append(session)
    const opened: string[] = []
    const stop = installChangedFilesInterception({
      open: (sessionId, path) => { opened.push(sessionId + '|' + path) },
      rootOf: () => '/work',
    })
    other.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    stop()
    expect(opened).toEqual([])
  })
})
