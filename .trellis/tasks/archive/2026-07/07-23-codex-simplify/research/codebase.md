# Research: Codex 简化改造 — 代码库现状调研

- **Query**: 指令契约管线 / preserved_fields / 模板契约 / 前端契约 / IPC 面 / 缓存 / codex 路径 / UI 原语 / 受影响测试
- **Scope**: internal（附 docs/official/003 官方示例）
- **Date**: 2026-07-23

---

## 1. 指令契约管线：developer_instructions 如何产生

### 数据结构（src-tauri/src/domain/agents/model.rs）

`AgentDraft`（model.rs:164-174）：

```rust
pub struct AgentDraft {
    pub logical_name: String,
    pub description: String,
    pub shared: SharedInstructionContract,
    pub response_language: ResponseLanguage,
    pub usage: UsageContract,
    pub platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
    pub provenance: DraftProvenance,
}
```

`SharedInstructionContract`（model.rs:65-77）9 个字段：`role_goal: String`、`when_to_use/when_not_to_use/input_requirements/execution_steps: Vec<String>`、`output_contract: String`、`constraints/stop_conditions: Vec<String>`、`failure_handling: String`。
`UsageContract`（model.rs:79-85）：`explicit_invocation_examples: Vec<String>`、`auto_delegation_guidance: String`、`verification_task: String`。
`CodexOverride`（model.rs:103-111）：`model`、`model_reasoning_effort`、`sandbox_mode`（均 `Option<String>`）、`nickname_candidates: Vec<String>`。

### 渲染（instruction_contract.rs）

- `render_structured_instructions(draft)`（instruction_contract.rs:5-36）把 shared 9 字段 + response_language + usage 3 字段渲染成一段带 `<!-- diy-subagent:structured:v1 -->` 标记（第 3 行 STRUCTURED_MARKER）的中文分节 Markdown（`# 角色目标`、`# 适用场景`……共 13 节）。
- `parse_structured_instructions(body)`（instruction_contract.rs:38-84）逆向解析；缺任意一节返回 None。

### codex 适配器（adapters/agents/codex.rs）

- render：codex.rs:155 `document["developer_instructions"] = value(render_structured_instructions(draft));` — developer_instructions 就是结构化 Markdown 的序列化结果。
- parse：codex.rs:64-89。`name`/`description`/`developer_instructions` 三个 TOML 字段必填（required_string，缺失报 `agent.validation_failed`）。若 developer_instructions 含 marker → 解析回 shared/usage，`editable=true`；否则整段文本塞进 `shared.role_goal`，其余字段全空，`editable=false` + blocked_reason（codex.rs:120-124："不包含 DIY Subagent 结构化标记；可只读查看，但不能在应用内覆盖"）。
- **claude/cursor 走同一契约**：markdown_yaml.rs:62 调 `parse_structured_instructions`、markdown_yaml.rs:182 调 `render_structured_instructions`。改 shared 契约不是 codex 局部改动，三平台适配器同源。

### validate_agent_draft 必填项（domain/agents/validation.rs:31-139）

必填（Error 级）：
- `logicalName`：validate_logical_name（validation.rs:5-29）— 2–64 字节、小写字母开头、只允许 `[a-z0-9-]`、无连续/结尾连字符。**不允许下划线**。
- `description`、`shared.roleGoal`、`shared.outputContract`、`shared.failureHandling`、`usage.autoDelegationGuidance`、`usage.verificationTask`（require_text，非空白）
- `shared.whenToUse/whenNotToUse/inputRequirements/executionSteps/constraints/stopConditions`（require_list，至少一条非空）
- `usage.explicitInvocationExamples` **不是必填**。
- codex override 唯一校验：nickname_candidates 去重非空（validation.rs:167-173）。

### shared 变 optional / 换成单一 developerInstructions 字符串会破什么

