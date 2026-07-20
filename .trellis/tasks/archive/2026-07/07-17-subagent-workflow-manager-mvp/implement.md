# macOS Subagent 工作流管理器 MVP 实施计划

## 1. 执行门禁

- 当前任务仍为 `planning`。
- 用户批准 `prd.md`、`design.md`、`implement.md` 和架构图之前，不运行 `task.py start`，不创建产品脚手架，不修改产品源代码。
- Codex 采用 inline 模式；进入 Phase 2 后由当前会话实现，开始编码前必须加载 `trellis-before-dev`，完成后运行 `trellis-check`。
- 自动化测试不得写入真实的 `~/.claude/agents/`、`~/.codex/agents/`、`~/.cursor/agents/`；全部通过产品真实的目录覆盖能力指向临时目录。

## 2. 实施策略

采用 tracer bullet 顺序，不按“前端团队 / 后端团队 / 数据库团队”横向铺空壳：

1. 先贯通一个真实设置流程，证明 React → typed IPC → Rust → macOS 文件系统边界可运行。
2. 再以 Claude Code 完成第一条完整业务闭环：真实模板 → 结构化编辑 → 原生预览 → 安全安装 → 扫描确认。
3. 冻结 canonical/IPC/transaction 合约后接入 Codex 和 Cursor，达到同一核心旅程的功能对等。
4. 最后补齐导入、未知字段保留、watcher、全部模板、可访问性和故障注入。

当前不创建 Trellis 子任务。原因是第一个可审查交付必须贯通所有层，过早按技术层拆分会产生无法独立验收的空壳。若 Claude tracer bullet 完成后剩余工作明显超出单任务审查容量，再创建以下候选子任务，并在各自 artifact 中写明依赖：

- Codex 功能对等。
- Cursor 功能对等与兼容性验证。
- 多平台事务、导入和库存强化。
- 六套模板与 UX 验收。

## 3. 分阶段 TODO

### Phase A：脚手架与“真实路径设置”纵向切片

- [ ] 在仓库根目录创建 Tauri 2 + React + Vite + TypeScript strict 项目，使用 `pnpm`。
- [ ] 建立 `src-tauri/src/{commands,services,domain,adapters,infrastructure,dto}` 和前端 feature-first 目录。
- [ ] 配置 ESLint、格式化、Vitest、Testing Library、Rustfmt、Clippy warnings-as-errors。
- [ ] 建立 TanStack Query、全局 error boundary、简体中文 locale、light/dark tokens 和基础路由。
- [ ] 实现第一个真实用例 `get_platform_directories`：Rust 解析三平台默认目录，typed IPC 返回，Zod 校验后在“设置”页展示。
- [ ] 实现 `choose_platform_directory` 与 `reset_platform_directory`；目录选择和验证由受控后端接口完成。
- [ ] 表达 `ready`、`missing`、`permissionDenied`、`invalidOverride` 等真实状态，不生成占位数据。
- [ ] 为目录缺失、无权限、unsafe symlink 和用户覆盖建立临时目录集成测试。

退出条件：开发应用能启动，设置页通过真实 IPC 展示三平台最终路径；前后端类型、错误和路径状态都有测试。

### Phase B：Canonical Model、模板包与持久化边界

- [ ] 实现 `AgentPlatform`、`AgentDraft`、`SharedInstructionContract`、`UsageContract`、`PlatformOverride`、`CapabilityDisposition`。
- [ ] 对 non-empty 文本、列表、逻辑名称、响应语言和平台目标建立强类型校验。
- [ ] 定义 `AgentFormatAdapter`、`TemplateRepository`、`AgentFileStore`、`WritePlanStore`、时钟/ID 等端口 Trait。
- [ ] 建立 exhaustive `AdapterRegistry`，不得提供 Claude fallback。
- [ ] 设计并实现文件化模板 manifest/body schema；首先加入可发布质量的“需求澄清”模板，而不是占位模板。
- [ ] 建立个人模板目录和 SQLite 初始 migration；SQLite 仅存索引、设置、来源、hash 和 manifest。
- [ ] 实现 `list_templates`、`get_template`、`save_personal_template` typed IPC。
- [ ] 增加相同输入生成稳定 canonical draft 的确定性测试。

