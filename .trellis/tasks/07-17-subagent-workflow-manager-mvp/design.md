# macOS Subagent 工作流管理器 MVP 技术设计

## 1. 设计状态与范围

- 当前状态：Planning，仅用于方案审阅，不授权实现。
- 目标运行环境：macOS，本地 Tauri 2 桌面应用。
- 前端：React + TypeScript strict mode。
- 后端：Rust；所有原生文件解析、校验、路径解析、备份、写入、监听和 SQLite 访问均在 Rust 内完成。
- 首批平台：Claude Code、Codex、Cursor。
- MVP 只管理用户级全局 Agent，不扫描、创建或安装项目级 Agent。

本设计的核心问题不是统一三种文件语法，而是在不丢失平台能力的前提下，为“模板定制 → 原生预览 → 多平台安全安装 → 磁盘库存刷新”提供一个统一工作流。

## 2. 不可破坏的设计不变量

1. `~/.claude/agents/`、`~/.codex/agents/`、`~/.cursor/agents/` 中的原生文件是安装状态的唯一事实来源。
2. SQLite、TanStack Query 和 React 状态都只是派生视图，不能覆盖较新的磁盘状态。
3. 前端不解析或生成 YAML、TOML、Markdown，也不能向后端提交任意目标路径或待写入字节。
4. 所有写入必须来自后端生成且用户审阅过的 `WritePlan`；提交阶段不能静默重新生成另一份内容。
5. 多平台安装是可补偿事务：虽然不同目录之间无法获得真正的文件系统原子提交，但最终必须是“全部成功”或“已验证回滚”；任何无法回滚的情况都必须进入人工恢复状态。
6. 未知原生字段必须保留；若适配器无法证明安全 round-trip，则阻止写回。
7. 平台能力差异必须显式建模，不能用一组大量可选字段伪装成统一格式。
8. 相同模板版本、输入和平台契约版本必须生成确定性输出。

## 3. 架构与边界

架构源图：[architecture.drawio](./architecture.drawio)

审阅草图：[architecture.png](./architecture.png)

```text
React feature workflow
  -> typed IPC client + Zod
  -> thin Tauri commands
  -> AgentApplicationService
  -> canonical domain + ports
  -> platform adapters / filesystem / SQLite
  -> user-owned native Agent files
```

| 层 | 责任 | 禁止事项 |
| --- | --- | --- |
| React features | 模板浏览、结构化编辑、逐平台高级配置、预览/diff、确认、库存展示 | 解析或渲染原生文件，直接调用 `invoke`，自行判断写入成功 |
| `lib/ipc` + contracts | 唯一 Tauri 调用入口；请求、响应、错误均经 Zod 校验 | 在多个 Hook 或组件中复制 DTO |
| Tauri commands | DTO 转换、调用一个 application service、返回稳定错误包络 | 平台分支、SQL、文件读写、业务编排 |
| Application services | discover、import、preview、commit、refresh、模板用例编排 | 依据扩展名手写平台逻辑 |
| Canonical domain | Agent、模板、能力矩阵、WritePlan、事务结果和端口 Trait | 依赖 Tauri、SQLite 或具体解析库 |
| Platform adapters | 平台路径策略、发现、解析、校验、渲染、未知字段保留、调用说明 | 默认回退到 Claude 语义 |
| Infrastructure | 安全路径、备份、临时文件、原子替换、文件监听、SQLite、macOS 集成 | 把完整 Prompt、配置字节或密钥写入日志/SQLite |

建议目录遵循现有 `.trellis/spec/`：

```text
src-tauri/src/
├── commands/
├── services/
├── domain/
│   ├── agents/
│   ├── templates/
│   └── ports/
├── adapters/agents/{claude,codex,cursor,registry}.rs
├── infrastructure/{filesystem,database,logging,macos}/
├── dto/
└── error.rs

src/
├── app/
├── features/{templates,agents,settings}/
├── components/ui/
├── lib/{ipc,query,validation,formatting}/
├── contracts/
├── locales/
└── test/
```

## 4. Canonical Domain Model