1. `validation.rs` 所有 require_text/require_list 调用（31-115 行）。
2. `instruction_contract.rs` 整个 render/parse（三平台共用；editable 判定依赖 marker，codex.rs:67-68、markdown_yaml.rs:62-63 都要重设计——自由文本后"任意合法 TOML 是否可编辑"的 gate 需要新定义）。
3. `codex.rs` parse 的 fallback（role_goal 兜底）与 markdown_yaml.rs 同构 fallback。
4. Rust DTO 侧：AgentDraft 是 serde 直传（dto/mod.rs 直接复用 domain 类型），改 struct 即改 IPC 载荷。
5. 前端：`sharedInstructionContractSchema`（src/contracts/index.ts:12-22）、`usageContractSchema`（24-28）、`agentDraftSchema`（85-96）、前端复刻必填校验 `editableAgentDraftSchema`（src/lib/validation/agentDraft.ts:7-61，AgentWorkflow.tsx:57 预览前 safeParse）、StructuredEditor「共享语义章节」整个 UI（StructuredEditor.tsx:176-255）与「语言与使用契约」（257-297）。
6. 共享 fixture `tests/fixtures/import-agent-result-claude.json`（Rust 侧 dto/mod.rs:168-212、TS 侧 src/contracts/index.test.ts:52-64 双边锁定）。
7. 7 份模板 JSON 的 sharedDefaults/usageDefaults + 启动期 validate（见 Q3，不同步改会导致 **app 启动失败**）。
8. 大量测试内嵌 sample_draft（见 Q9）。
9. 已安装的旧结构化 agent 的导入兼容：旧文件带 marker 的 13 节格式，新解析逻辑如何回读需设计（目前 marker 缺失 = 只读）。

---

## 2. preserved_fields：未知 TOML 键的往返机制

### parse 侧（展示用键名清单）

codex.rs:19-27 定义 `KNOWN_FIELDS`（7 个）：

```rust
const KNOWN_FIELDS: [&str; 7] = ["name", "description", "developer_instructions",
    "nickname_candidates", "model", "model_reasoning_effort", "sandbox_mode"];
```

codex.rs:101-106：parse 时收集 TOML 顶层所有不在 KNOWN_FIELDS 的键名（如 `mcp_servers`、`skills`）为 `Vec<String>`——**只有键名字符串，不含内容**，仅供 UI 提示。

### 数据流向

`ParsedNativeAgent.preserved_fields`（domain/ports/agent_adapter.rs:11）→ `ImportAgentResult.preserved_fields`（services/agents.rs:62）→ `ImportAgentResultDto`（dto/mod.rs:141）→ zod `importAgentResultSchema.preservedFields`（contracts/index.ts:273）。**write plan 里没有 preserved 字段**：`StoredTargetPlan.rendered_bytes`（infrastructure/write_plan_store.rs）存的是渲染完成的最终字节，保留内容已经融在 bytes 里。

### 真正的保留机制在 render

codex.rs:129-151：`render(draft, original_bytes)` 若传入 original_bytes，用 toml_edit `DocumentMut` 解析原文件，然后只覆盖/移除已知键（153-180 行），未知表（`[mcp_servers.docs]` 等）由 toml_edit 原位保留。测试 `preserves_unknown_codex_tables`（codex.rs:256-274）验证了 `[mcp_servers.docs]` 存活。

**original_bytes 的唯一来源**：services/agents.rs:459-460

```rust
let existing = read_optional(&target_path)?;
let rendered = adapter.render(&draft, existing.as_deref())?;
```

即"目标安装路径上已存在的文件"。模板→draft→render(draft, None) 的全新安装路径拿不到任何额外 TOML。

### 结论：内置模板今天无法携带额外 TOML 表

`AgentDraft` / `TemplatePackage` 都没有能装任意 TOML 的字段；preserved 机制只在"覆盖磁盘已有文件"时生效。要让新模板带 `[mcp_servers.*]`、`[[skills.config]]`（官方示例 docs_researcher / browser_debugger / ui_fixer 都需要），缺一个载体，例如：draft/override 增加 `extra_toml: Option<String>` 之类字段（渲染时 merge 进 DocumentMut），或模板提供原生 TOML 片段作为 render 的 original_bytes。这是方案 (a) 最大的结构性工作。

