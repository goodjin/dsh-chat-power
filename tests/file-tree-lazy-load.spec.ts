/**
 * 工作区文件树「列目录 → 呈现」的决策逻辑。
 *
 * 直接渲染 `LazyFileTree` 需要真实 DOM（本仓测试无 jsdom，setup 里连 react-dom 都
 * 换成哑代理），所以把状态归约抽成纯函数，用真实返回值驱动红绿：
 * - `shownAfterLoad`：首屏按页显示（修「首次显示 0 条」空白现场）；
 * - `applyListing`：成功 / 失败信封 → 目录状态；
 * - `levelView`：载入中 / 失败 / 空目录 / 有条目 的呈现分类；
 * - `failedLevel`：remote 缺失或调用抛错时的明确反馈（修「静默空白」）。
 */
import { describe, expect, it } from 'vitest'
import {
  FILE_PAGE_SIZE,
  type LevelState,
  applyListing,
  failedLevel,
  levelView,
  parseListing,
  shownAfterLoad,
} from '../src/file-tree-lazy.tsx'

/** 一份成功信封：`{ ok: true, value: { entries, truncated } }`（remote 层已解出）。 */
const okListing = (names: readonly string[]) => ({
  ok: true as const,
  value: {
    entries: names.map(name => ({ name, type: 'file' as const })),
    truncated: false,
  },
})

describe('shownAfterLoad（首屏显示条数）', () => {
  it('载入态把 shown 写成 0，完成后必须回到一页——否则首屏一条都没有', () => {
    expect(shownAfterLoad(0, FILE_PAGE_SIZE)).toBe(FILE_PAGE_SIZE)
  })
  it('从未载入（undefined）也按一页', () => {
    expect(shownAfterLoad(undefined, FILE_PAGE_SIZE)).toBe(FILE_PAGE_SIZE)
  })
  it('已「加载更多」的进度不被一次列目录重置', () => {
    expect(shownAfterLoad(250, FILE_PAGE_SIZE)).toBe(250)
  })
})

describe('applyListing（列目录成功）', () => {
  it('首屏：条目就绪、shown 回到一页、无错误、可呈现', () => {
    const level = applyListing(0, okListing(['b.ts', 'a.ts']), FILE_PAGE_SIZE)
    expect(level.loading).toBe(false)
    expect(level.error).toBeUndefined()
    expect(level.entries.map(entry => entry.name)).toEqual(['a.ts', 'b.ts']) // 目录优先、其余按名
    expect(level.shown).toBe(FILE_PAGE_SIZE)
    expect(levelView(level)).toEqual({ kind: 'items' })
  })
  it('条目少于一页时全部显示', () => {
    const level = applyListing(0, okListing(['only.ts']), FILE_PAGE_SIZE)
    expect(level.entries).toHaveLength(1)
    expect(level.shown).toBe(FILE_PAGE_SIZE)
    expect(levelView(level)).toEqual({ kind: 'items' })
  })
})

describe('parseListing / applyListing（失败信封反馈）', () => {
  it('ok:false 信封给出错误提示，不再退化成空列表', () => {
    expect(parseListing({ ok: false, error: { message: 'boom' } })).toEqual({
      entries: [],
      truncated: false,
      error: 'boom',
    })
  })
  it('失败信封 → 错误状态（可呈现为 error）', () => {
    const level = applyListing(0, { ok: false, error: { message: 'boom' } }, FILE_PAGE_SIZE)
    expect(level.error).toBe('boom')
    expect(levelView(level)).toEqual({ kind: 'error', message: 'boom' })
  })
})

describe('levelView（呈现分类）', () => {
  it('载入中（无条目）→ loading', () => {
    expect(levelView({ entries: [], shown: 0, loading: true })).toEqual({ kind: 'loading' })
  })
  it('空目录（无错误、无条目、未载入）→ empty', () => {
    expect(levelView({ entries: [], shown: FILE_PAGE_SIZE, loading: false })).toEqual({ kind: 'empty' })
  })
  it('未同步（undefined）→ pending', () => {
    expect(levelView(undefined)).toEqual({ kind: 'pending' })
  })
})

describe('failedLevel（remote 缺失 / 调用抛错）', () => {
  it('给出明确反馈，而不是静默空白', () => {
    const level: LevelState = failedLevel('无法读取工作区文件')
    expect(levelView(level)).toEqual({ kind: 'error', message: '无法读取工作区文件' })
  })
})
