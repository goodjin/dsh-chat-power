/** 普通输入与编辑模式共享同一自有标题容器，不搬运宿主节点。 */
const mounts = new WeakMap<HTMLElement, { head: HTMLDivElement; users: number }>()
export function acquireComposerHeader(card: HTMLElement): { head: HTMLDivElement; release(): void } {
  let mount = mounts.get(card)
  if (!mount) {
    const head = card.ownerDocument.createElement('div')
    head.dataset.chatPowerComposerHeader = ''
    card.prepend(head)
    mount = { head, users: 0 }
    mounts.set(card, mount)
  }
  mount.users++
  const current = mount
  let released = false
  return { head: current.head, release() {
    if (released) return
    released = true
    if (--current.users === 0) { current.head.remove(); mounts.delete(card) }
  } }
}