---

## 3. 模板契约

### 结构（src-tauri/src/domain/templates/model.rs）

`TemplatePackage`（model.rs:32-42）：`manifest: TemplateManifest` + `logical_name` + `default_description` + `shared_defaults: SharedInstructionContract` + `usage_defaults: UsageContract` + `response_language` + `platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>`。
`TemplateManifest`（model.rs:17-30）：id/version/name/description/author/source/tags/supported_platforms/risk{level,summary}/adapter_contracts(BTreeMap)。
`to_draft()`（model.rs:44-59）：逐字段拷贝，provenance 恒为 `BuiltinTemplate`（前端真正入口是 createDraftFromTemplate，见 Q4）。
`TemplateSummary`（model.rs:61-85）：manifest 的子集（id/version/name/description/tags/supportedPlatforms/risk）。

### JSON 形状（camelCase，见 resources/templates/docs-researcher.json / custom-blank.json）

顶层键：`manifest`（含 `adapterContracts: {"claude": "claude-subagent-2026-07", "codex": "codex-custom-agent-2026-07", "cursor": "cursor-subagent-2026-07"}`）、`logicalName`、`defaultDescription`、`sharedDefaults`（9 字段全填）、`usageDefaults`（3 字段全填）、`responseLanguage`、`platformOverrides`（tagged 形式 `{"codex": {"platform": "codex", "config": {...}}}`）。codex config 示例（docs-researcher.json:69）：`{"sandboxMode": "read-only", "nicknameCandidates": ["Docs", "Source", "Reference"]}`。

### 加载与校验（src-tauri/src/infrastructure/templates/mod.rs）

- 7 份内置模板经 `include_str!` **编译进二进制**（mod.rs:18-26：custom-blank、requirements-clarifier、architecture-mapper、docs-researcher、root-cause-debugger、code-reviewer、delivery-verifier）。tauri.conf.json:42 另把 `resources/templates/**/*` 打进 bundle（实际读取不走它）。
- `TemplateRepository::load`（mod.rs:35-79）启动时全部 parse + `validate_template` + 写 template_index；**任一模板不合法 → AppState 初始化失败 → 应用无法启动**。
- `validate_template`（mod.rs:132-160）要求：
  1. `manifest.id` 与 `logicalName` 均通过 validate_logical_name（**下划线非法**）；
  2. version/name/description 非空，supportedPlatforms 非空；
  3. `validate_agent_draft(package.to_draft())` 零 issue（→ sharedDefaults/usageDefaults 必须满足 Q1 全部必填项）；
  4. 每个 supportedPlatform 必须在 platformOverrides 有条目（codex-only 模板合法：`supportedPlatforms: ["codex"]` + 仅 codex override）。
  5. adapterContracts **没有**被校验（纯数据）。
- 个人模板：save_personal（mod.rs:97-117）额外要求 source=="personal"；TemplateService::save_personal_template（services/templates.rs:38-84）用 `complete_platform_overrides` 强制补齐三平台 override 并固定 supported_platforms=ALL。

### 官方 6 示例（docs/official/003-codex-cli-docs.md:322-506）

例1：`pr_explorer`（model=gpt-5.3-codex-spark, effort=medium, sandbox=read-only）、`reviewer`（gpt-5.4/high/read-only + nickname 示例 308-316）、`docs_researcher`（gpt-5.4-mini/medium/read-only + `[mcp_servers.openaiDeveloperDocs] url=...`）。
例2：`code_mapper`（gpt-5.4-mini/medium/read-only）、`browser_debugger`（gpt-5.4/high/workspace-write + `[mcp_servers.chrome_devtools] url + startup_timeout_sec`）、`ui_fixer`（gpt-5.3-codex-spark/medium + `[[skills.config]] path/enabled`）。
**注意：6 个 name 全含下划线**（文件名用连字符），与 validate_logical_name 冲突（见 Caveats）。
官方 reasoning effort 档位（003:128-138）：`ultra`/`max`/`xhigh`/`high`/`medium`/`low`/`minimal`/`none`。
官方 schema（003:249-257、280-287）：必填 name/description/developer_instructions；可选 nickname_candidates、model、model_reasoning_effort、sandbox_mode、mcp_servers、skills.config。