退出条件：模板库展示真实内置模板，能够逐章编辑并保存个人模板；模板正文不以 SQLite 为唯一副本。

### Phase C：Claude Code 端到端 tracer bullet

- [ ] 根据官方 fixture 实现 Claude `Markdown + YAML frontmatter` 发现、解析、校验和确定性渲染。
- [ ] 支持 `name`、`description`、Markdown body，以及 MVP capability matrix 中的 Claude 可编辑字段。
- [ ] 对 `mcpServers`、`hooks`、未知字段和复杂 YAML 建立 preservation/read-only 策略；无法安全 round-trip 时阻止写回。
- [ ] 实现结构化编辑器、Claude 高级字段、字段级错误和只读原生预览。
- [ ] 实现 server-side `WritePlanStore`、opaque single-use token、TTL 和 token invalidation。
- [ ] 实现单目标版本的全量预检、冲突阻止、备份、同目录临时文件、flush/fsync、atomic rename、重读验证和 rollback。
- [ ] 用临时用户目录完成：选择模板 → 编辑 → preview/diff → 安装 → 再扫描确认。
- [ ] 验证同名默认阻止、改名后重新 preview、明确替换后备份。
- [ ] 为每个写入阶段添加 failpoint，在真实临时文件系统上验证原文件完整性。

退出条件：Claude 的完整用户旅程可运行，不存在从 UI 直接写文件的旁路；失败注入不会留下未说明的半完成状态。

### Phase D：Codex 与 Cursor 功能对等 + 多目标事务

- [ ] 根据官方文档和真实 fixture 实现 Codex standalone TOML adapter。
- [ ] 支持必填 `name`、`description`、`developer_instructions`，以及 `nickname_candidates`、`model`、`model_reasoning_effort`、`sandbox_mode` 等 MVP 可编辑字段。
- [ ] 对 `mcp_servers`、`skills.config` 和未知 config keys 实现保留或阻止策略。
- [ ] 根据官方文档和真实 fixture 实现 Cursor Markdown/YAML adapter。
- [ ] 支持 Cursor 的 `name`/文件名派生、`description`、`model`、`readonly`、`is_background`。
- [ ] 在真实 Cursor 版本中验证 `.claude/agents/` 与 `.codex/agents/` 兼容声明，尤其验证 Codex TOML 是否真正可解析。
- [ ] 扩展 preview 为非空多目标集合；一次返回三平台原生内容、diff、路径、能力差异和冲突。
- [ ] 扩展事务协调器：全部目标预检后才创建目录/备份/临时文件，写入失败按逆序恢复全部已变更目标。
- [ ] 为三平台分别测试 create、replace、invalid、source-changed、write failure、verification failure 和 rollback failure。

退出条件：Claude、Codex、Cursor 均能独立完成同一核心旅程；任一目标失败时多平台批次达到已验证回滚或明确人工恢复状态。

### Phase E：Discovery、显式 Import 与未知字段保留

- [ ] 实现只读 `scan_installed_agents`，只访问三个已解析用户级根目录。
- [ ] 每个 adapter 独立定义递归、扩展名、名称、优先级和 parse-status 规则。
- [ ] 对无效文件返回库存项和稳定错误，不把解析失败伪装成空列表。
- [ ] 实现 `get_agent_native_content(sourceId)` 和 `reveal_agent_source(sourceId)`，不接受任意路径。
- [ ] 实现显式 `import_agent_for_editing`：重读 revision、保存受限权限原始快照、生成 preservation envelope、更新 SQLite metadata。
- [ ] 写回前比较 source revision；外部编辑后进入 conflict，不覆盖用户的新内容。
- [ ] 对 YAML/TOML 未知标量、数组、嵌套结构、Unicode、换行和 Prompt body 建立 round-trip contract tests。
- [ ] 对 anchor/tag/格式特性等无法证明安全的输入返回 `lossy_round_trip_blocked`。

