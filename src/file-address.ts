/**
 * 会话区文件地址的拼装（浏览器半边）。
 *
 * 语法照官方文档（docs/official/reference/subsystems/sidebar-right.md「地址」一节）：
 * `dsh-resource://file/session/<会话号>/<路径>`——路径相对该会话工作区根，
 * 会话号与每段路径都做组件编码，盘符的 `:` 保留原样。
 *
 * 单独成文件是因为宿主的 `@deepseek-ai/dsh-util-workspace-path` 只在宿主进程里，
 * 浏览器模块注册表不给插件；插件侧只能按文档把语法抄一份，拼与拆各守各的
 * （拆在 conversation-tools.tsx 的 pathFrom）。
 */

/** 文件地址的 scheme 与类型前缀，与官方一致。 */
export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** 组件编码一段；`:` 是盘符分隔，按官方语法保留字面。 */
function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/**
 * 拼一个「经会话读的文件」的地址。
 * @param sessionId - 用哪个会话的工作区解析路径。
 * @param path - 工作区相对路径（绝对路径也原样带进会话地址）。
 * @returns `dsh-resource://file/session/<会话号>/<路径>`。
 */
export function sessionFileAddressOf(sessionId: string, path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(sessionId)}/${normalized.split('/').map(encodeSegment).join('/')}`
}
