/**
 * 工作区文件树与「文件管理」对齐的六项能力（2026-11-18 现场）。
 *
 * 1. 目录自动刷新：展开着的目录挂了变更监听，文件一变就重读那一层。
 * 2. 根路径显示：会话工作目录摆在树顶（目录段弱化、末段高亮）。
 * 3. 当前文件高亮：正在编辑/预览的文件那一行标出来，祖先目录自动展开。
 * 4. 右键菜单：文件与目录各注册一组动作。
 * 5. 文件名图标：按扩展名分类。
 * 6. 键盘操作：上下移动、左右展开折叠、Home/End 跳首尾、回车打开。
 */
import { describe, expect, it, vi } from 'vitest'
import { fileIconKind, fileIconPath } from '../src/file-tree-icons.ts'
import { ancestorsOf, isCurrentRow, rootPathView } from '../src/file-tree-view.ts'
import { currentFilePath, pathOfContent } from '../src/file-tree-current.ts'
import { handleTreeKey, parentPathOf, visibleRows } from '../src/file-tree-keyboard.ts'
import { actionsFor, targetOf, type MenuHandlers } from '../src/file-tree-menu.ts'
import { changesRemote, watchDirectory } from '../src/file-tree-watch.ts'

describe('文件类型图标', () => {
  it('按扩展名分类', () => {
    expect(fileIconKind('main.ts')).toBe('code')
    expect(fileIconKind('style.css')).toBe('style')
    expect(fileIconKind('photo.PNG')).toBe('image')
    expect(fileIconKind('bundle.zip')).toBe('archive')
    expect(fileIconKind('notes.md')).toBe('markup')
    expect(fileIconKind('data.json')).toBe('data')
    expect(fileIconKind('movie.mp4')).toBe('video')
    expect(fileIconKind('song.mp3')).toBe('audio')
  })

  it('认不出来的按普通文档画', () => {
    expect(fileIconKind('README')).toBe('text')
    expect(fileIconKind('weird.unknownext')).toBe('text')
    expect(fileIconKind('.gitignore')).toBe('text')
  })

  it('每一类都有图标路径', () => {
    for (const kind of ['code', 'markup', 'style', 'data', 'image', 'audio', 'video', 'archive', 'text', 'binary'] as const) {
      expect(fileIconPath(kind).length).toBeGreaterThan(0)
    }
  })
})

describe('根路径显示', () => {
  it('目录段弱化、末段高亮', () => {
    const view = rootPathView('/Users/good/project/dsh-chat-power')
    expect(view.directories).toEqual(['Users', 'good', 'project'])
    expect(view.leaf).toBe('dsh-chat-power')
  })

  it('没有根路径时不显示', () => {
    expect(rootPathView(undefined)).toEqual({ directories: [], leaf: '' })
    expect(rootPathView('')).toEqual({ directories: [], leaf: '' })
  })
})

describe('当前文件', () => {
  it('高亮正在编辑的文件', () => {
    expect(isCurrentRow('src/main.ts', 'src/main.ts')).toBe(true)
    expect(isCurrentRow('src/main.ts', 'src/other.ts')).toBe(false)
    expect(isCurrentRow('src/main.ts', undefined)).toBe(false)
  })

  it('算出要自动展开的祖先目录', () => {
    expect(ancestorsOf('a/b/c/d.ts')).toEqual(['a', 'a/b', 'a/b/c'])
    expect(ancestorsOf('top.ts')).toEqual([])
    expect(ancestorsOf(undefined)).toEqual([])
  })

  it('从标签内容标识里取出工作区相对路径', () => {
    expect(pathOfContent('edit://src/main.ts')).toBe('src/main.ts')
    expect(pathOfContent('dsh-resource://file/session/abc/src%2Fmain.ts')).toBe('src/main.ts')
    expect(pathOfContent('chat://session')).toBeUndefined()
  })

  it('当前文件优先取激活的文件标签', () => {
    const tabs = [
      { id: 'a', kind: 'files', contentId: 'files://x' },
      { id: 'b', kind: 'local', contentId: 'edit://src/main.ts' },
    ]
    expect(currentFilePath(tabs, 'b')).toBe('src/main.ts')
    // 激活的不是文件时，回退到最近的文件类标签。
    expect(currentFilePath(tabs, 'a')).toBe('src/main.ts')
  })
})

