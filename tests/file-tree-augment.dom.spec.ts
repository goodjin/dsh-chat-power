import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  attachFilesTreeAugment,
  CHECK_ATTR,
  DECORATED_ATTR,
  decorateRow,
  EDIT_ATTR,
  TOOLS_SESSION_ATTR,
  type AugmentHandlers,
} from '../src/file-tree-augment.tsx'

function fileRow(nested: boolean, path = 'package.json'): HTMLLIElement {
  const row = document.createElement('li')
  row.setAttribute('data-files-entry', 'file')
  row.setAttribute('data-files-path', path)
  const contents = '<button type="button">package.json</button><span data-files-accessory></span>'
  row.innerHTML = nested ? `<div>${contents}</div>` : contents
  return row
}

const handlers = (): AugmentHandlers => ({
  checked: () => false,
  onToggle: vi.fn(),
  onEdit: vi.fn(),
})

const nextTurn = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))
let dispose: (() => void) | undefined

afterEach(() => {
  dispose?.()
  dispose = undefined
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('文件行控件的真实 DOM 结构', () => {
  it.each([false, true])('文件按钮嵌套=%s：编辑钮紧随按钮，保留宿主附件且不重复装饰', (nested) => {
    const row = fileRow(nested)
    const open = row.querySelector('button')!
    const accessory = row.querySelector('[data-files-accessory]')!
    const h = handlers()

    expect(decorateRow(row, 's1', h, document)).toBe(true)
    const check = row.querySelector<HTMLInputElement>(`[${CHECK_ATTR}]`)!
    const edit = row.querySelector(`[${EDIT_ATTR}]`)!
    expect(check.parentElement).toBe(open)
    expect(edit.parentElement).toBe(open.parentElement)
    expect(open.nextSibling).toBe(edit)
    expect(edit.nextSibling).toBe(accessory)
    expect(row.hasAttribute(DECORATED_ATTR)).toBe(true)
    expect(decorateRow(row, 's1', h, document)).toBe(false)
    expect(row.querySelectorAll(`[${CHECK_ATTR}]`)).toHaveLength(1)
    expect(row.querySelectorAll(`[${EDIT_ATTR}]`)).toHaveLength(1)
  })

  it('嵌套行的勾选与编辑不触发宿主打开文件，勾选同步按会话生效', () => {
    const container = document.createElement('div')
    container.setAttribute(TOOLS_SESSION_ATTR, 's1')
    const row = fileRow(true)
    container.append(row)
    document.body.append(container)
    const open = row.querySelector('button')!
    const onOpen = vi.fn()
    open.addEventListener('click', onOpen)
    let checked = false
    let sync: (() => void) | undefined
    const unsubscribe = vi.fn()
    const h = handlers()
    h.checked = () => checked
    h.onToggle = vi.fn((_session, _path, value) => { checked = value })
    h.subscribeChanges = listener => { sync = listener; return unsubscribe }
    dispose = attachFilesTreeAugment(() => h)

    const check = row.querySelector<HTMLInputElement>(`[${CHECK_ATTR}]`)!
    check.click()
    expect(h.onToggle).toHaveBeenCalledWith('s1', 'package.json', true)
    expect(check.checked).toBe(true)
    expect(onOpen).not.toHaveBeenCalled()
    checked = false
    sync!()
    expect(check.checked).toBe(false)
    row.querySelector<HTMLElement>(`[${EDIT_ATTR}] svg`)!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(h.onEdit).toHaveBeenCalledWith('s1', 'package.json')
    expect(onOpen).not.toHaveBeenCalled()
    open.click()
    expect(onOpen).toHaveBeenCalledOnce()
    dispose()
    dispose = undefined
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('动态嵌套行装饰后监听收敛，不影响宿主侧栏，卸载后停止装饰', async () => {
    const NativeObserver = MutationObserver
    const errors: unknown[] = []
    let callbacks = 0
    // 旧实现会无限排入微任务；测试截断循环以报告断言失败，而非挂死测试进程。
    vi.stubGlobal('MutationObserver', class extends NativeObserver {
      constructor(callback: MutationCallback) {
        super((records, observer) => {
          callbacks++
          if (callbacks > 12) { observer.disconnect(); return }
          try { callback(records, observer) } catch (error) { errors.push(error) }
        })
      }
    })
    const container = document.createElement('div')
    container.setAttribute(TOOLS_SESSION_ATTR, 's1')
    const nativeRow = fileRow(true, 'native.json')
    document.body.append(container, nativeRow)
    const h = handlers()
    dispose = attachFilesTreeAugment(() => h)

    const nested = fileRow(true)
    container.append(nested)
    await nextTurn()
    expect(errors).toEqual([])
    expect(callbacks).toBeLessThanOrEqual(2)
    expect(nested.querySelectorAll(`[${CHECK_ATTR}]`)).toHaveLength(1)
    expect(nested.querySelectorAll(`[${EDIT_ATTR}]`)).toHaveLength(1)
    expect(nativeRow.querySelector(`[${CHECK_ATTR}]`)).toBeNull()
    expect(nativeRow.querySelector(`[${EDIT_ATTR}]`)).toBeNull()
    const settled = callbacks
    await nextTurn()
    expect(callbacks).toBe(settled)

    const flat = fileRow(false, 'flat.json')
    container.append(flat)
    await nextTurn()
    expect(callbacks - settled).toBeLessThanOrEqual(2)
    expect(flat.querySelectorAll(`[${CHECK_ATTR}]`)).toHaveLength(1)
    expect(nested.querySelectorAll(`[${CHECK_ATTR}]`)).toHaveLength(1)
    const replacement = fileRow(true)
    nested.replaceWith(replacement)
    await nextTurn()
    expect(replacement.querySelectorAll(`[${CHECK_ATTR}]`)).toHaveLength(1)
    expect(replacement.querySelectorAll(`[${EDIT_ATTR}]`)).toHaveLength(1)
    expect(errors).toEqual([])

    dispose()
    dispose = undefined
    const stopped = callbacks
    const afterDispose = fileRow(true, 'after.json')
    container.append(afterDispose)
    await nextTurn()
    expect(callbacks).toBe(stopped)
    expect(afterDispose.hasAttribute(DECORATED_ATTR)).toBe(false)
  })
})