退出条件：扫描绝不改盘；只有显式导入后才能编辑；未知字段不会被静默删除。

### Phase F：库存聚合、文件监听与刷新

- [ ] 实现 `InventoryProjection`，按规范化逻辑名称跨平台聚合。
- [ ] 区分正常平台变体、同平台重复定义、重复目标路径、解析优先级不明确。
- [ ] 把 Cursor compatibility exposure 作为次级信息，不冒充原生 Cursor 安装。
- [ ] 使用 Rust watcher 监听现存目录；按平台防抖后执行全量重扫。
- [ ] 提交创建首个 Agent 目录后动态注册 watcher。
- [ ] 处理 rename-save、事件溢出、目录删除、权限变化和 watcher 重建。
- [ ] 通过 Tauri event 只发送 platform + inventory revision，前端按 query key 失效。
- [ ] 手动刷新必须调用与 watcher 相同的扫描路径。
- [ ] 编辑中的草稿遇到外部变化时保留草稿并进入 conflict banner。

退出条件：外部新增、修改、移动、删除文件后库存可靠刷新；watcher 不可用时手动刷新结果一致。

### Phase G：六套模板、工作流指导与个人模板

- [ ] 完成 6 个发布质量内置模板：需求澄清、架构梳理、第三方文档研究、根因调试、代码审查、交付验证。
- [ ] 每个模板补齐适用/禁用场景、输入、步骤、输出、约束、停止、失败处理和权限风险。
- [ ] 为每个模板编写三平台覆盖和 capability issue 预期。
- [ ] 验证模板不是 Explore/Plan/Worker 的简单改名，并有清晰增量价值。
- [ ] 实现逐章节恢复默认、响应语言设置和个人模板保存。
- [ ] 成功页按平台生成显式调用示例、自动委派描述建议和一条可复制验证任务。
- [ ] 断网、无模型凭据、无 Agent CLI 的环境下完成全部模板流程。

退出条件：六个模板均通过三平台渲染/校验；用户无需外部语法文档即可安装并获得可执行使用说明。

### Phase H：UX、可访问性与故障恢复收口

- [ ] 完成“模板 / 已安装 / 设置”侧边栏和局部向导导航。
- [ ] 使用 exhaustive reducer 表达 editing、previewing、reviewing、committing、conflict、success、manualRecoveryRequired。
- [ ] 任意会改变原生结果的操作都使旧 token 失效并要求重新 preview。
- [ ] 实现 loading、empty、invalid、conflict、permission、rollback 和 manual recovery UI。
- [ ] 验证键盘导航、focus trap/restore、screen-reader labels、状态 announcement、对比度和 reduced motion。
- [ ] 验证 light/dark、中文长文本、代码/路径等不可断词内容。
- [ ] 实现日志轮换、敏感值脱敏测试、operation ID 和安全诊断。
- [ ] 实现最近 20 次替换备份上限；manual recovery 对应备份不得自动删除。

退出条件：所有失败状态具备可理解恢复动作；UI 不会在后端确认前宣称写入成功。

### Phase I：最终集成与本地原型交付

- [ ] 对照 PRD 的每条 acceptance criterion 建立验收矩阵。
- [ ] 使用三个独立临时用户目录完成单平台与三平台完整旅程。
- [ ] 运行三轮验证：层内质量门、跨层/故障门、最终构建/人工验收门。
- [ ] 验证应用不访问项目级 `.claude/.codex/.cursor` 目录或常见仓库目录。
- [ ] 验证应用不要求 CLI、模型凭据、网络、签名、公证或更新服务。
- [ ] 在目标 macOS 环境运行 `tauri dev` 与本机构建。
- [ ] 运行 `trellis-check`；如发现规范缺口，回到对应 phase 修复并重新执行三轮验证。

