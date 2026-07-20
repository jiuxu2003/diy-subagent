# 设计 macOS Subagent 工作流管理器 MVP

## Goal

打造一款 macOS 本地桌面应用，帮助已经使用至少一个 Coding Agent、但不熟悉 Subagent 原生语法和角色设计的个人开发者，从高质量模板出发，完成结构化定制、逐平台校验、原生预览和安全安装，让自定义 Subagent 真正进入个人工作流，而不是继续依赖少量 built-in Agent 或手写 YAML/TOML。

## Target User and Primary Journey

首要用户是使用 Claude Code、Codex 或 Cursor 的个人开发者。他们理解基本 Agent 交互，但不应被要求记住原生目录、frontmatter/TOML 字段或高质量 Subagent Prompt 的设计方法。

MVP 默认旅程：

```text
模板库
-> 选择一个高质量 Subagent
-> 逐章定制共享工作契约
-> 选择一个或多个目标平台并配置平台字段
-> 查看每个平台的原生文件、校验、差异和目标路径
-> 确认整批安装
-> 获得调用说明、自动委派建议和验证任务
```

## Confirmed Facts and Evidence

- 产品形态参考 CC Switch，但领域对象是 Subagent，不采用 Provider 独占切换模型。
- 技术栈采用 Tauri 2、React、TypeScript strict mode 和 Rust；交付目标是 macOS 本地开发原型。
- Claude Code 用户级自定义 Subagent 位于 `~/.claude/agents/`，采用 YAML frontmatter + Markdown body；`name`、`description` 必填。
- Codex 用户级自定义 Agent 位于 `~/.codex/agents/`，每个 Agent 是独立 TOML 配置层；`name`、`description`、`developer_instructions` 必填。
- Cursor 用户级自定义 Subagent 位于 `~/.cursor/agents/`，采用 YAML frontmatter + Markdown body；当前官方字段包括 `name`、`description`、`model`、`readonly`、`is_background`，其中 `name` 可由文件名派生。
- Cursor 官方声明会扫描 Claude/Codex Agent 目录，但对 Codex TOML 的精确兼容边界仍需真实运行时验证，不能仅凭目录表推断。
- CC Switch 可借鉴每平台独立目录设置、最终解析路径展示、目录浏览/恢复默认、Rust 集中解析、原子写入和分层。其当前主分支不能作为 `CODEX_HOME` 已支持的证据。
- Loadout、Agent Harness、subagent-harness、Supagents 等覆盖相邻需求，但当前调研未发现一个成熟产品同时完成 Claude Code、Codex、Cursor 原生 Subagent 的可视化创作、严格校验、模板指导和安全多平台安装。
- 原生 Agent 文件是安装状态的事实来源；SQLite 只保存应用自有索引、设置、来源、哈希和备份 manifest。模板正文同样必须文件化，不能只存在 SQLite。
- 当前任务只进行需求和技术规划，不修改产品源代码，也不写入 `docs/` 或 `prompts/`。

官方契约基线：

- Claude Code：https://code.claude.com/docs/en/sub-agents
- Codex：https://learn.chatgpt.com/docs/agent-configuration/subagents
- Cursor：https://cursor.com/docs/subagents.md

## Requirements

### A. 产品模型与编辑体验

- R0：MVP 的一等产品对象是单个 Subagent；不以 Workflow Pack 或运行时编排作为主导航或核心领域对象。
- R1：应用统一支持 Claude Code、Codex 和 Cursor，同时保留各平台原生格式，不要求用户迁移到私有安装格式。
- R2：默认入口是精选模板库；用户通过引导式定制开始，而不是默认面对空白表单或原生源码。
- R3：写入前必须执行严格、平台感知的结构、字段和能力校验，屏蔽不必要的 YAML/TOML 语法负担。
- R4：共享语义核心通过引导式表单编辑，平台专属字段通过高级面板编辑；最终 YAML/TOML/Markdown 只读完整预览。
- R5：平台差异由可扩展适配器边界承载，未来新增平台不得把平台判断散落到 UI、command 或 service。
- R6：适配器具备契约版本管理；官方格式变化时不能静默生成旧格式或删除新字段。
- R7：所有原生文件变更必须经过预览、冲突检测、备份、原子替换、重读验证和可理解的回滚结果。
- R8：模板采用“共享语义核心 + 平台专属覆盖”；角色、用途、工作契约和使用建议只维护一次，模型、工具、权限和执行模式显式分平台表达。
- R9：禁止最低公分母和静默降级；无法精确映射的能力必须显示为 exact、prompt-only、native-only、unsupported 或 blocked-lossy 等明确结果。

