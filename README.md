# dsh-chat-power

DSH 会话区增强插件：与跑哪种 agent 无关的会话区功能都归这里。

> **开发与排障请先查官方文档**：本插件的宿主契约（客户端模块、Slots、会话投影、对话组装等）
> 以 DeepSeek Harness 官方文档为准。本地镜像见
> [`../docs/official/README.md`](../docs/official/README.md)（含按场景的导航表），
> 线上版本见 <https://deepseek-harness.github.io/deepseek-harness/>。
> 排查「功能不见了」「界面整块不生效」「事件不触发」前先查对应章节。

## 装上会发生什么

- **会话区标签工作台**：会话区域顶部是常驻的标签条（工具行 + 标签行），聊天本身是
  其中的「会话」标签。新会话默认带「工作区文件」标签并激活；有历史的旧会话默认
  激活「会话」标签。首次发送后自动生成/切换到「会话」标签，其余标签原样保留、
  随时可切。顶部文件夹按钮改为「打开或激活工作区文件标签」。工具标签激活时只
  收起聊天消息列表，输入框（composer）留在下方。
- **文件树行控件**：工作区文件树的每个文件行前面有多选框——勾选即把 `@路径` 写进
  输入框作为文件引用（取消勾选即移除），勾选状态按会话记忆、发送后清空；行尾有
  悬浮才出现的「编辑」按钮，点击读入整篇文本（5 MB / 20000 行上限）并作为编辑标签
  打开，卡片里可发送到当前会话（空新会话也能直接发）或新建会话发送。
- **文件编辑与发送**：本机文本文件打开后直接进入编辑卡片，支持复制全文、发送到当前
  会话、新建会话发送。工作区文件保留宿主预览能力，文本预览头部增加「复制全文」和
  「编辑并发送」。编辑的是待发送副本，不会覆盖磁盘文件。标签与草稿跨标签切换保留。
  本机文件限制 5 MB；工作区复制/编辑限制 5 MB / 20000 行，超过限制明确报错，不复制残缺正文。
- **链接偏好**：工具栏选择内置 / 外部浏览器，普通 HTTP(S) 超链接统一遵循此设置；
  修饰键点击、下载链接、应用自身导航保持标准行为。浏览器地址栏右端保留宿主的外部打开按钮。
- **短会话 ID + 复制**：仍位于会话标题栏右侧工具行。
- **答案卡片**：一轮的最终回答外面套一层卡片，带编辑 / 复制 / 另存为新会话任务。
  编辑态仿输入框的组合条：取消按钮占住卡片头部的编辑位置（编辑时就是它替换了
  编辑图标），新建会话是描边文字按钮、与发送钮之间留大间距避免误点，发送是一枚
  圆形图标按钮——常态铺品牌色，hover 才转浅，和输入框的发送钮一致。
- **会话尾部文件卡片**：从一轮的输出里认出文件路径，就地展开阅读、编辑、
  发送回会话、用桌面应用打开；超过四个折叠。
- **展开大编辑区**：输入框正上方一枚居中的「向上展开」图标按钮（只图标、占据
  独立一行高度，不与上方内容重叠），点开是一个多行编辑区（约 8–20 行自动撑高）。
  这里**回车只是换行**，必须点「发送」按钮才发——宿主 composer 是单行、回车即
  发送，大段内容不够用。发送走与选区「发送会话」、文件阅读区、答案卡片同一条
  队列通道；展开时从下方小输入框种入草稿、编辑即写回（两者共享宿主输入外壳，
  收起不丢字）。
- **选区工具栏**：在会话区域选中一段文字，宿主文本交互表面弹出一条工具栏——
  「引用」「发送会话」「编辑」「多选」。**「引用」与官方引用钮
  同位同效**：走宿主 `inputActions.insertQuote`，把选中文字变成输入框里的
  可移除引用卡，发送时序列化成 Markdown 引用块。本包往宿主座位
   `conversation.chat.text-interaction` 注册 `key=quote` 的组件顶替官方引用钮，
  但复用官方交互规则（何时弹、弹在哪、会话是否可写）。「发送会话」直接作为
  新请求发出；「编辑」把选中内容展开成会话区的编辑卡（至少 10 行高，可编辑后
  发送或发去新会话）；「多选」把选中内容加入收藏并保持高亮，同时**会话区域
  顶部浮出独立的浮动条**（宽度为会话区域一半、圆角、条间距 2px）：每条一段预览
  与独立移除按钮，可逐条撤掉；小「编辑 (n)」钮压在最后一条的右下方。收藏与
  浮动条绑定收集时的会话——切换到别的会话时自动隐藏，切回来继续可见。
  **会话历史里的引用卡无需本包做任何事**：官方 `@deepseek-ai/dsh-message-quotes`
  插件（`dsh-web-app` 自带、必然加载）已无条件注册 `quoteRule`（识别 `> 引用块`）
  与 `QuotedUserText`（用 `QuotePreview` 渲染）。本包「引用」钮产出的
  `> text` 与官方引用钮逐字一致，故历史里自动显示成引用卡。本包不注册同名
  `userText` 规则，不会与官方那条撞名（重复 id 会抛「Duplicate text interaction」）。
  「编辑」与清单底部按钮都把内容送进**占满会话区域的编辑卡**（至少 10 行
  高，可编辑后发送或发去新会话）：单选编辑只含选中文字；多选编辑按原顺序、
  项间空行拼接，发送后连收藏与高亮一起清掉。输入框、编辑框、文件阅读区正文（已有自己的工具条）不弹；Escape
  或点击别处收起。