---

## 4. 前端契约

### zod schemas（src/contracts/index.ts）

- `sharedInstructionContractSchema` :12-22、`usageContractSchema` :24-28
- `codexOverrideSchema` :43-48（model/modelReasoningEffort/sandboxMode 均 `.nullable().optional()`，nicknameCandidates `.default([])`）
- `platformOverrideSchema` :56-60（discriminatedUnion on `platform`，值形状 `{platform, config}`）
- `agentDraftSchema` :85-96（platformOverrides 用 `z.partialRecord`）
- `templateSummarySchema` :104-112、`templatePackageSchema` :115-137
- `importAgentResultSchema` :267-274（含 preservedFields）

### fixtures（tests/fixtures/，仅 2 个）

| fixture | 双边锁定位置 | 本任务是否要改 |
|---|---|---|
| `import-agent-result-claude.json` | Rust dto/mod.rs:168-212 `import_agent_result_matches_the_shared_frontend_fixture` + TS src/contracts/index.test.ts:52-64 | **要改**（内嵌完整 AgentDraft.shared/usage） |
| `platform-directory-claude.json` | dto/mod.rs:215-232 + index.test.ts:99-108 | 不受影响 |

模板形状没有共享 fixture；contracts/index.test.ts:7-50 还内嵌 shared/usage 常量与三平台 importedFixtures（要同步改）。

### editorState / 工作流

- `createDraftFromTemplate`（src/features/agents/types/editorState.ts:42-62）：structuredClone 模板 sharedDefaults/usageDefaults/platformOverrides，manifest.source=="personal" 决定 provenance kind。
- `createInitialEditorState`（:64-77）：targets 从 draft.platformOverrides 的键推导（imported 限一个平台）。
- `AgentWorkflow.tsx`：requestPreview（:56-75）先 `editableAgentDraftSchema.safeParse`（src/lib/validation/agentDraft.ts 是后端必填规则的前端复刻，需同步）再 `preview.mutateAsync({draft, targets})`；状态机 editing→previewing→reviewing→committing→succeeded/failed（editorState.ts:90-174）。
- `CreatePage.tsx`：模板 chips（TemplatePresetPicker :164-207，aria-label「预设模板」），`CUSTOM_BLANK_TEMPLATE_ID = "custom-blank"` 置顶（:18, :91-99）；WorkflowHost 按 loadedPackage.manifest.id 作为 key remount 编辑器（:150）。

---

## 5. IPC 面

### 命令（src-tauri/src/commands/mod.rs，13 个，与 lib.rs:125-139 generate_handler 一一对应）

get_platform_directories(:21) / choose_platform_directory(:32，走 tauri_plugin_dialog) / reset_platform_directory(:67) / list_templates(:82) / get_template(:90) / save_personal_template(:102) / scan_installed_agents(:114) / get_agent_native_content(:129) / import_agent_for_editing(:143) / preview_agent_install(:157) / commit_agent_install(:169) / reveal_agent_source(:184) / reveal_recovery_directory(:197)。

请求都是 `request: XxxRequestDto`（dto/mod.rs:34-89），响应直接 serde domain 类型或 XxxDto。

### run_blocking（commands/mod.rs:210-236）

`tauri::async_runtime::spawn_blocking(task)` 包裹同步闭包；Err(AppError) → `IpcErrorDto::from_error(error, operation_id)`；operation_id = `{command}:{uuid}`。新命令照抄该模式即可（同步阻塞 HTTP 调用也天然兼容）。

