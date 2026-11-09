import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { FILE_PAGE_SIZE, formatSize, parseListing, sortEntries } from '../src/file-tree-lazy.tsx'

describe('工作区文件树（懒加载）', () => {
  it('每层最多显示一百条', () => {
    expect(FILE_PAGE_SIZE).toBe(100)
  })

  it('目录列表：取出直接子项，并记住宿主是否截断', () => {
    const listing = parseListing({
      ok: true,
      value: {
        entries: [
          { name: 'b.txt', type: 'file', size: 12 },
          { name: 'src', type: 'directory' },
        ],
        truncated: true,
      },
    })
    expect(listing.entries).toHaveLength(2)
    expect(listing.entries[0]).toEqual({ name: 'b.txt', type: 'file', size: 12 })
    expect(listing.entries[1]).toEqual({ name: 'src', type: 'directory' })
    expect(listing.truncated).toBe(true)
  })

  it('调用失败信封给出错误提示（不抛、不退化成空目录）', () => {
    expect(parseListing({ ok: false, error: { message: 'nope' } })).toEqual({ entries: [], truncated: false, error: 'nope' })
  })
  it('形状不对（非信封）给空列表、无错误', () => {
    expect(parseListing(undefined)).toEqual({ entries: [], truncated: false })
  })

  it('目录排在前面，其余按名字排', () => {
    const sorted = sortEntries([
      { name: 'b.txt', type: 'file' },
      { name: 'z', type: 'directory' },
      { name: 'a.txt', type: 'file' },
    ])
    expect(sorted.map(entry => entry.name)).toEqual(['z', 'a.txt', 'b.txt'])
  })

  it('字节数转短文本', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})

describe('根目录列目录', () => {
  it('根目录用「.」表示（宿主拒绝空路径）', () => {
    const source = readFileSync(new URL('../src/file-tree-lazy.tsx', import.meta.url), 'utf8')
    expect(source).toContain("path === '' ? '.' : path")
  })
})
