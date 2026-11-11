/**
 * 会话区通用 UI 的文案（中英）。
 *
 * 从 `@goodjin2/dsh-acp-agent` 的浏览器半边随功能一起迁来。这里只放与会话区
 * 通用功能相关的 key——mermaid 图渲染、答案卡片、会话尾部文件卡片——与具体 agent
 * 无关。装进 host 的 locale 注册中心（见 index.ts），运行时找不到 key 就退回
 * `fallbackT`（中文），再退到 key 原文。
 */

export type Params = Record<string, string | number>

/** 翻译函数形状：key + 可选插值参数。 */
export type RuntimeT = (key: string, params?: Params) => string

export const NAMESPACE = 'chatPower'

export type ChatPowerLocaleKey =
  | 'mermaid.label' | 'mermaid.diagram' | 'mermaid.source' | 'mermaid.toggleNamed'
  | 'mermaid.loading' | 'mermaid.renderFailed' | 'mermaid.retry'
  | 'answerCard.copy' | 'answerCard.copied' | 'answerCard.edit'
  | 'answerCard.title' | 'answerCard.editAnswer'
  | 'panel.sessionBar.copy' | 'panel.sessionBar.copied' | 'panel.sessionBar.copyFailed'
  | 'panel.sessionBar.copyUnavailable'
  | 'markdownTurn.loading' | 'markdownTurn.error' | 'markdownTurn.retry'
  | 'markdownTurn.truncated' | 'markdownTurn.collapse' | 'markdownTurn.expand'
  | 'markdownTurn.collapseAria' | 'markdownTurn.expandAria'
  | 'markdownTurn.openTitle' | 'markdownTurn.openDefault' | 'markdownTurn.openAppsError'
  | 'markdownTurn.openMore' | 'markdownTurn.defaultOpenLink' | 'markdownTurn.linkOpenRight'
  | 'markdownTurn.linkOpenBrowser' | 'markdownTurn.openFolder' | 'markdownTurn.openError'
  | 'markdownTurn.revealError' | 'markdownTurn.copy' | 'markdownTurn.copied'
  | 'markdownTurn.code' | 'markdownTurn.wrap' | 'markdownTurn.unwrap'
  | 'markdownTurn.footnotes' | 'markdownTurn.send' | 'markdownTurn.sendToSession'
  | 'markdownTurn.edit' | 'markdownTurn.cancel' | 'markdownTurn.comment'
  | 'markdownTurn.commentPlaceholder' | 'markdownTurn.commentSend' | 'markdownTurn.commentedAs'
  | 'markdownTurn.commentRemove' | 'markdownTurn.composePlaceholder' | 'markdownTurn.sendFailed'
  | 'markdownTurn.newSession' | 'markdownTurn.newSessionPromptHeader' | 'markdownTurn.newSessionFailed'
  | 'markdownTurn.copyFailed' | 'markdownTurn.filesAll' | 'markdownTurn.filesAllAria'
  | 'markdownTurn.filesGroup'
  | 'markdownTurn.commentsPending' | 'markdownTurn.sending'
  | 'markdownTurn.filesCollapseAria' | 'markdownTurn.openFile'
  | 'markdownTurn.localFileHeader' | 'markdownTurn.localFileTooLarge'
  | 'markdownTurn.copyAll'
  | 'compose.sendCurrent' | 'compose.sendNewSession' | 'compose.copyHint'
  | 'compose.copy' | 'compose.save' | 'compose.saveSaved' | 'compose.saveFailed'
  | 'selection.sendToChat'
  | 'selection.quote' | 'selection.toolbarLabel'
  | 'selection.edit' | 'selection.multiAdd' | 'selection.editCount'
  | 'selection.removeItem'
  | 'selection.multiAdded' | 'selection.editTitle' | 'selection.multiEditTitle'
  | 'selection.collectedCount'
  | 'expand.open' | 'expand.close'
  | 'turnFold.label' | 'turnFold.labelWithSummary' | 'turnFold.requestLabel'
  | 'turnFold.requestExpand' | 'turnFold.requestCollapse'
  | 'turnFold.frameThinking' | 'turnFold.frameTools' | 'turnFold.frameAnswer'
  | 'turnFold.frameError' | 'turnFold.frameRetry' | 'turnFold.frameCompaction'
  | 'turnFold.frameContext' | 'turnFold.frameLimit' | 'turnFold.frameQuestion'
  | 'turnFold.frameWorkflow' | 'turnFold.frameRunning'
  | 'turnFold.collapseAria' | 'turnFold.expandAria'
  | 'tools.chat' | 'tools.files' | 'tools.browser' | 'tools.terminal'
  | 'tools.openLocalFile' | 'tools.more' | 'tools.linkOpenDefault'
  | 'fileTree.reference' | 'fileTree.editCopy' | 'fileTree.loadMore'
  | 'promptView.title' | 'fileTree.empty'

