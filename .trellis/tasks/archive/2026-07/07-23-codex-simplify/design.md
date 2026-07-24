# Design — Codex 侧简化：官方示例模板与低门槛配置页

> 依据：`prd.md`、`research/codebase.md`（代码事实）、`research/external.md`（外部口径，思考强度档位待其最终确认后微调常量）。

## 0. 核心判断

**数据结构先行**：门槛高的根源是 `AgentDraft` 里的 13 节结构化指令契约（`SharedInstructionContract` + `UsageContract` + `ResponseLanguage`），以及由它派生的 marker 渲染/解析/只读判定。本设计把 draft 收敛为 codex 原生文件的同构形状，结构化契约整体删除，而不是在 UI 上隐藏。

```
旧: AgentDraft { logicalName, description, shared(9), responseLanguage, usage(3), platformOverrides, provenance }
新: AgentDraft { logicalName, description, developerInstructions: String, platformOverrides, provenance }
```

消除的特殊情况：
- marker 存在与否 → editable 分支：删除。**任何可解析的原生文件都可编辑**（`parse_structured_instructions` / `render_structured_instructions` / `instruction_contract.rs` 整体删除；`ParsedNativeAgent.editable` 恒 true，`blocked_reason` 仅保留 UTF-8/解析失败场景）。
- 模板载不动 `[mcp_servers.*]` 的缺口 → 用一个通用 `extraToml` 字段补上，不为 mcp/skills 各建模型。

## 1. 域模型（src-tauri/src/domain/agents/）

### model.rs
- 删除 `SharedInstructionContract`、`UsageContract`、`ResponseLanguage`。
- `AgentDraft` 增加 `developer_instructions: String`（camelCase 序列化为 `developerInstructions`）。
- `CodexOverride` 增加 `extra_toml: Option<String>`：原生 TOML 片段（顶层为若干表/数组表），渲染时并入文档。`#[serde(default)]` 已在结构体级别，向后兼容。

### validation.rs
- `validate_logical_name`：字符集放宽为 `[a-z0-9-_]`（首字符仍须小写字母；`-`/`_` 不得连续或收尾）。官方示例名 `pr_explorer` 等因此合法；claude/cursor 文件名带下划线无害。
- `validate_agent_draft` 必填收敛为三项：`logicalName`（格式）、`description` 非空、`developerInstructions` 非空（对应 codex 文件三个必填字段）。
- codex override 校验新增：`extraToml` 若非空必须可被 `toml_edit` 解析，且顶层键不得与 KNOWN_FIELDS 冲突（防止静默覆盖 name/model 等）。
- 删除 shared/usage 相关 require_text/require_list。

### instruction_contract.rs
- 整个文件删除，`mod.rs` 导出同步清理。

## 2. 适配器（src-tauri/src/adapters/agents/）

### codex.rs
- render：`developer_instructions` 写用户原文（trim 后原样）；随后若 `extra_toml` 非空，`DocumentMut::from_str(extra)` 解析并将其顶层 item 逐个赋给目标文档（同键覆盖，天然去重；known 字段冲突已被校验拦截）。`original_bytes` 保留机制不变。
- parse：三必填字段读出后直接构成新 draft（`developer_instructions` 原文入 draft），不再嗅探 marker；`editable = true`，`blocked_reason = None`（UTF-8/TOML 解析失败仍走原错误路径）。`extra_toml` 不回填（未知表继续由 `preserved_fields` 键名列表提示 + render 时 original_bytes 原位保留，避免同一数据出现两个来源）。
- `KNOWN_FIELDS` 不变；contract 版本字符串沿用 `codex-custom-agent-2026-07`。

### markdown_yaml.rs（claude/cursor 共用底座）
- render：正文 = `draft.developer_instructions` 原文（不再拼 13 节）。
- parse：frontmatter 之外的正文整体读入 `developer_instructions`；`editable = true`。
- 仅保证编译与测试通过（PRD R4），不做体验优化。

## 3. 模板（domain/templates + resources/templates + infrastructure/templates）

### TemplatePackage 新形状
```
{ manifest, logicalName, defaultDescription, developerInstructions, platformOverrides }
```
- 删除 `sharedDefaults` / `usageDefaults` / `responseLanguage`；新增 `developer_instructions: String`（`#[serde(default)]`，存量个人模板 JSON 缺该字段时降级为空串加载，多余旧键被 serde 忽略，**不会**导致启动失败）。
- `to_draft()` 同步。

