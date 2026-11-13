# 会话区域扩展点与改造方案

依据：本地官方镜像 dsh-v0.2.2-rc.1，2026-11-13。本文区分正式扩展契约与宿主 DOM 实现细节，不把 CSS 选择器当稳定 API。

## 当前恢复范围

停用入口中的旧 turn-fold 控制器：不再插轮次页签框、不再隐藏用户/过程行、不再强制滚动或限高。原生回答行增加边框、圆角、背景和内边距；正文、图片及子座位仍由原生渲染。工作步骤的展开/收起完全交回宿主。

工作步骤设置应为：简洁/标准/详细之一，收起时机为「回答结束后」，收起后显示「仅最终回答」；「完全展开」不会收起。此次代码不覆写用户设置。

回答框使用原生 `data-chat-flow-kind=assistant-step`，排除 reasoning 分部与 `data-turn-process-member`。流式过程中仍被宿主归为 process member 的内容先维持原生外观，归入回答后显示边框。旧历史缺少足够分组证据时只能按原生节点分类，不能凭 DOM 保证语义上的最终一步。

框加在原生 flow 行上，不加在 `data-slot` 上（后者是 `display: contents`，自身不产生盒子）。不搬节点、不包原生 React 组件、不增加第二份正文、不限制高度。未恢复旧答案卡编辑/另存按钮；原生复制等操作保留。随旧控制器停用的还有轮次页签、快捷信息标题栏与其拖拽把手，未来应分别通过合法扩展位置恢复。其他输入框编辑、选区工具、文件尾卡与工作区工具保留。

## 正式扩展点

下表按官方层级分组；精确基数、owner props 与可用性须以目标宿主 SlotMap 或实时 inspect 为准，不能仅凭名字猜注册方式。

| 位置 | 点位 | 特点、适用范围与边界 |
| --- | --- | --- |
| 会话头部 | `conversation.header.leading` | 会话外壳前导入口，适合导航按钮；不承载逐轮正文 |
| 会话标题附近 | `conversation.session.header.lineage` / `actions` / `utilities` / `corner` | 血缘、操作、辅助信息和角标；可用会话作用域数据。actions 的官方示例为新增 list id |
| 独立会话视图 | `conversation.view` | 为自己的视图增加独立 id，由 shell 管理选择与 target 激活；适合完整工作台，不能借此偷偷改写原生 chat |
| 整个聊天流 | `conversation.chat.flow` | 原生流的替换边界，涉及锚点、分页、滚动与节点分发，代价高；不作为当前增量入口 |
| 节点渲染 | `conversation.chat.node` | keyed，新增业务 key 合适。原生 assistant-step/tool-call 已有 children，不能拿其组件包装再转发自己的 renderSlot |
| 思考正文 | `conversation.chat.reasoning.body` | 专门的思考正文替换位置；不等于整轮容器，外层分组仍归宿主 |
| 回答图片 | `conversation.chat.message.images` | 仅图片展示；与用户图片、工具图片分开，保留宿主授权 loader |
| 每轮尾部 | `conversation.chat.turnTail` | 适合文件、交付物、摘要卡；是在尾部追加内容，不是包住前面的原生回答 |
| 回答操作栏 | `conversation.chat.assistant-actions` | 适合新增复制变体、编辑副本、文件入口等动作；按钮数据应从声明的 props/会话 source 获取 |
| 文本选区 | `conversation.chat.text-interaction` | 选中文字后的操作，沿用宿主选区定位和权限；本包已有接入，可复用 |
| 工具调用内容 | `tool.call.toolview` | 适合特定工具 key 的展示；不要接管所有 tool-call 外层 |
| 工具图片 | `tool.call.images` | 工具输出图片，与助手图片分开；默认由图片组件携 loader 渲染 |
| 命令结果 | `conversation.chat.commandview` | 命令专用显示，不作为普通答案扩展点 |
| 用户正文 | `conversation.user.text.node` | keyed、inline，适合用户文本中特定节点；锚点是 span，不能随意放块级容器 |
| 用户图片 | `conversation.chat.user.images` | 用户输入图片，与助手输出图片分离 |
| 输入框左右控件 | `conversation.input.left` / `right` | 追加操作入口，保留原生编辑器及发送流程 |
| 输入框附属内容 | `conversation.input.attachments` / `overlay` / `conversation.composer.dock` / `conversation.input.dock` | 附件、覆盖层、停靠区；按对应 owner 的职责使用，不搬原生控件 |
| 输入框状态/选择器 | `conversation.input.permission` / `plan` / `model` / `model.label` / `activity` | 专门位置；activity 是单个活动控件，替换前确认已有 occupant |
| 审批与计划审核 | `conversation.approval.detail` / `conversation.plan-review.actions` | 特定交互阶段的补充内容，遵循原生权限与状态 |
| 空会话引导 | `conversation.hero.brand.mark` / `workspace` / `workspace.directoryFlow` / `agentPreset` / `options` | 新会话起始界面，不参与已有消息流 |
| 轨迹图片 | `conversation.trajectory.images` | 轨迹 target 的图片位置，与 chat 独立 |

