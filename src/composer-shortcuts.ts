export interface ComposerShortcut { id: string; text: string }
export const SHORTCUT_KEY = 'chat-power.quick-messages'
export function readShortcuts(storage: Pick<Storage, 'getItem'>): ComposerShortcut[] {
  const raw = storage.getItem(SHORTCUT_KEY)
  if (raw === null) return [{ id: 'continue', text: '继续' }, { id: 'summary', text: '请总结当前进展和待办事项。' }]
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value)) throw new Error('快捷方式数据格式不正确')
  return value.filter((item): item is ComposerShortcut => item && typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim() !== '')
}
export function writeShortcuts(storage: Pick<Storage, 'setItem'>, entries: ComposerShortcut[]): void {
  storage.setItem(SHORTCUT_KEY, JSON.stringify(entries))
}