退出条件：本地开发原型满足全部 MVP 验收标准，且没有未解释的技术验证项或数据安全风险。

## 4. 需求到阶段的可追踪性

| PRD 范围 | 主要实施阶段 |
| --- | --- |
| R0-R9：单 Agent、模板优先、canonical + overrides、严格校验 | B、C、D |
| R10-R17：用户级范围、多目标事务、发现/导入/未知字段 | C、D、E |
| R18-R23：内置/个人模板、六专家、离线确定性 | B、G |
| R24-R29：三平台对等、目标用户、工作流契约和调用指导 | D、G、I |
| R30-R34：无生命周期、真实磁盘库存、路径、冲突和目录创建 | A、C、E、F |
| R35-R43：本地交付、信息架构、聚合、章节、语言、watcher | F、G、H、I |

## 5. 测试与验证命令

脚手架完成后，以仓库实际 scripts 为准；计划中的最低命令为：

```bash
pnpm lint
pnpm typecheck
pnpm test --run
pnpm exec playwright test
pnpm build

cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --workspace --all-targets --all-features -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --workspace --all-features

pnpm tauri dev
pnpm tauri build
git diff --check
```

应增加的定向 test suites：

- `adapter_contracts`：三平台官方 fixture、required fields、determinism、round-trip。
- `capability_matrix`：Exact/PromptOnly/NativeOnly/Unsupported/BlockedLossy。
- `path_resolver`：override、verified env、default、missing、permission、symlink。
- `write_plan`：TTL、single-use、tamper、settings change、source revision change。
- `batch_transaction`：每阶段 failpoint、逆序恢复、rollback failure、目录清理。
- `inventory_projection`：跨平台聚合、同平台冲突、invalid files、Cursor compatibility。
- `watcher_integration`：create/update/rename/delete、目录后创建、事件溢出、手动刷新。
- `sqlite_migrations`：空库、上一版本升级、数据库失败后扫描重建。
- `ipc_contracts`：Rust serialization 与 TypeScript/Zod fixture 一致。
- `ui_workflows`：编辑器 reducer、preview/commit、conflict、manual recovery、可访问性。
- `secret_redaction`：代表性 token、MCP header、Prompt 片段和绝对路径不得进入日志。

Playwright 只使用与 Rust DTO 同源的、经过校验的 sanitized contract fixtures 驱动浏览器 UI；它不替代真实 Rust adapter/transaction 集成测试。macOS Tauri 窗口的最终行为通过开发应用人工 smoke test 验证。

## 6. 三轮质量门

### Round 1：层内质量

- Rust format、Clippy、unit/integration tests。
- TypeScript lint、strict typecheck、Vitest。
- Adapter 和 serializer 的真实 fixture contract tests。

### Round 2：跨层与失败路径

- Rust DTO ↔ Zod contract drift。
- React reducer → IPC → service → adapter → temp filesystem 完整数据流。
- 外部编辑冲突、目录缺失、权限、unsafe path、写入/验证/rollback failpoint。
- SQLite 与磁盘事实来源重建。

### Round 3：最终用户旅程

- 单平台与三平台从模板到安装。
- 显式导入后编辑与冲突。
- watcher 与手动刷新。
- Playwright 可访问性、中文长文本、light/dark。
- `tauri dev`、本机构建和手动验证任务。

任一 Round 失败都必须修复后从该 Round 重新开始；不能只重跑最后一个失败命令便宣布通过。

## 7. 高风险文件与回滚点