- **Mermaid 图渲染**：把 Markdown 里的 ` ```mermaid ` 代码块画成 SVG，可切「图表 /
  源码」。运行时 3.5 MB 不内联进客户端包，第一次遇到图时才从宿主路由
  `/chat-power/mermaid.js` 懒加载。
- **轮次折叠与当前轮限高**：会话区按轮次工作。新一轮开始时，此前的轮次自动折叠成
  一行摘要条（轮次号 · 时刻 · 首句摘要），只有当前轮留在主屏；滚上去点摘要条即可展开，
  展开态右侧有「收起」。当前展开的一轮若超过一屏，超出的部分在轮内滚动（输入框与轮首
  始终留在视野里），流式输出时内容保持贴底。
  折叠与限高只动 DOM（给宿主行加标记、插自己的摘要条），不移动宿主节点、不改宿主结构。

### 思考块的折叠由宿主设置控制（本包不接管）

「思考过程要展示、思考结束后自动折叠」是宿主自带的行为，设置路径：
**设置 → 通用 → 工作步骤** →
- **工作步骤收起时机** 选「回答结束后」；
- **收起后显示的回复** 选「仅最终回答」（这样思考内容随工作步骤一起收起）。

两项都在「工作步骤展示」为简洁 / 标准 / 详细时生效；选「完全展开」则永不折叠。

| 功能 | 注册位置 |
| --- | --- |
| 会话区标签工作台 | `shell.overlay` 管理生命周期，React portal 插入会话正文的正常布局（条带在会话内容之前） |
| 文件树行控件 | 私有座位 `chat-power.tools.sidebar.right.pane.tab` 上重注册 FilesBody（优先级 -10），DOM 覆盖层补挂控件 |
| 短会话 ID + 复制 | `conversation.session.header.utilities`（会话作用域 list） |
| 答案卡片 | 包住 `conversation.chat.node` 的 `assistant-step`（优先级 -50） |
| 会话尾部文件卡片 | `conversation.chat.turnTail` |
| Mermaid | DOM 级（扫已渲染的 Markdown）+ 宿主路由 `/chat-power/mermaid.js` |
| 轮次折叠与当前轮限高 | DOM 级（按宿主的 `data-chat-turn` 分组行，加折叠标记、插自己的摘要条） |

## 与 dsh-acp-agent 的关系（两个包都装时）

ACP 的**进程段**（工具调用/思考的过程卡片）是 agent 专属的，仍留在
`@goodjin2/dsh-acp-agent`。两个包通过一个跨包座位接起来：

1. 本包在重注册 `assistant-step` 包装时**声明**座位
   `conversation.chat.node.acp-segment-renderer`（`children` 表，list 类型）。
2. acp-agent 发现座位存在后，把它的 `AcpProcessBlock` 注册进来。
3. 本包的包装在渲染时按座位取名：带 `acpProcessSegment` 的节点交给它，其余步骤
   走答案卡片。

`assistant-step` 的规则是「优先级最低的那条渲染」。本包用 **-50**、acp-agent 的
兜底用 **-40**，所以本包恒在外层；只装 acp-agent 时它那层生效，ACP 段照样完整。
改优先级必须两个包一起改——`tests/wrap-priority.spec.ts` 钉住了这个先后关系。

## 安装与挂载

```sh
npm install @goodjin2/dsh-chat-power
```

在 profile 的 `dsh.profile.bundles` 里加上 `@goodjin2/dsh-chat-power` 即可。本包自带
`cordis.patch.yml`（`dsh.bundle.patch`），里面包含：

- `chat-power-client`：以**裸包名**挂载本包，浏览器半边靠它被扫进
  `window.__DSH_BOOT__`。这一行不是可有可无的：DSH 不按 `package.json` 的
  `dsh.client` 自动装载浏览器包，只看 Loader 的行名是否恰好等于包名
  （`ClientModuleRegistry.resolveMeta` 经 `locatePkgJson` 解析；带子路径的名字
  一律不算客户端行）。少了它，插件装上也什么都不发生，宿主日志里一个字都没有。
- `chat-power-mermaid-asset`：宿主侧 `/chat-power/mermaid.js` 这条 exact 路由，
  供浏览器半边懒加载 mermaid 运行时。

## 迁移说明（0.3.0）

mermaid 渲染、答案卡片、会话尾部文件卡片在 0.3.0 从 `@goodjin2/dsh-acp-agent`
迁到本包（agent 无关的通用会话区功能归本包，ACP 专属留在那边）。对应的旧行
`@goodjin2/dsh-acp-agent/mermaid-asset` 在 acp-agent 0.3.0 已删除；从旧版本升上来
时，把 profile 里这条旧行换成 `@goodjin2/dsh-chat-power/mermaid-asset`（或直接删掉，
由本包的 bundle patch 提供）。

## 开发

```sh
npm run typecheck   # tsc --noEmit
npm test            # vitest（含产物的装载冒烟测试）
npm run build       # tsc -p tsconfig.json && tsdown → lib/client.js
```

`tests/bundle.spec.ts` 会把 `lib/client.js` 按页面的方式执行一遍（模拟
`window.__ModuleLoader__`、用页面给的 `require` 取 react / primitives、调 `apply`）：
产物格式或 id 写错时，这里会先红，而不是等页面在装配审计里判失败。

构建是**可复现**的：同一份源码连建两次产物字节相同（CSS module 哈希按基名算），
所以 `lib/client.js` 入库后，重建不会平白弄脏工作区，也不会触发无意义的页面热替换。

## Requirements

- DSH >= 0.2.0-rc.2
- 会话工具需要宿主自带的文件、浏览器、终端、文档预览客户端模块（已声明 `dsh.client.external`）。
- 以 DSH 0.2.1-rc.3 验证；这些模块的工厂和座位接口变化时需运行浏览器验收。

## License

MIT

## 会话工具实现与迁移

`conversation-tools.tsx` 负责入口、标签条和正文视图；`tools-state.ts` 管理每会话独立的
标签（含「会话」标签）与 AbortSignal；`tools-adapter.tsx` 在私有服务和 `chat-power.tools.*`
座位中装配宿主功能工厂。文件树行控件（多选框 + 悬浮编辑）由 `file-tree-augment.tsx`
在私有座位上重注册宿主 FilesBody 后以 DOM 覆盖层补挂；勾选引用的落地在
`composer-references.ts`（优先宿主输入外壳，退回 execCommand）；发送侦测在
`send-watch.ts`（聊天流新增用户消息 → 切到会话标签）。浏览器持久化使用独立作用域，
终端关闭调用资源清理，不与原右侧栏共享导航状态。
为支持 Web profile，bundle patch 启用宿主浏览器模块（Web 使用 iframe，网页可能拒绝嵌入，
这时可以使用外部打开按钮）。

`dsh-rightbar-overlay` 已退役，应从 profile 的 dependencies / bundles 和 node_modules
链接中移除。不得与本方案一起用来改写会话布局。浏览器中的旧 localStorage 开关键不再读取。

验收：新会话默认工作区文件标签、旧会话默认会话标签、首次发送自动切到会话标签、
标签间来回切换保留状态、文件行勾选引用进输入框且取消勾选移除、文件行悬浮编辑打开
编辑标签、文本文件编辑保留、工作区预览/复制/编辑、浏览器内外打开、终端启动/关闭；
检查宿主右侧栏未受影响。构建产物随源码提交，桌面 App 重启后加载。


## Version anchor tags

This repo participates in the container's DSH version-correspondence mechanism: every
plugin repo carries tags named `dsh-<dsh版本>` (e.g. `dsh-0.2.2-rc.1`), each an annotated
tag recording the dsh version it was verified against, the check result, and the date.
The tag is the immutable "known-good coordinate" of that dsh version — a snapshot of
`main` taken the moment the whole-plugin row check went green on every installed host.

- **Why tags instead of releases**: the desktop app reads this checkout by path and the
  web install pulls `repo#ref` — a git tag is already the furthest installable form, so
  no npm publish or GitHub Release is needed.
- **Rollback**: `scripts/pin-to-dsh.sh 0.2.2-rc.1` (from the container) checks out the
  tag in every repo at once; `scripts/check-host-rows.mjs --report` shows which repos are
  on the anchor for the running dsh version.
- **Do not move or delete a `dsh-*` tag**; it is a rollback coordinate. A follow-up fix on
  the same dsh version adds a `-p2` (then `-p3`) suffixed tag instead.
- New tags are cut after each dsh upgrade, as step 4 of the upgrade runbook — see the
  container's `AGENTS.md` for the full flow.