### AppState::from_paths（lib.rs:53-107）注入清单

`Arc<dyn Clock>`(SystemClock)、`Arc<Database>`（app_data_dir/metadata.sqlite3）、`AdapterRegistry`、`Arc<PlatformPathResolver>`（持 home_dir）、`Arc<WritePlanStore>`、`Arc<SourceRegistry>`、`Arc<TemplateRepository>`、`Arc<BatchTransactionCoordinator>`、`Arc<InventoryWatcher>`。三个服务：SettingsService(paths+write_plans)、TemplateService(templates+adapters)、AgentApplicationService(全家桶)。**无 HTTP client 端口**；若要可测性，可仿 Clock 定义 port + 注入。

### HTTP 现状

- Cargo.toml（src-tauri/Cargo.toml:16-37）**无 reqwest、无 tauri-plugin-http**，无任何 HTTP 依赖。
- capabilities/default.json 仅 `core:default` + `core:window:allow-start-dragging`。
- tauri.conf.json:29 CSP `connect-src ipc: http://ipc.localhost` — 前端 fetch 外部 URL 会被 CSP 拦。
- 结论：/v1/models 请求放 **Rust 侧**最省（后端网络请求不受 webview CSP/capability 约束）：加 `reqwest`（可用 blocking feature 配合 run_blocking），无需动 capabilities/CSP。

新命令完整清单：Rust `#[tauri::command]` + RequestDto + generate_handler 注册（lib.rs）+ `appIpc` 方法（src/lib/ipc/client.ts，双向 schema.parse）+ zod schema（contracts）+ queryKeys（src/lib/query/queryKeys.ts，现有 templates/directories/inventory 三组）。

---

## 6. 缓存选项

### SQLite（src-tauri/src/infrastructure/database/mod.rs + migrations/0001_initial.sql）

- 单 migration `0001_initial.sql`，4 张表：`platform_directories`（platform PK, override_path, updated_at_ms）、`imported_sources`、`template_index`、`backup_manifests`；`PRAGMA user_version = 1`。
- 版本 gate 硬编码（mod.rs:77-94）：version 0 → 跑 0001；version 1 → 通过；**其他一律报错**。加表 = 新建 0002 migration 文件 + 把 gate 改成逐级升级逻辑。
- 加一张 model-list 缓存表（如 `codex_model_cache(fetched_at_ms, models_json)` 或通用 kv 表）在结构上没问题，但要动 migration 机制。

### SettingsService（src-tauri/src/services/settings.rs）

只有 paths + write_plans 两个依赖，唯一"设置"就是 platform_directories 表的目录 override（经 PlatformPathResolver.set_override/reset，database/mod.rs:100-160）。没有通用 key-value 设置存储。

### 备选：文件缓存

`write_atomic`（infrastructure/filesystem/atomic_write.rs）现成，app_data_dir 已由 AppState 掌握——把模型列表缓存写成 app_data_dir 下 JSON 文件可完全绕开 migration 改动，实现最小。

---

## 7. Codex 路径与 TOML 解析

- `AgentPlatform::Codex` 常量（model.rs:24-48）：agents 目录 `.codex/agents`、平台根 `.codex`、扩展名 `toml`。
- `PlatformPathResolver`（infrastructure/paths.rs:38-53）：root = SQLite override 或 `home_dir.join(".codex/agents")`；`home_dir()` 公开访问器（paths.rs:78-80）；platform_detected 恒基于默认根 `~/.codex` 是否为目录（paths.rs:110-116）。
- **全仓库没有任何代码读取 `~/.codex/config.toml` 或 `~/.codex/auth.json`**（grep `config.toml|base_url|api_key|auth.json` 仅命中文档与项目自身 Trellis 用的 `.codex/config.toml`）。base_url/api key 解析需从零实现。
- TOML 解析器：`toml_edit = { version = "0.23", features = ["parse", "serde"] }` 已在 Cargo.toml:33，解析 config.toml **零新依赖**。
- 设计注意（外部事实，代码无先例）：codex 凭证有两种形态——`~/.codex/auth.json` 的 OPENAI_API_KEY 或 ChatGPT OAuth tokens；config.toml 的 `model_providers.*.base_url` 才有自定义 base_url。/v1/models 方案需要定义"读不到 key / OAuth 模式"时的降级行为（回退手输/静态列表）。