export const zh: Record<ChatPowerLocaleKey, string> = {
  'mermaid.label': 'Mermaid',
  'mermaid.diagram': '图表',
  'mermaid.source': '源码',
  'mermaid.toggleNamed': '切换 Mermaid 图与源码',
  'mermaid.loading': '正在加载图表…',
  'mermaid.renderFailed': '图表未能渲染',
  'mermaid.retry': '重试',
  'answerCard.copy': '复制结果',
  'answerCard.copied': '已复制',
  'answerCard.edit': '编辑',
  'answerCard.title': '回答',
  'answerCard.editAnswer': '编辑回答副本',
  'panel.sessionBar.copy': '复制',
  'panel.sessionBar.copied': '已复制',
  'panel.sessionBar.copyFailed': '复制失败：',
  'panel.sessionBar.copyUnavailable': '当前环境无法复制，请手动选择复制',
  'markdownTurn.loading': '正在读取文档…',
  'markdownTurn.error': '文档没有读出来',
  'markdownTurn.retry': '重试',
  'markdownTurn.truncated': '文档较长，这里只显示前面一部分',
  'markdownTurn.collapse': '收起',
  'markdownTurn.expand': '展开',
  'markdownTurn.collapseAria': '收起 {name}',
  'markdownTurn.expandAria': '展开 {name}',
  'markdownTurn.openTitle': '用 {app} 打开',
  'markdownTurn.openDefault': '{app}（默认）',
  'markdownTurn.openAppsError': '无法获取应用列表',
  'markdownTurn.openMore': '更多打开方式',
  'markdownTurn.defaultOpenLink': '默认打开方式',
  'markdownTurn.linkOpenRight': '内置浏览器打开',
  'markdownTurn.linkOpenBrowser': '外部浏览器打开',
  'markdownTurn.openFolder': '打开文件夹',
  'markdownTurn.openError': '打开失败，请重试',
  'markdownTurn.revealError': '文件夹没有打开',
  'markdownTurn.copy': '复制',
  'markdownTurn.copied': '已复制',
  'markdownTurn.code': '代码',
  'markdownTurn.wrap': '换行',
  'markdownTurn.unwrap': '取消换行',
  'markdownTurn.footnotes': '脚注',
  'markdownTurn.send': '发送',
  'markdownTurn.sendToSession': '发送到会话',
  'markdownTurn.edit': '编辑',
  'markdownTurn.cancel': '取消',
  'markdownTurn.comment': '评论',
  'markdownTurn.commentPlaceholder': '写下你的评论…',
  'markdownTurn.commentSend': '发送评论',
  'markdownTurn.commentedAs': '这是用户对此段话的评论',
  'markdownTurn.commentRemove': '删除评论',
  'markdownTurn.composePlaceholder': '输入要加入会话的内容…',
  'markdownTurn.sendFailed': '发送失败，请重试',
  'markdownTurn.newSession': '新建会话',
  'markdownTurn.newSessionPromptHeader': '文件路径：{path}',
  'markdownTurn.newSessionFailed': '新建会话失败，请重试',
  'markdownTurn.copyFailed': '复制失败，请重试',
  'markdownTurn.filesAll': '全部 {count} 个文件',
  'markdownTurn.filesAllAria': '展开全部 {count} 个文件',
  'markdownTurn.filesGroup': '本轮文件 · {count}',
  'markdownTurn.commentsPending': '待发送批注 · {count}',
  'markdownTurn.sending': '发送中…',
  'markdownTurn.filesCollapseAria': '收起文件列表',
  'markdownTurn.openFile': '打开本机文件',
  'markdownTurn.localFileHeader': '以下为本机文件 {name} 的内容：',
  'markdownTurn.localFileTooLarge': '文件超过 5 MB，没有打开',
  'markdownTurn.copyAll': '复制全文',
  'compose.sendCurrent': '发送到当前会话',
  'compose.sendNewSession': '新建会话并发送',
  'compose.copyHint': '这里编辑的是发送副本，原文件不会被改动',
  'compose.copy': '复制',
  'compose.save': '保存',
  'compose.saveSaved': '已保存到文件',
  'compose.saveFailed': '保存失败，内容仍保留在编辑框里',
  'selection.sendToChat': '发送会话',
  'selection.quote': '引用',
  'selection.toolbarLabel': '选区操作',
  'selection.edit': '编辑',
  'selection.multiAdd': '多选',
  'selection.editCount': '编辑 ({count})',
  'selection.removeItem': '移除该条',
  'selection.multiAdded': '已加入多选（{count}）',
  'selection.editTitle': '编辑选中内容',
  'selection.multiEditTitle': '编辑多选内容',
  'selection.collectedCount': '已收集 {count} 段',
  'expand.open': '展开成大编辑区（回车换行，点发送才发送）',
  'expand.close': '收起编辑区',
  'turnFold.label': '第 {turn} 轮 · {clock}',
  'turnFold.frameThinking': '思考',
  'turnFold.frameTools': '工具调用',
  'turnFold.frameAnswer': '回答',
  'turnFold.frameError': '错误',
  'turnFold.frameRetry': '重试',
  'turnFold.frameCompaction': '上下文压缩',
  'turnFold.frameContext': '上下文',
  'turnFold.frameLimit': '达到长度上限',
  'turnFold.frameQuestion': '提问',
  'turnFold.frameWorkflow': '工作流',
  'turnFold.frameRunning': '进行中',
  'turnFold.requestLabel': '你的请求 · {summary}',
  'turnFold.requestExpand': '展开请求',
  'turnFold.requestCollapse': '收起请求',
  'turnFold.labelWithSummary': '第 {turn} 轮 · {clock} · {summary}',
  'turnFold.collapseAria': '收起这一轮',
  'turnFold.expandAria': '展开这一轮',
  'tools.chat': '会话',
  'tools.files': '工作区文件',
  'tools.browser': '浏览器',
  'tools.terminal': '终端',
  'tools.openLocalFile': '打开本机文件',
  'tools.more': '更多',
  'tools.linkOpenDefault': '网页链接打开方式',
  'fileTree.reference': '引用 {path}',
  'fileTree.loadMore': '加载更多（还有 {count} 条）',
  'promptView.title': '提示词',
  'fileTree.editCopy': '编辑副本 {path}',
  'fileTree.empty': '此目录为空',
}