### validate_template 放宽
- 保留：manifest 完整性（id 格式、version/name/description 非空、supportedPlatforms 非空且每个平台有 override）、personal source 检查。
- 移除：对 `to_draft()` 的 `validate_agent_draft` 全量校验；`logicalName` 改为**非空时**才校验格式。空白模板因此可以合法地携带空名称/空描述/空指令（安装门槛由预览时的 draft 校验把守）。

### 内置模板重写（7 份 JSON，`BUILTIN_TEMPLATES` 数组同步）
- 删除：requirements-clarifier、architecture-mapper、docs-researcher、root-cause-debugger、code-reviewer、delivery-verifier。
- `custom-blank.json`：`logicalName: ""`、`defaultDescription: ""`、`developerInstructions: ""`；platformOverrides 三平台保留，codex config 预置 `{"modelReasoningEffort": "medium", "sandboxMode": "read-only"}`。
- 新增 6 份（manifest.id 与 logicalName 一致，用官方名）：

| id / name | model | effort | sandbox | extraToml |
|---|---|---|---|---|
| pr_explorer | gpt-5.3-codex-spark | medium | read-only | — |
| reviewer | gpt-5.4 | high | read-only | — |
| docs_researcher | gpt-5.4-mini | medium | read-only | `[mcp_servers.openaiDeveloperDocs]` url |
| code_mapper | gpt-5.4-mini | medium | read-only | — |
| browser_debugger | gpt-5.4 | high | workspace-write | `[mcp_servers.chrome_devtools]` url + startup_timeout_sec |
| ui_fixer | gpt-5.3-codex-spark | medium | （无，继承） | `[[skills.config]]` path + enabled=false |

- `developerInstructions` 用文档英文原文；manifest 的 name/description/tags/risk 用中文（如「PR 探索者」「代码评审员」…；browser_debugger 因 workspace-write 标 risk=medium，其余 low）。`supportedPlatforms: ["codex"]`，adapterContracts 仅 codex。
- `services/templates.rs` 模板数量/名称断言与逐模板渲染测试同步重写。

## 4. 模型列表（新 IPC 链路）

### infrastructure/codex_config.rs（新，纯函数可测）
```
resolve_codex_endpoint(config_toml: &str, auth_json: Option<&str>) -> CodexEndpoint { base_url, api_key: Option<String> }
```
- `model_provider` → `[model_providers.<id>]`：`base_url`（缺省 `https://api.openai.com/v1`）；api key 优先级：provider 表内联 `api_key` → provider `env_key` 指向的环境变量 → `auth.json` 的 `OPENAI_API_KEY`。
- 【external.md 已确认】codex 本体的解析链是 env_key → bearer/auth 命令 → auth.json，**不读内联 api_key**；我们额外把内联 `api_key` 放在首位是有意的超集（尊重用户「用 config.toml 里的」诉求，且本机配置实际写了内联 key），任何对 codex 生效的配置对我们同样生效。URL 拼接 `{base_url}/models` 与 codex 自身拉模型目录的实现同构（models_endpoint.rs 的 `MODELS_ENDPOINT = "/models"`），不做额外路径探测。
- 文件读取由调用方（service）完成，路径来自 `PlatformPathResolver::home_dir()` + `.codex/`，遵守 safe-path 惯例。

### services/model_catalog.rs（新 ModelCatalogService）
- `list_models(force_refresh: bool) -> ModelList { base_url, models: Vec<String>, fetched_at_ms, from_cache }`。
- 行为：非强制且缓存命中（按 base_url 匹配）→ 直接返回缓存；否则 GET `{base_url}/models`（`Authorization: Bearer <key>`，超时 10s，reqwest blocking + rustls），解析 `{"data":[{"id":...}]}`，按 id 去重排序，`write_atomic` 写入 `app_data_dir/codex-models-cache.json`。
- 失败路径：网络/401/解析失败 → 若有缓存返回缓存（`from_cache: true`），否则返回 AppError（前端保持手输可用）。**错误信息与日志不得包含 api key。**
- 依赖注入：HTTP 取数收敛为 `ModelListFetcher` trait（仿 `Clock` 端口），生产实现用 reqwest，测试用桩；缓存与 config 解析用纯函数/临时目录测试。
- Cargo 新增：`reqwest = { version = "0.12", default-features = false, features = ["blocking", "json", "rustls-tls"] }`。前端 CSP/capabilities 零改动。