---

## 8. UI 原语

### src/components/ui/ 现有组件

BrandMark、Button（CVA variants: primary/secondary/ghost/icon…）、FormField（`FieldShell`/`Input`/`Textarea`/`Select`）、Pill、SegmentedControl、Toast。**没有 Tooltip/Popover 封装**。

### Select（FormField.tsx:76-152）

```ts
export interface SelectOption { value: string; label: string; }
interface SelectProps { id?; value: string; onValueChange: (value: string) => void;
  options: SelectOption[]; "aria-label"?; className?; }
```

Radix `@radix-ui/react-select` 实现；**禁止空字符串 item value** → 调用侧用 `INHERIT_SENTINEL = "inherit"` 哨兵（StructuredEditor.tsx:39-40、toSelectValue/fromSelectValue :743-750，null ↔ "inherit"）。改"显式默认值"时这个映射是关键改点。

### Tooltip

- `@radix-ui/react-tooltip@1.2.12` 已安装（package.json:26）；`TooltipProvider delayDuration={300}` 已全局挂在 src/app/providers/AppProviders.tsx:2,14。
- 但目前**零使用**——只需在 components/ui/ 新建 Tooltip 封装即可。问号图标可用 lucide-react（已装 1.25.0，`CircleHelp`）。
- `FieldShell` 的 `hint` 插槽（FormField.tsx:36-38，label 右侧小字）是问号挂点的现成位置。

### 其他 radix 包（package.json:21-26）

react-dialog、react-scroll-area、react-select、react-slot、react-tabs、react-tooltip。

### 当前 codex 高级字段 UI（StructuredEditor.tsx:613-665）

- `model`：自由文本 Input，placeholder「继承父会话」（:616-631）
- `model_reasoning_effort`：Select，选项 inherit/low/medium/high（:61-66）——**缺 minimal/none/xhigh/max/ultra**
- `sandbox_mode`：Select，inherit/read-only/workspace-write/danger-full-access（:68-73）
- 三字段默认都是"继承"（null）；显式默认 effort=medium / sandbox=read-only 需要改哨兵映射 + 模板预置值 + render 侧（codex.rs:231-240 set_optional_string 空值即删键——显式默认要求 CodexOverride 里真的带值）。

---

## 9. 受影响测试清单

### Vitest（12 个文件）

| 文件 | 受影响原因 |
|---|---|
| `src/contracts/index.test.ts` | 内嵌 shared/usage 常量（:7-23）+ 三平台 importedFixtures + 共享 fixture 断言，**必改** |
| `src/features/agents/components/StructuredEditor.test.tsx` | draft 内嵌全 shared 字段（:8-39）；断言勾选 Codex 生成 `{nicknameCandidates: []}` override（:68-88），**必改** |
| `src/features/agents/components/CreatePage.test.tsx` | mock templatePackage（含 sharedDefaults）、custom-blank 置顶断言（:92-100）、「预设模板」role group（:140）、getTemplate("custom-blank")（:148），**必改** |
| `src/features/agents/types/editorState.test.ts` | createDraftFromTemplate/初始 targets，**必改** |
| `src/features/agents/components/PreviewReview.test.tsx`、`InstallSuccess.test.tsx` | draft fixture 内嵌 shared，需跟随结构改 |
| `src/app/App.test.tsx`、`HomePage.test.tsx` | 顶栏/库存文案（「点右上角 + 从模板开始」HomePage.test:205,215），大概率仅间接 |
| `Pill.test.tsx`、`SegmentedControl.test.tsx`、`platformStatus.test.ts`、`usePersistedPlatform.test.ts` | 不受影响 |