### 4.1 可编辑草稿

```rust
struct AgentDraft {
    logical_name: AgentLogicalName,
    description: NonEmptyText,
    shared: SharedInstructionContract,
    response_language: ResponseLanguage,
    usage: UsageContract,
    platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
    provenance: DraftProvenance,
}

struct SharedInstructionContract {
    role_goal: NonEmptyMarkdown,
    when_to_use: NonEmptyList<MarkdownBlock>,
    when_not_to_use: NonEmptyList<MarkdownBlock>,
    input_requirements: NonEmptyList<MarkdownBlock>,
    execution_steps: NonEmptyList<MarkdownBlock>,
    output_contract: NonEmptyMarkdown,
    constraints: NonEmptyList<MarkdownBlock>,
    stop_conditions: NonEmptyList<MarkdownBlock>,
    failure_handling: NonEmptyMarkdown,
}

struct UsageContract {
    explicit_invocation_examples: Vec<NonEmptyText>,
    auto_delegation_guidance: NonEmptyText,
    verification_task: NonEmptyText,
}
```

`AgentDraft` 是产品语义，不携带原生文件路径、完整原始字节或 SQLite 行。名称、文件名和目标路径由目标适配器分别校验和派生。

### 4.2 平台扩展

```rust
enum PlatformOverride {
    Claude(ClaudeOverride),
    Codex(CodexOverride),
    Cursor(CursorOverride),
}

enum NativePreservationEnvelope {
    Claude(ClaudePreservation),
    Codex(CodexPreservation),
    Cursor(CursorPreservation),
}
```

`PlatformOverride` 只包含应用明确支持编辑的字段。`NativePreservationEnvelope` 由后端持有，用于保存未知字段、原始 Prompt body、字段顺序或其他 round-trip 信息；前端只能看到只读摘要，不能重新解释未知数据。

导入文件时，草稿同时引用：

- `source_id`
- `source_revision`（内容哈希 + 必要文件元数据）
- `adapter_contract_version`
- 文件化的原始快照标识
- 对应平台的 `NativePreservationEnvelope`

### 4.3 模板包

```rust
struct TemplatePackage {
    manifest: TemplateManifest,
    shared_defaults: SharedInstructionContract,
    usage_defaults: UsageContract,
    platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
}
```

模板 manifest 至少包含稳定 ID、语义版本、作者/来源、支持平台、适用场景、风险说明、契约版本和内容哈希。内置模板只读；个人模板可编辑，但两者使用同一校验器和渲染管线。

## 5. 平台能力矩阵

状态说明：

- `编辑`：MVP 表单可修改并由适配器校验。
- `保留`：导入时可识别并无损保留，但首版不提供结构化编辑。
- `不适用`：平台无等价原生字段，不能自动映射。

| 语义/字段 | Claude Code | Codex | Cursor | MVP 处理 |
| --- | --- | --- | --- | --- |
| 名称 | `name`，必填 | `name`，必填 | `name`，可由文件名派生 | 共享语义；逐平台规则校验 |
| 委派描述 | `description`，必填 | `description`，必填 | `description`，可选 | 产品要求始终填写，提升自动委派质量 |
| 核心指令 | Markdown body | `developer_instructions` | Markdown body | 由共享章节确定性渲染 |
| 模型 | `model` | `model` | `model` | 平台覆盖，禁止跨平台复制模型 ID |
| 推理强度 | `effort` | `model_reasoning_effort` | 编码在 `model` 参数中 | 分别编辑；不建立隐式一一映射 |
| 工具允许/禁止 | `tools`、`disallowedTools` | 无同形专用字段 | 无同形专用字段 | Claude 编辑；其他平台依靠 Prompt 约束或显示能力差异 |
| 权限/沙箱 | `permissionMode` | `sandbox_mode` | `readonly` | 三者语义不同，分别编辑并显示解释 |
| 最大轮次 | `maxTurns` | 不适用 | 不适用 | Claude 编辑；其他平台显示无原生对应 |
| Skills | `skills` | `skills.config` | 无 Agent 专属字段 | Claude 编辑；Codex 首版保留；Cursor 不适用 |
| MCP | `mcpServers` | `mcp_servers` | 无 Agent 专属字段 | 已有配置导入时保留；首版不编辑内联密钥配置 |
| Hooks | `hooks` | 无同形专用字段 | 无 Agent 专属字段 | Claude 保留；不跨平台映射 |
| Memory | `memory` | 无同形专用字段 | 无同形专用字段 | Claude 编辑；其他平台不适用 |
| 后台执行 | `background` | 无静态 Agent 等价字段 | `is_background` | Claude/Cursor 分别编辑，不自动互转 |
| 隔离 | `isolation: worktree` | `sandbox_mode` 不是等价物 | `readonly` 不是等价物 | Claude 编辑；其他平台显示差异 |
| 昵称 | 无 | `nickname_candidates` | 无 | Codex 编辑 |
| 显示颜色/初始 Prompt | `color`、`initialPrompt` | 无 | 无 | 导入保留；首版不作为核心配置 |

