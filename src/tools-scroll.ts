/**
 * 工具标签激活期间的会话滚动位置保管。
 *
 * 现场（2026-11-18）：打开文件标签时宿主视图（对话/轨迹）被收起，会话滚动层
 * 内容塌缩、没有可滚的余量，scrollTop 被浏览器钳到 0；退出时视图恢复、内容
 * 高度回来了，但没人把滚动位置写回去——会话停在历史开头。这里在收起前把
 * 刻度记下，视图恢复后写回去：
 *
 * - 原先贴底 → 恢复到底（激活期间来新消息，贴底语义不变）；
 * - 原先在中间 → 恢复到原刻度（内容变矮就钳到可见范围）；
 * - 滚动层已换属别的会话（激活期间切了会话）→ 不写，旧刻度不属于新会话。
 *
 * 刻度阈值与回答区滚动记忆（answer-scroll.ts）一致：距底 24px 内算贴底。
 * 刻度存在 WeakMap 上：元素被宿主重渲染替换后旧记录随元素一起回收。
 */

/** 会话滚动层的最小读面（真实 DOM 与测试假件都满足）。 */
export interface ConversationScrollTarget {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  getAttribute(name: string): string | null
  closest(selector: string): { getAttribute(name: string): string | null } | null
}

/** 贴底判定：距底 24px 内算贴底（与 answer-scroll.ts 同一阈值）。 */
const AT_BOTTOM_SLACK = 24

export interface ConversationScrollKeeper {
  /** 收起视图之前调用：记下当前刻度与「是否贴底」。 */
  capture(el: ConversationScrollTarget, sessionId: string): void
  /**
   * 视图恢复之后调用：把刻度写回去。
   * @returns 是否真的写回（没记过 / 换属别的会话都不写）。
   */
  restore(el: ConversationScrollTarget): boolean
}

export function createConversationScrollKeeper(): ConversationScrollKeeper {
  const saved = new WeakMap<ConversationScrollTarget, { sessionId: string; top: number; bottom: boolean }>()
  return {
    capture(el, sessionId) {
      const max = Math.max(0, el.scrollHeight - el.clientHeight)
      saved.set(el, { sessionId, top: el.scrollTop, bottom: max - el.scrollTop <= AT_BOTTOM_SLACK })
    },
    restore(el) {
      const keep = saved.get(el)
      if (keep === undefined) return false
      saved.delete(el)
      const session = el.closest('[data-conversation-session]')?.getAttribute('data-conversation-session')
      if (session !== keep.sessionId) return false
      const max = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollTop = keep.bottom ? max : Math.min(keep.top, max)
      return true
    },
  }
}