### cargo test（`mod tests` 共 14 处）

直接受影响：
- `adapters/agents/codex.rs:243`（preserves_unknown_codex_tables + sample_draft 全 shared）
- `adapters/agents/markdown_yaml.rs:437`（sample_draft、round-trip、unsafe YAML）
- `domain/agents/instruction_contract.rs:160`（structured_instructions_round_trip）
- `domain/agents/validation.rs:238`
- `services/agents.rs:627`（sample_draft；preview/commit/inventory 集成）
- `services/templates.rs:101` — **断言 `summaries.len() == 7`、custom-blank 名「自定义」、每模板×每平台确定性渲染 + parse editable**（:188-219），换模板必改
- `dto/mod.rs:158`（共享 fixture 对齐）
- `infrastructure/transaction.rs:641`（若内嵌 draft 需跟随）

间接/不受影响：settings.rs:45、write_plan_store.rs:83、source_registry.rs:42、inventory_watcher.rs:243、paths.rs:131、database/mod.rs:309。

### e2e（tests/e2e/app-shell.spec.ts，唯一一个）

只断言 IPC 之前的壳：「DIY Subagent」「平台」group、Claude Code/Codex/Cursor 按钮、「刷新」「设置」「新建 Subagent」「已安装的 subagent」region、设置/新建子页导航。**没有引用「模板」「共享语义章节」等编辑器字符串** —— 编辑器改版不直接冲击 e2e（除非动顶栏文案）。「共享语义章节」字符串只出现在 StructuredEditor.tsx:176（EditorSection 标题），无测试直接断言它。

---

## Caveats / 意外发现（影响方案可行性）

1. **官方示例 agent 名全含下划线**（`pr_explorer` 等），而 `validate_logical_name` 只允许 `[a-z0-9-]`（validation.rs:9-11），且同一名字被用作三平台文件名与模板 id。直接照抄官方 name 会被启动期模板校验拒绝 → 要么模板改用连字符名（与官方文件名 pr-explorer.toml 一致，但 TOML 内 name 与官方示例不同），要么放宽校验（波及 claude/cursor 文件名规则）。
2. **模板带不动 `[mcp_servers.*]`/`[[skills.config]]`**：preserved 机制只对"目标位置已有文件"生效（Q2），6 个官方示例有 3 个需要额外表 → 必须新增载体（draft/override 的 extra TOML 字段贯穿 domain→DTO→zod→模板 JSON→render merge），这是 (a) 的最大工作量。
3. **指令契约是三平台共享的**：把 shared 9 节换成单一 developer_instructions 会同时波及 claude/cursor 的 render/parse/editable 判定与 `editableAgentDraftSchema`，不是 codex 局部手术；同时旧已安装文件（带 marker）的导入回读兼容需要决策。
4. **模板启动期全量校验**：validate_agent_draft 与新 draft 结构必须原子性同步，否则应用直接起不来；`services/templates.rs` 的 7 模板断言同批改。
5. **无 HTTP 依赖**：reqwest 需新增；放 Rust 侧则 CSP/capability 全不用动。`toml_edit` 已有，读 ~/.codex/config.toml 零新依赖；但 base_url/key 的解析（含 auth.json OAuth 模式无 API key 的降级）代码里无任何先例。
6. **SQLite 版本 gate 硬编码只认 1**：加缓存表要动 migration 机制；app_data_dir JSON 文件缓存（write_atomic 现成）是零迁移替代方案。
7. Tooltip 的 Provider 已全局就位但无组件封装；Select 的 options 形状 `{value,label}[]` + 空值哨兵模式直接可复用为 model 下拉（fetch 失败时需允许自由输入或回退，Radix Select 本身不支持自由输入）。
8. codex 契约版本字符串 `codex-custom-agent-2026-07`（codex.rs:18）被写死在全部模板 JSON 的 adapterContracts 里（虽无校验，但应保持一致）。