能力映射结果使用显式枚举：

```rust
enum CapabilityDisposition {
    Exact,
    PromptOnly,
    NativeOnly,
    Unsupported,
    PreservedReadOnly,
    BlockedLossy,
}
```

模板或导入内容出现 `BlockedLossy` 时不能生成可提交的 WritePlan。`PromptOnly` 必须在预览页解释“仅靠指令约束，并非平台级权限强制”。

官方契约基线：

- Claude Code：https://code.claude.com/docs/en/sub-agents
- Codex：https://learn.chatgpt.com/docs/agent-configuration/subagents
- Cursor：https://cursor.com/docs/subagents.md

## 6. 适配器契约与版本感知

```rust
trait AgentFormatAdapter {
    fn platform(&self) -> AgentPlatform;
    fn contract_version(&self) -> AdapterContractVersion;
    fn path_policy(&self) -> PlatformPathPolicy;
    fn discover(&self, root: &ValidatedRoot) -> Result<Vec<NativeSource>, AppError>;
    fn parse(&self, source: &NativeSourceBytes) -> Result<ParsedAgent, AppError>;
    fn validate_draft(&self, draft: &AgentDraft) -> ValidationReport;
    fn render(&self, input: RenderInput) -> Result<RenderedNativeFile, AppError>;
    fn verify_round_trip(&self, rendered: &[u8]) -> Result<VerifiedAgent, AppError>;
    fn capabilities(&self) -> CapabilityMatrix;
}
```

规则：

1. Registry 对 `AgentPlatform` 做 exhaustive match；新增平台不能落入默认分支。
2. 每个适配器声明契约版本和支持字段集；模板 manifest 记录创建时的平台契约版本。
3. 官方格式变化后，旧模板仍可读取，但渲染前必须执行迁移或提示不兼容。
4. 新建文件使用确定性 serializer；导入文件走 preservation-aware renderer。
5. YAML/TOML 中出现适配器无法安全 round-trip 的语法特性时，允许只读查看和外部打开，但阻止应用内写回。

## 7. 配置目录解析

每个平台通过 `PlatformPathPolicy` 集中解析用户级 Agent 根目录：

```text
应用中显式保存的用户覆盖
  -> 该平台官方文档明确支持的环境变量（若存在）
  -> 平台默认用户目录
```

默认目标：

- Claude Code：`~/.claude/agents/`
- Codex：`~/.codex/agents/`
- Cursor：`~/.cursor/agents/`

约束：

- 不进行全磁盘搜索，不以 CLI 是否存在作为可用性门槛。
- 设置页展示来源、最终绝对路径、是否存在、可读写状态和“恢复默认”。
- 目录选择由后端/受控原生目录选择器完成；业务命令不接受任意路径。
- 目录不存在时返回 `missing`，扫描不报程序错误；仅在用户选择该平台并确认提交后创建。
- 对覆盖路径执行规范化、父目录检查和 symlink escape 检查。
- “官方环境变量”名单必须在实现前由官方文档锁定；没有官方证据的平台跳过该层，不能根据 CC Switch 或社区 README 猜测。