| 预期区域 | 风险 | 保护措施 / 回滚点 |
| --- | --- | --- |
| `src-tauri/src/domain/agents/` | canonical 变化影响全部 adapter、DTO、UI | Claude tracer bullet 后冻结 v1 contract；变更需全平台 contract tests |
| `src-tauri/src/adapters/agents/` | 未知字段丢失、平台能力误映射 | 每平台独立 fixture + parse-render-parse；无默认分支 |
| `src-tauri/src/infrastructure/filesystem/` | 用户文件损坏、symlink escape、半提交 | 同目录 temp、fsync、backup、failpoint、read-back、逆序 rollback |
| `src-tauri/migrations/` | metadata 与磁盘状态漂移 | migration 不可修改；升级测试；失败不删除数据库 |
| `src/contracts/` 与 Rust DTO | 前后端形状漂移 | 生成或单一 fixture owner；`contracts:check` |
| 模板 manifest/body | 六模板输出漂移、版本不可追踪 | schema version + content hash + deterministic golden tests |
| 编辑器 reducer | impossible states、陈旧 token 提交 | discriminated union + exhaustive transitions |
| watcher/projection | 丢事件、重复聚合、覆盖草稿 | 事件只触发重扫；inventory revision；手动刷新同路径 |

建议每个 Phase 形成小而可回滚的提交边界。若必须回滚，优先使用非破坏性的 `git revert`，不得清除用户已有未提交改动。任何 migration 一旦进入已运行状态，只能新增反向/修复 migration，不能修改历史文件。

## 8. 开始实现前的最终检查

- [x] 用户已审阅并批准四个规划产物。
- [x] `prd.md` 已完成 convergence pass，无已解决问题残留。
- [x] `design.md` 的技术验证项已分配到对应 Phase。
- [x] 架构草图得到用户批准，并生成最终 embedded `.drawio.png`。
- [x] 工作区中 `docs/official/003-codex-cli-docs.md` 等非本任务文件保持不动。
- [x] 运行 `python3 ./.trellis/scripts/task.py start 07-17-subagent-workflow-manager-mvp` 前再次确认当前任务路径和 git 状态。

## 9. 实施与验收记录

### 已完成的核心闭环

- Tauri 2 + React + TypeScript strict + Rust 工程、三平台适配器、文件化六模板、SQLite 派生索引和 macOS `.app` bundle 已落地。
- 模板选择、结构化编辑、个人模板保存、三平台原生 preview、单次 WritePlan token、整批提交、备份、验证、补偿回滚、库存聚合和文件 watcher 已贯通。
- 显式导入只允许写回原平台；导入后的外部修改、名称冲突、过期或篡改 token、未知字段和不安全 YAML round-trip 均有阻止路径。
- rollback 会删除本批次创建的文件及仍为空的本批次根目录；非空目录保持不动。回滚失败会保留 manifest，并通过受控 UUID 命令提供 Finder 恢复入口。
- Rust struct-variant enum 使用 `rename_all_fields = "camelCase"`；Rust DTO 与 Zod 通过共享 JSON fixture 校验，单平台 `platformOverrides` 使用 Zod 4 `partialRecord`。
- 六个内置模板均通过 Claude、Codex、Cursor 的确定性 render / parse 验证；三平台 preview -> commit -> scan 使用真实临时目录完成集成测试。

### 已通过的质量门

```text
pnpm lint
pnpm typecheck
pnpm test                    # 10 tests
pnpm build
cargo fmt --check
cargo clippy -- -D warnings
cargo test --all-features    # 35 tests
pnpm exec playwright test --list
pnpm tauri:build
git diff --check
```

macOS bundle：`src-tauri/target/release/bundle/macos/DIY Subagent.app`。Bundle 已验证为 arm64 Mach-O，包含 `icon.icns` 和六套内置模板资源。

### 环境限制与未冒充完成的验证

- Playwright 实际执行在启动 Vite 时被当前沙箱拒绝绑定 `127.0.0.1:1420`，错误为 `listen EPERM`；测试发现和组件级行为测试均通过，但浏览器断言未开始执行。
- `tauri dev` 依赖同一本地端口绑定，当前沙箱无法完成交互 smoke test；本机构建已成功。
- Cursor 对 Claude/Codex 用户目录，尤其 Codex TOML 的真实运行时兼容边界仍需在安装了目标 Cursor 版本的环境中验证。当前产品不把兼容目录曝光冒充为 Cursor 原生安装，也不据此执行重复写入。