Factory 是可复用 UI 定义，不能当成任意包装原生组件的许可。官方列出的相关 Factory 包括 `conversation.content`、`conversation.chat.user.content`、`conversation.user.text`、`conversation.images.content`、`conversation.chat.reasoning.content`。应通过公开调用契约使用，不能运行时导入别的功能包组件。

## 注册规则与数据能力

- list：使用新 id 追加；single 或已有 keyed cell：属于替换，priority 更小获选。chain 通过纯 select 选择第一个非空结果。
- 用 `slots.inject(key, callback)` 等待 owner 声明与生命周期；不重复声明他人的 children。renderSlot 只授权本 entry 自己声明的 key。
- session 槽位需要有效 binding；不能从全局 DOM 猜 session id 再缓存失效 binding。
- 标准会话 hooks 包括 `useSession`、`useProjection`、`useConversation`、`useInput`、`useChat`；具体可用面由 adapter/目标宿主声明决定。节点位置可用受限 `useTurnData(key)`。
- 数据链：Host 日志 → follow/page 窗口 → Client Session → Conversation assembler → target snapshot → Slot。`useChat` 是已加载窗口，不保证包含全部历史；文件正文另走文件读取接口，不能把 DOM 文本当结构化数据源。
- 自有业务数据可注册 Event Definition，生成自己的 Chat node key；需要同轮共享信息可发布 Location data。要验证历史 prepend、实时 append、流式块、重连和回放的一致性。
- Group Definition 是正式分组协议，但要求目标已存在、builder 支持 groupInput，且同 target 不能重复注册分组；原生 chat 已有分组，不是给第二个插件任意追加整轮框的空座位。

## 下一版建议

1. 本次基础版：原生聊天 + 回答边框 + 原生工作步骤收起。先验收长回答、图片、思考/工具、历史分页及会话切换；样式不应让内容消失。
2. 增量工具版：编辑副本/复制类按钮进入 assistant-actions，文件与交付物进入 turnTail，快捷信息进入输入框侧边或 dock。数据来自 props/source；数据不足显示不可用原因，不隐藏正文。
3. 若仍要「请求/过程/结果」三页签：新增独立 conversation.view，先做只读原型，显示已加载轮数、节点分类和历史加载状态。验证数据完整性后再加入交互，原生 chat 保持可切回。
4. 真正把原生最终答案及整轮统一包进一个 React 容器，需要宿主提供明确的 answer/turn wrapper 扩展点，或由独立视图完整拥有该布局。当前镜像没有列出这样的增量 wrapper 槽位；不再用搬 DOM 或包装原生组件绕过。

## 验收与诊断

分别报告数据、渲染、可见性：target 有没有节点；槽位是否注册/激活、有无 slot-error；行是否因原生/插件样式隐藏。不能仅凭一个 Console 错误推断整条数据链故障。

本次自动验证覆盖边框选择器、宿主节点不被改写/搬运、图片保留、流式正文更新及卸载清理；真实桌面效果需加载新 bundle 后确认。激活预检只证明 apply 降级不抛错，不能替代浏览器实测。

## 依据

- [官方 Slots](../../docs/official/reference/subsystems/slots.md)：声明所有权、基数、作用域、hooks、Conversation 层级。
- [官方 Conversation](../../docs/official/reference/subsystems/conversation.md)：target、分组、事件、历史窗口、回放要求。
- [官方 Web Client](../../docs/official/reference/subsystems/web-client.md)：分层、数据流与包边界。
- 宿主 0.2.2-rc.1 `dsh-client-ui-chat` 的 ChatNodeSeat 与 `dsh-client-ui-renderer` 的 SlotOutlet：DOM 标记、槽位 display:contents。仅用作当前版本样式适配证据。