## 8. 模板与 SQLite 边界

### 文件系统

- 内置模板：随应用发布的只读 resources。
- 个人模板：`Application Support/<app>/templates/<template_id>/` 下的 manifest 与正文文件。
- 导入原始快照：`Application Support/<app>/managed-sources/<source_id>/`，权限限制为当前用户。
- 替换备份：`Application Support/<app>/backups/<operation_id>/`，包含 manifest、原始字节和校验哈希。

### SQLite

SQLite 只存：

- 模板索引、版本、来源、标签、兼容性和内容哈希。
- 每个平台的目录设置与非敏感 UI 偏好。
- 已导入 source 的路径标识、平台、revision、快照文件标识。
- 备份 manifest、事务结果和派生库存索引。

SQLite 不存：

- 完整 Prompt body。
- 完整 YAML/TOML/Markdown 文件。
- API key、token、环境变量展开值或 MCP secret。

文件操作成功后才更新 SQLite；数据库提交失败不能让 UI 宣称原生写入失败，但必须把“文件已提交、索引待重建”作为可恢复状态，并通过下一次扫描重建派生索引。

## 9. Discovery、Import 与库存投影

### 9.1 只读 Discovery

`scan_installed_agents` 仅扫描三个已解析的用户级根目录。每个平台的递归、扩展名和名称优先级由对应适配器决定。

```rust
struct DiscoveredAgent {
    source_id: AgentSourceId,
    native_platform: AgentPlatform,
    logical_name: AgentLogicalName,
    identity_basis: IdentityBasis,
    revision: SourceRevision,
    path_label: DisplayPath,
    parse_status: ParseStatus,
    ownership: OwnershipStatus, // External or Imported
}
```

扫描不会创建目录、写数据库所有权、生成备份或改写文件。解析失败的文件仍作为库存项显示，附稳定错误码和外部打开入口。

### 9.2 显式 Import

`import_agent_for_editing(source_id)`：

1. 在受控根目录内重新定位并读取文件。
2. 校验 revision 与安全路径。
3. 由平台适配器解析 canonical 内容与 preservation envelope。
4. 把原始字节写入受限权限的文件化快照。
5. SQLite 只记录快照标识、来源、revision、契约版本和哈希。
6. 返回结构化草稿、只读未知字段摘要和可编辑字段。

### 9.3 跨平台聚合

库存按适配器产出的规范化 `logical_name` 精确聚合。每个聚合项保留逐平台 source 列表：

- 同名的 Claude/Codex/Cursor 文件是正常平台变体。
- 同一平台出现多个有效 source、重复目标路径或无法确定生效项时标记冲突。
- Cursor 对 Claude/Codex 目录的兼容读取单独表示为 `compatibility_exposure`，不能伪装成 Cursor 原生安装，也不能触发重复写入。
- 在真实 Cursor 运行时测试完成前，不根据文档中的目录兼容声明推断 Codex TOML 一定可执行。

## 10. PreviewPlan 与 WritePlan Token

### 10.1 Preview 请求

```rust
struct PreviewAgentInstallRequest {
    draft: AgentDraftDto,
    targets: NonEmptyVec<TargetSelectionDto>,
}

struct TargetSelectionDto {
    platform: AgentPlatform,
    conflict_action: ConflictAction, // Fail or ReplaceAfterBackup
}
```

改名不是提交阶段的冲突动作；用户修改 `logical_name` 后必须重新生成整个 preview。

### 10.2 后端生成 WritePlan

每个目标包含：

- 解析后的固定 root 与目标路径。
- 目录创建计划。
- adapter contract version。
- 当前文件是否存在、当前 revision 与冲突类型。
- 确定性渲染后的原生字节哈希和完整只读预览。
- 结构化 diff。
- capability/portability issues。
- 是否创建备份。
- 回滚动作。

只有所有目标通过预检时，后端才创建 server-side WritePlan，并返回单次使用的 opaque token。Token 初始 TTL 为 10 分钟；它只引用后端内存中的计划，不包含路径、Prompt 或原生内容。应用重启、TTL 到期、目录设置变化或源 revision 变化都会使 token 失效。