export const en: Record<ChatPowerLocaleKey, string> = {
  'mermaid.label': 'Mermaid',
  'mermaid.diagram': 'Diagram',
  'mermaid.source': 'Source',
  'mermaid.toggleNamed': 'Switch between the Mermaid diagram and its source',
  'mermaid.loading': 'Loading the diagram…',
  'mermaid.renderFailed': 'The diagram did not render',
  'mermaid.retry': 'Retry',
  'answerCard.copy': 'Copy result',
  'answerCard.copied': 'Copied',
  'answerCard.edit': 'Edit',
  'answerCard.title': 'Answer',
  'answerCard.editAnswer': 'Edit answer copy',
  'panel.sessionBar.copy': 'Copy',
  'panel.sessionBar.copied': 'Copied',
  'panel.sessionBar.copyFailed': 'Copy failed: ',
  'panel.sessionBar.copyUnavailable': 'Clipboard unavailable here; select the text to copy manually',
  'markdownTurn.loading': 'Reading the document…',
  'markdownTurn.error': 'The document did not load',
  'markdownTurn.retry': 'Retry',
  'markdownTurn.truncated': 'This document is long; only the first part is shown',
  'markdownTurn.collapse': 'Collapse',
  'markdownTurn.expand': 'Expand',
  'markdownTurn.collapseAria': 'Collapse {name}',
  'markdownTurn.expandAria': 'Expand {name}',
  'markdownTurn.openTitle': 'Open in {app}',
  'markdownTurn.openDefault': '{app} (default)',
  'markdownTurn.openAppsError': 'Could not load applications',
  'markdownTurn.openMore': 'More ways to open',
  'markdownTurn.defaultOpenLink': 'Default open mode',
  'markdownTurn.linkOpenRight': 'Open in built-in browser',
  'markdownTurn.linkOpenBrowser': 'Open in external browser',
  'markdownTurn.openFolder': 'Open folder',
  'markdownTurn.openError': 'Could not open. Try again.',
  'markdownTurn.revealError': 'The folder did not open',
  'markdownTurn.copy': 'Copy',
  'markdownTurn.copied': 'Copied',
  'markdownTurn.code': 'Code',
  'markdownTurn.wrap': 'Wrap',
  'markdownTurn.unwrap': 'Unwrap',
  'markdownTurn.footnotes': 'Footnotes',
  'markdownTurn.send': 'Send',
  'markdownTurn.sendToSession': 'Send to conversation',
  'markdownTurn.edit': 'Edit',
  'markdownTurn.cancel': 'Cancel',
  'markdownTurn.comment': 'Comment',
  'markdownTurn.commentPlaceholder': 'Write a comment…',
  'markdownTurn.commentSend': 'Send comment',
  'markdownTurn.commentedAs': 'The user’s comment on this passage',
  'markdownTurn.commentRemove': 'Delete comment',
  'markdownTurn.composePlaceholder': 'Type content to add to the conversation…',
  'markdownTurn.sendFailed': 'Could not send. Try again.',
  'markdownTurn.newSession': 'New session',
  'markdownTurn.newSessionPromptHeader': 'File path: {path}',
  'markdownTurn.newSessionFailed': 'Could not start a new session. Try again.',
  'markdownTurn.copyFailed': 'Could not copy. Try again.',
  'markdownTurn.filesAll': 'All {count} files',
  'markdownTurn.filesAllAria': 'Show all {count} files',
  'markdownTurn.filesGroup': 'Files in this turn · {count}',
  'markdownTurn.commentsPending': 'Pending comments · {count}',
  'markdownTurn.sending': 'Sending…',
  'markdownTurn.filesCollapseAria': 'Collapse the file list',
  'markdownTurn.openFile': 'Open a local file',
  'markdownTurn.localFileHeader': 'Below is the content of local file {name}:',
  'markdownTurn.localFileTooLarge': 'The file exceeds 5 MB and was not opened',
  'markdownTurn.copyAll': 'Copy all',
  'compose.sendCurrent': 'Send to current conversation',
  'compose.sendNewSession': 'New session and send',
  'compose.copyHint': 'You are editing a copy to send; the original stays unchanged.',
  'compose.copy': 'Copy',
  'compose.save': 'Save',
  'compose.saveSaved': 'Saved to the file',
  'compose.saveFailed': 'Save failed; the text is kept in the editor',
  'selection.sendToChat': 'Send to chat',
  'selection.quote': 'Quote',
  'selection.toolbarLabel': 'Selection actions',
  'selection.edit': 'Edit',
  'selection.multiAdd': 'Multi-select',
  'selection.editCount': 'Edit ({count})',
  'selection.removeItem': 'Remove this item',
  'selection.multiAdded': 'Added to multi-select ({count})',
  'selection.editTitle': 'Edit selected text',
  'selection.multiEditTitle': 'Edit multi-selected text',
  'selection.collectedCount': '{count} collected',
  'expand.open': 'Expand to a large editor (Enter newline, only Send sends)',
  'expand.close': 'Collapse the editor',
  'turnFold.label': 'Turn {turn} · {clock}',
  'turnFold.frameThinking': 'Thinking',
  'turnFold.frameTools': 'Tool calls',
  'turnFold.frameAnswer': 'Answer',
  'turnFold.frameError': 'Error',
  'turnFold.frameRetry': 'Retry',
  'turnFold.frameCompaction': 'Context compaction',
  'turnFold.frameContext': 'Context',
  'turnFold.frameLimit': 'Length limit reached',
  'turnFold.frameQuestion': 'Question',
  'turnFold.frameWorkflow': 'Workflow',
  'turnFold.frameRunning': 'Running',
  'turnFold.requestLabel': 'Your request · {summary}',
  'turnFold.requestExpand': 'Expand request',
  'turnFold.requestCollapse': 'Collapse request',
  'turnFold.labelWithSummary': 'Turn {turn} · {clock} · {summary}',
  'turnFold.collapseAria': 'Collapse this turn',
  'turnFold.expandAria': 'Expand this turn',
  'tools.chat': 'Chat',
  'tools.files': 'Workspace files',
  'tools.browser': 'Browser',
  'tools.terminal': 'Terminal',
  'tools.openLocalFile': 'Open a local file',
  'tools.more': 'More',
  'tools.linkOpenDefault': 'Default link opening',
  'fileTree.reference': 'Reference {path}',
  'fileTree.loadMore': 'Load more ({count} left)',
  'promptView.title': 'Prompts',
  'fileTree.editCopy': 'Edit copy of {path}',
  'fileTree.empty': 'This directory is empty',
}

/** `{name}` 形式的参数插值；模板里没有对应参数时原样保留占位符。 */
function interpolate(template: string, params?: Params): string {
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(params[key] ?? `{${key}}`))
}

/** 缺 key 时退回中文，再退回 key 原文——绝不抛错。 */
export const fallbackT: RuntimeT = (key, params) => {
  const k = key as ChatPowerLocaleKey
  return interpolate(zh[k] ?? key, params)
}

/** 运行时 locale 感知的翻译；拿不到注册表时退回 {@link fallbackT}。 */
export function makeT(dict: Record<string, string>): RuntimeT {
  return (key, params) => {
    const k = key as ChatPowerLocaleKey
    return interpolate(dict[k] ?? zh[k] ?? key, params)
  }
}