### IPC 四件套
- `#[tauri::command] list_codex_models(request: ListCodexModelsRequestDto { force_refresh })` → `CodexModelListDto { baseUrl, models: string[], fetchedAtMs, fromCache }`；`run_blocking` 包裹；`generate_handler!` 注册。
- zod `codexModelListSchema` + `appIpc.listCodexModels` + `queryKeys.codexModels`。

## 5. 前端（src/）

### contracts/index.ts
- `agentDraftSchema`：去 shared/usage/responseLanguage，加 `developerInstructions: z.string()`；`codexOverrideSchema` 加 `extraToml: z.string().nullable().optional()`；`templatePackageSchema` 同步新形状；新增 `codexModelListSchema`。
- `src/lib/validation/agentDraft.ts`（预览前置校验的前端复刻）同步为三必填。
- fixture `tests/fixtures/import-agent-result-claude.json` 与 `contracts/index.test.ts` 内嵌常量重写（Rust `dto/mod.rs` fixture 测试同批）。

### 编辑器（StructuredEditor.tsx 重写主体）
- 主表单三字段：名称、描述、遵循指令（`Textarea`，问号 tooltip：说明它就是 codex 的 `developer_instructions`，定义子代理的核心行为，安装前必填）。
- 「共享语义章节」「语言与使用契约」两节删除。
- 「目标平台与高级字段」结构保留；Codex 行内增强：
  - model：`Input` + 原生 `<datalist>` 挂接模型列表（保持自由输入），旁置刷新 `IconButton`（`RefreshCw`）触发 `forceRefresh` 重拉；hint 显示来源状态（缓存时间 / 拉取失败请手输）。
  - model_reasoning_effort：`Select` 选项 = 继承 + 官方全集 8 档 `none/minimal/low/medium/high/xhigh/max/ultra`（【external.md 已确认】源码枚举裁决；各模型可用档位由服务端目录下发、无静态对照表，故 UI 提供全集并以文案说明「可用档位取决于所选模型」）。
  - sandbox_mode：选项不变，label 旁问号 tooltip（三档语义 + 继承说明）。
- `createPlatformOverride("codex")`（手动勾选 Codex 时）默认 `{ modelReasoningEffort: "medium", sandboxMode: "read-only" }`；空白模板同值 → 「新建默认 medium/read-only」在两条入口一致。
- 「保存为个人模板」区不动。

### 新组件与 hook
- `components/ui/Tooltip.tsx`：Radix Tooltip 封装（Provider 已挂在 AppProviders）；`HelpTip`（`CircleHelp` 图标 + 文案 prop），挂 `FieldShell` 的 hint 位。
- `features/agents/hooks/useCodexModels.ts`：`useQuery(queryKeys.codexModels, appIpc.listCodexModels)`，`staleTime: Infinity`（持久缓存在 Rust 侧）；刷新按钮走 `forceRefresh` mutation/refetch。
- `PreviewReview` / `InstallSuccess`：删除对已移除字段（如验证任务）的展示。

## 6. 兼容性与风险

| 风险 | 处理 |
|---|---|
| 存量带 marker 的已安装 agent | 导入后整段 marker Markdown 成为遵循指令的自由文本，信息零丢失、变为可编辑；不做自动降解转换 |
| 存量个人模板（旧 JSON 形状） | serde 默认值兜底加载（指令为空），不会阻断启动；不做迁移 |
| 模板启动期校验 | validate_template 放宽后仅校验 manifest；draft 校验移到预览时（后端 preview + 前端复刻双保险） |
| extraToml 与已存在文件冲突 | render 用 toml_edit 同键覆盖语义，无重复表；known-field 冲突在校验期拒绝 |
| api key 泄露 | key 只在 Rust 内存中流转；错误串仅含 base_url 与状态码；不写日志 |
| OAuth-only（无 API key）用户 | 请求无 Authorization 或 401 → 报错走手输降级，不阻塞表单 |
| logical name 放宽波及 claude/cursor | 文件名出现下划线，平台可接受；本轮不深究 |

## 7. 不做的事

- 不建 mcp_servers/skills 的结构化编辑 UI（extraToml 仅随模板流转，预览 diff 中可见）。
- 不动 SQLite migration（缓存走文件）。
- 不改「目标平台与高级字段」「保存为个人模板」的区块结构与交互。
- 不为 claude/cursor 优化正文渲染效果。