提交请求只包含 `write_plan_token`。任何用户决策变化都必须重新 preview，确保“用户看到的内容”与“后端提交的内容”一致。

## 11. 多文件事务、备份与回滚

提交采用可补偿事务：

```text
验证 token 且标记为 executing
-> 按稳定顺序获取目标锁
-> 重新解析根目录与安全路径
-> 重新读取每个目标并核对 revision
-> 对全部目标执行预检（此时仍无磁盘变更）
-> 创建本次事务所需目录并记录补偿动作
-> 为所有待替换文件创建并 fsync 备份
-> 在各目标同目录写临时文件、设置权限、flush/fsync
-> 按稳定顺序 atomic rename
-> fsync 各父目录
-> 逐目标重读、解析、校验和比对哈希
-> 全部成功后提交派生 metadata
```

任一步失败：

1. 停止后续写入。
2. 按逆序恢复原文件或删除本次新建文件。
3. 删除本次创建且仍为空的目录。
4. 重读所有目标验证最终状态。
5. 返回每个平台的 `unchanged`、`restored`、`removed_created_file` 或 `manual_recovery_required`。

原文件备份和 manifest 在成功替换后仍按固定上限保留，初始策略为最近 20 次替换事务；MVP 不提供备份浏览或手动恢复 UI。若 rollback 不完整，相关备份不得被自动清理，并向用户提供“显示恢复目录”操作。

所有临时文件必须位于目标同目录，避免跨卷 rename 失去原子性。严禁原地 truncate。

## 12. 文件监听与刷新

- Rust 在应用启动后监听当前存在的三个解析目录。
- 事件按平台防抖；事件本身不直接修改库存，只触发对应根目录的全量重扫。
- 目录缺失时保持 `missing`，提交创建目录后动态注册 watcher。
- watcher 失败、事件溢出或未知事件触发 `needs_full_refresh`，不返回空库存冒充成功。
- 后端通过 Tauri event 只发送 `{ platform, inventoryRevision }`，不发送完整文件内容。
- TanStack Query 收到 revision 后失效对应库存 query；手动刷新调用同一后端扫描路径。
- 编辑中的导入草稿不会被后台刷新覆盖；若 source revision 变化，状态机进入 conflict。

## 13. IPC 合约

建议命令：

| Command | 输入 | 输出 |
| --- | --- | --- |
| `get_platform_directories` | 无 | 三个平台的解析路径、来源和状态 |
| `choose_platform_directory` | `platform` | 后端选择并验证后的设置 |
| `reset_platform_directory` | `platform` | 恢复默认后的解析结果 |
| `list_templates` | 筛选条件 | `TemplateSummaryDto[]` |
| `get_template` | `templateId` | 完整结构化模板 |
| `save_personal_template` | 经 Zod 校验的模板草稿 | 保存后的模板摘要 |
| `scan_installed_agents` | 可选平台集合 | 聚合库存 + revision |
| `get_agent_native_content` | `sourceId` | 只读内容、格式和安全路径标签 |
| `import_agent_for_editing` | `sourceId`、expected revision | 可编辑草稿 + preservation 摘要 |
| `preview_agent_install` | 草稿 + 非空目标集合 | `PreviewPlanDto` + token |
| `commit_agent_install` | token | 批次与逐平台最终状态 |
| `refresh_inventory` | 可选平台集合 | 与 watcher 相同的扫描结果 |
| `reveal_agent_source` | `sourceId` | 成功/业务错误，不接受路径 |

所有响应和错误先作为 `unknown` 进入前端，再由 `src/contracts/` 的 Zod schema 校验。Rust DTO 与 TypeScript contract 优先自动生成；若首版手写，必须有双向序列化 fixture test。

## 14. 错误、日志与隐私

稳定错误至少包括：