### B. 用户级范围、安全安装与导入

- R10：MVP 只支持用户级全局 Agent 的安装和检测，不扫描、创建或安装项目级 Agent。
- R11：安装确认页必须展示全局可见范围、最终绝对路径、名称冲突和平台加载/优先级说明。
- R12：一次安装允许选择 Claude Code、Codex、Cursor 中一个或多个目标；每个目标分别生成、校验和预览原生文件。
- R13：多平台安装采用整批事务语义；全部目标预检通过后才能写入，任一目标失败时必须回滚本批次已经发生的变更，并报告逐平台最终状态。
- R14：扫描到的现有原生 Agent 默认只读；发现动作不得自动导入、改写或标记为应用所有。
- R15：只有用户显式执行“导入并编辑”才能接管现有文件；接管时记录来源、平台、原始内容快照、契约版本和文件 revision，写回前检测外部修改。
- R16：导入和重新渲染必须保留未知平台字段与 Prompt body；无法证明安全 round-trip 时阻止写回并要求外部编辑。
- R17：MVP 不提供内置 YAML/TOML 双向源码编辑；允许只读查看、显示文件或打开外部编辑器，外部变化通过 revision 和重新导入处理。

### C. 模板范围、质量与离线确定性

- R18：模板来源只包括随应用发布的内置精选模板和本机个人模板；首版不依赖网络仓库、社区市场或后台更新。
- R19：每个内置模板包含稳定 ID、版本、作者/来源、适用场景、使用建议、支持平台、权限/工具风险和平台覆盖；个人模板明确标记为本地内容。
- R20：首批目录包含 6 个强约束专家：需求澄清、代码库架构梳理、第三方文档研究、根因调试、代码审查、交付验证。
- R21：模板不能只是 Explore、Plan、Worker 的改名；必须定义适用/禁用条件、输入、输出、允许动作、权限边界、停止条件和失败报告。
- R22：模板个性化完全由确定性表单驱动，不调用 LLM API，也不启动本机 Claude、Codex 或 Cursor CLI 生成配置。
- R23：相同模板版本、输入和目标平台契约必须产生确定性的领域草稿、校验结果和字节稳定或语义等价的原生输出。

### D. 三平台对等与工作流落地

- R24：Claude Code、Codex、Cursor 必须在用户级全局范围达到核心功能对等：原生发现、模板定制、平台校验、原生预览、安装、显式导入、冲突检测、备份和回滚缺一不可。
- R25：核心功能对等不等于字段数量相同；能力矩阵必须区分平台支持、无原生对应、prompt-only 和首版只读保留。
- R26：产品优先服务已使用至少一个 Coding Agent、但不熟悉 Subagent 路径、语法、字段和角色设计的个人开发者。
- R27：首版信息架构和文案面向个人本机工作流，不以团队审批、组织策略、集中审计或企业分发为默认前提。
- R28：每个模板和生成的 Agent 都包含可执行使用契约：适用/禁用场景、输入要求、输出结构、允许动作、停止条件和失败报告。
- R29：安装完成页按平台提供文件位置、显式调用方式、自动委派所依赖的 description 建议和可复制验证任务；应用不启动 Agent 会话。

### E. 库存、目录与冲突