describe('键盘操作', () => {
  const entries = {
    '': [
      { name: 'docs', type: 'directory' as const },
      { name: 'src', type: 'directory' as const },
    ],
    docs: [{ name: 'guide.md', type: 'file' as const }],
  }
  const expanded = { docs: true }
  const rows = visibleRows(entries, expanded)

  it('扁平出可见行（折叠的目录只留它自己）', () => {
    expect(rows.map(row => row.path)).toEqual(['docs', 'docs/guide.md', 'src'])
  })

  it('上下键移动焦点', () => {
    expect(handleTreeKey(rows, 'docs', 'ArrowDown').focus).toBe('docs/guide.md')
    expect(handleTreeKey(rows, 'docs/guide.md', 'ArrowUp').focus).toBe('docs')
  })

  it('Home/End 跳首尾', () => {
    expect(handleTreeKey(rows, 'docs/guide.md', 'Home').focus).toBe('docs')
    expect(handleTreeKey(rows, 'docs', 'End').focus).toBe('src')
  })

  it('左右键展开折叠目录', () => {
    expect(handleTreeKey(rows, 'src', 'ArrowRight').toggle).toBe('src')
    expect(handleTreeKey(rows, 'docs', 'ArrowRight').toggle).toBe('docs')
    expect(handleTreeKey(rows, 'docs', 'ArrowLeft').toggle).toBe('docs')
  })

  it('回车打开文件、展开目录', () => {
    expect(handleTreeKey(rows, 'docs/guide.md', 'Enter').open).toBe('docs/guide.md')
    expect(handleTreeKey(rows, 'src', 'Enter').toggle).toBe('src')
  })

  it('文件行按左键回到父目录', () => {
    expect(handleTreeKey(rows, 'docs/guide.md', 'ArrowLeft').focus).toBe('docs')
    expect(parentPathOf('docs/guide.md')).toBe('docs')
    expect(parentPathOf('top.ts')).toBeUndefined()
  })
})

describe('右键菜单', () => {
  const handlers: MenuHandlers = {
    copyPath: vi.fn(),
    reveal: vi.fn(),
    absolutePath: (_sessionId, path) => `/root/${path}`,
  }

  it('取菜单目标的信息', () => {
    const target = { kind: 'file', value: { sessionId: 's1', path: 'a/b.ts', directory: false } }
    expect(targetOf(target)).toEqual({ sessionId: 's1', path: 'a/b.ts', directory: false })
    expect(targetOf({ kind: 'file', value: { nope: 1 } })).toBeUndefined()
  })

  it('文件行给复制路径，目录行多给「在本机显示」', () => {
    const file = actionsFor({ sessionId: 's1', path: 'a/b.ts', directory: false }, handlers)
    expect(file.map(action => action.id)).toEqual(['copy-path'])
    const directory = actionsFor({ sessionId: 's1', path: 'a', directory: true }, handlers)
    expect(directory.map(action => action.id)).toEqual(['reveal', 'copy-path'])
  })

  it('动作执行时带上绝对路径', () => {
    const copy = actionsFor({ sessionId: 's1', path: 'a/b.ts', directory: false }, handlers)[0]!
    copy.run()
    expect(handlers.copyPath).toHaveBeenCalledWith('/root/a/b.ts')
  })
})

describe('目录自动刷新', () => {
  it('取得到变更订阅面时才算可用', () => {
    expect(changesRemote({ workspaceFiles: { changes: () => {} } })).toBeDefined()
    expect(changesRemote({ workspaceFiles: { list: () => {} } })).toBeUndefined()
    expect(changesRemote(undefined)).toBeUndefined()
  })

  it('收到变更通知就回调', async () => {
    const frames = [
      { value: { kind: 'ready' }, accept: () => {} },
      { value: { kind: 'changed' }, accept: () => {} },
    ]
    const onChange = vi.fn()
    const host = {
      workspaceFiles: { changes: async function* () { yield* frames } },
      $stream: (options: { open: (signal: AbortSignal) => AsyncIterable<unknown> }) => ({
        async *[Symbol.asyncIterator]() { yield* options.open(new AbortController().signal) },
        dispose: () => {},
      }),
    }
    await watchDirectory({ host, sessionId: 's1', path: '', signal: new AbortController().signal, onChange })
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('能力不可用时安静退出，不抛异常', async () => {
    await expect(watchDirectory({
      host: {}, sessionId: 's1', path: '', signal: new AbortController().signal, onChange: vi.fn(),
    })).resolves.toBeUndefined()
  })
})