- `agent.validation_failed`
- `agent.unsupported_platform`
- `agent.unsupported_capability`
- `agent.lossy_round_trip_blocked`
- `agent.source_changed`
- `agent.name_conflict`
- `agent.path_missing`
- `agent.permission_denied`
- `agent.unsafe_path`
- `agent.preview_expired`
- `agent.preview_invalid`
- `agent.backup_failed`
- `agent.atomic_write_failed`
- `agent.verification_failed`
- `agent.rollback_failed`
- `inventory.watch_failed`
- `database.migration_failed`

错误包络包含 `code`、安全 fallback message、`operationId`、字段错误、逐平台状态和恢复动作。正常设置/确认界面可以向用户显示其主动配置的完整绝对路径；日志和错误诊断只能记录安全 path label 或 hash。

日志绝不包含完整 Agent 文件、Prompt、frontmatter/TOML、MCP secret、环境变量值或用户名路径。每次 preview/commit/scan 使用 `operation_id` span，并分别记录 write、verify、rollback 结果。

## 15. 前端状态机

安装向导使用一个 exhaustive reducer：

```text
templateSelected
-> editing
-> previewing
-> reviewing
-> committing
-> succeeded

reviewing/committing
-> conflict | recoverableError | manualRecoveryRequired
```

关键规则：

- `reviewing` 状态必须持有后端 `PreviewPlanDto` 和 token。
- 任意草稿、目标平台、目录设置或冲突动作改变都会丢弃旧 token，回到 `editing`。
- `commit` 不能自动重试验证、权限、冲突或 unsafe-path 错误。
- watcher 更新不会清空草稿；导入 source 改变时展示 diff/刷新选择。
- 关闭局部向导时保留未提交草稿，直到用户明确丢弃或应用退出。
- 成功页按平台显示最终文件、调用方式、自动委派描述建议和验证任务。

主导航：

- 模板：默认页，模板浏览和局部安装向导。
- 已安装：按逻辑名称聚合，只读原生内容与显式导入入口。
- 设置：三平台目录解析、浏览、恢复默认和状态。

## 16. 关键取舍

### 共享语义核心，而不是通用文件格式

共享的是“角色和工作契约”，不是 YAML/TOML 字段。这样可以复用模板价值，同时避免最低公分母设计。

### Server-side WritePlan，而不是签名后的自包含 token

服务端内存计划避免把路径、Prompt 或原生字节放入 token，也能强制单次提交和 TTL。代价是应用重启后必须重新 preview，这符合安全预期。

### 可补偿事务，而不声称跨目录原子事务

macOS 文件系统无法为三个独立目录提供统一事务。预检、备份、同目录 rename、重读验证和逆序恢复是可证明的最小机制。

### 文件化模板与快照，而不是把所有内容放进 SQLite

文件更适合版本、备份和人工审查；SQLite 只负责索引和关联，避免形成第二份不透明事实来源。

### 当前不拆 Trellis 子任务

仓库尚无产品代码，首个可验收目标必须是一个贯通 React、IPC、Rust、真实文件与错误处理的 tracer bullet。过早按“前端/后端/适配器”拆任务会制造空壳交付和跨层契约漂移。先在同一任务完成 Claude 纵向闭环并冻结合约；若后续执行体量超过单一任务可审查范围，再按“Codex 对等”“Cursor 对等”“事务与库存强化”拆成依赖明确的子任务。

## 17. 实现前必须完成的技术验证

这些项目不阻塞 PRD 审阅，但会阻塞对应代码阶段：

1. 从各平台官方资料锁定用户目录环境变量；无法获得官方证据时只实现“用户覆盖 → 默认目录”。
2. 在真实 Cursor 版本中验证其对 `~/.codex/agents/*.toml` 的兼容解析，区分“扫描目录”与“正确理解 TOML”。
3. 用真实复杂 fixture 验证 YAML/TOML 未知字段、数组、嵌套表、Unicode、换行和 Prompt body 的 round-trip；不安全语法必须进入只读阻止状态。
4. 验证 macOS 上 watcher 对目录缺失、后创建、rename-save 和事件丢失的行为。
5. 验证目标同目录临时文件、权限继承、`fsync`、atomic rename 和 rollback failpoint。
6. 验证 Tauri 开发模式和本机构建中的 Application Support、资源模板和目录选择权限。