- R30：MVP 不建立私有 Agent 生命周期状态；只通过目标原生目录中的真实文件检测安装情况，不提供启用、停用、卸载、恢复或模板版本升级操作。
- R31：库存只扫描三个已解析的用户级 Agent 根目录，不遍历 Git 仓库、常见开发目录或用户项目。
- R32：每个平台提供独立的解析路径、目录浏览和恢复默认；Rust 按“用户显式覆盖 → 官方确认的环境变量（若存在）→ 默认目录”解析，禁止全盘猜测。
- R33：同名或同路径冲突默认阻止并展示 diff；用户只能修改新 Agent 名称后重新预览，或明确选择“备份后替换”，禁止自动覆盖和静默加后缀。
- R34：平台可用性以解析后的用户级配置目录为准，不要求检测 CLI；目录缺失显示“尚未初始化”，仅在用户选择该目标并确认提交后创建。

### F. 交付、信息架构、语言与刷新

- R35：交付为本地开发原型，支持 Tauri 开发模式和当前 macOS 的本机构建；签名、公证、自动更新、崩溃上报和发布流水线不属于 MVP。
- R36：主导航至少包含“模板 / 已安装 / 设置”，默认进入模板库；定制、平台选择、预览和安装是嵌入式分步向导。
- R37：“已安装”按逻辑 Agent 名称跨平台聚合，一张卡片展示 Claude/Codex/Cursor 原生覆盖，展开查看逐平台路径、格式和内容。
- R38：跨平台内容差异是正常变体；只有同平台重复定义、重复目标路径或无法确定生效项时标记冲突。
- R39：共享核心包含可编辑且可逐章恢复的角色目标、适用场景、禁用场景、输入要求、执行步骤、输出契约、约束、停止条件和失败处理。
- R40：结构化章节执行必填、空内容和基本一致性校验；应用不能退化为一个无契约的大文本框。
- R41：界面、模板元数据、帮助说明和默认共享指令使用简体中文；代码、命令、路径、日志和原生字段保持原始语言。
- R42：模板提供响应语言设置，默认跟随用户输入；可显式选择简体中文或英文，三平台渲染结果表达语义一致的语言约束。
- R43：应用监听三个已解析用户目录，文件变化后防抖重扫并刷新库存；目录缺失、监听失败或事件丢失时保留手动刷新兜底。

## Acceptance Criteria

| ID | Requirement Mapping | Testable Acceptance |
| --- | --- | --- |
| AC1 | R0-R2, R26, R36 | 用户可从默认模板页围绕一个 Subagent 完成选择、逐章定制、目标选择、预览和安装，不需要从空白 YAML/TOML 开始。 |
| AC2 | R3-R4, R39-R42 | 用户无需编辑源码即可配置所有 MVP 支持字段；缺失必填章节、空内容或不一致契约在 preview 前给出可定位错误；响应语言在三平台输出中语义一致。 |
| AC3 | R5-R6, R8-R9, R25 | 同一模板为三个目标生成各自原生格式；能力差异可追踪，任何 unsupported 或 lossy 语义都不会静默丢失，新平台没有 Claude 默认回退。 |
| AC4 | R10-R11, R31-R32, R34 | 应用只访问三个解析后的用户级根目录；确认页显示绝对路径和全局影响；未选择目标时不创建缺失目录，明确提交后可创建并继续同一事务。 |
| AC5 | R7, R12-R13 | 三平台均通过预检后才开始写入；注入任一写入/验证失败后，其他目标恢复到安装前状态，或明确报告需要人工恢复的具体平台与备份位置。 |
| AC6 | R14-R17 | 扫描现有 Agent 不修改磁盘；只有显式导入后才能编辑；外部修改、未知字段或不安全 round-trip 在覆盖前被识别并阻止。 |
| AC7 | R18-R19, R22-R23 | 断网、无模型凭据、无 Agent CLI 时仍可浏览、定制、预览、校验、安装内置模板并保存个人模板；重复输入产生稳定结果。 |
| AC8 | R20-R21, R28 | 6 个内置模板均具备完整工作契约和相对 built-in Agent 的增量价值，并能生成通过三平台适配器校验的原生文件。 |
| AC9 | R24-R25 | 发布矩阵证明 Claude、Codex、Cursor 都能独立完成发现、模板定制、预览、安装、导入、冲突、备份和回滚；任何平台缺一步都阻止 MVP 完成。 |
| AC10 | R27-R29 | 安装完成后，个人开发者可直接看到逐平台调用说明、description/自动委派建议和验证任务，并据此判断 Agent 是否符合模板契约。 |
| AC11 | R30-R31 | 删除、移动或新增原生文件后，刷新即可反映真实安装状态；库存不依赖数据库中的启停、安装历史或模板版本状态。 |
| AC12 | R33 | 同名冲突在任何写入前阻止；改名会重新执行三平台 preview，替换必须先备份，禁止自动覆盖或自动后缀。 |
| AC13 | R35 | 开发者能在目标 macOS 环境运行 Tauri 开发应用并完成本机构建，核心流程不依赖签名、公证、更新或发布服务。 |
| AC14 | R37-R38 | 同一逻辑名称的三个原生文件从一个聚合入口查看；正常平台差异不报冲突，同平台重复/优先级不明会明确标记。 |
| AC15 | R43 | 外部新增、修改、rename-save 或删除文件后，库存经防抖重扫更新；watcher 不可用时手动刷新得到相同结果。 |
| AC16 | R1, R24, R41 | 中文用户无需查询外部语法文档即可完成三个平台的核心旅程，代码标识符、命令、路径和原生字段保持原文。 |
| AC17 | 全部 | `prd.md`、`design.md`、`implement.md` 与架构图通过用户审阅后才可进入实现；未经批准不运行 `task.py start`。 |

## Out of Scope

- 多 Subagent Workflow Pack、自动串并行编排、自建 Agent 执行引擎。
- 项目级 Agent 的扫描、创建、安装和库存。
- Agent 启用、停用、卸载、恢复、版本升级、安装历史或模板更新状态机。
- 在线模板仓库、社区市场、任意 GitHub 模板安装、后台模板热更新。
- LLM API 或本机 Claude/Codex/Cursor CLI 驱动的配置生成。
- 团队模板审批、组织级策略、集中审计、企业分发和云同步。
- 启动、托管、监控或编排 Claude Code、Codex、Cursor 运行时会话。
- Windows、Linux 正式支持。
- 代码签名、Apple 公证、自动更新、崩溃上报、App Store 或正式发布流水线。
- 内置 YAML/TOML 源码双向编辑器。

## Technical Validation Items

这些验证项不改变已确认的产品范围，但会阻塞对应实现阶段：

- V1：从三平台官方资料锁定用户目录环境变量；无官方证据时不实现该环境变量分支。
- V2：用真实 Cursor 版本验证其对 Claude/Codex 用户目录的兼容边界，尤其是 Codex TOML。
- V3：验证复杂 YAML/TOML、未知字段、Unicode、换行和 Prompt body 的安全 round-trip；不能证明无损时只读阻止。
- V4：验证 macOS watcher 对目录缺失、后创建、rename-save、事件溢出和权限变化的行为。
- V5：验证同目录临时文件、权限、`fsync`、atomic rename、逐阶段 failpoint 和 rollback。
- V6：验证 Tauri 开发/本机构建中的 resources、Application Support、SQLite migration 和目录选择权限。

## Planning Gate

- `design.md` 记录 architecture、canonical model、capability matrix、路径、导入、WritePlan、事务、watcher、IPC、错误和 UI 状态机。
- `implement.md` 记录 tracer bullet 顺序、验证命令、三轮质量门、高风险文件和回滚点。
- 架构图先以无嵌入 XML 的 `architecture.png` 供审阅；用户批准后才生成最终 `architecture.drawio.png`。
- 用户明确批准前，任务保持 `planning`，不修改产品源代码。

