# Research: Codex 表单外部调研（model 下拉 + reasoning effort + base_url/key 解析）

- **Query**: model_reasoning_effort 官方档位、sandbox_mode 取值、codex base_url + API key 解析优先级、/v1/models 响应结构、cc-switch 模型选择交互、custom agent 文件 schema
- **Scope**: external（官方文档 + openai/codex 源码 + cc-switch 源码 + 本机实测）
- **Date**: 2026-07-23
- **验证方式**: 直接抓取 developers.openai.com 文档页、openai/codex main 分支源码、openai/openai-openapi 规格、farion1231/cc-switch 浅克隆、api.openai.com 实测、本机 ~/.codex 结构检查（仅键名）。deepwiki MCP 实际不可调用，改为直接读源码（更可靠）。

---

## 1. `model_reasoning_effort` 官方档位

### 权威结论（源码枚举，最终裁决）

`codex-rs/protocol/src/openai_models.rs` 的 `ReasoningEffort` 枚举（wire 值）：

```
none | minimal | low | medium(默认) | high | xhigh | max | ultra
```

外加 `Custom(String)` 变体：客户端会透传它不认识的"模型自定义 effort 值"。
仓库本地文档 `docs/official/003-codex-cli-docs.md` 的 8 档说法 **与源码一致，正确**。

### 文档间的不一致（需知悉）

- config-reference 页的表格只写 `minimal | low | medium | high | xhigh`（注明 "Responses API only; xhigh is model-dependent"）——**该表滞后于源码**，少了 none/max/ultra。
- subagents 页与 models 页均明确出现 ultra/max/xhigh/minimal/none 档位描述。

### 各模型支持情况（文档层面）

- **`gpt-5.6-sol`**（确认存在，旗舰）：CLI `/model` 选择器显示 6 档 —— `Low / Medium(默认) / High / Extra high(xhigh) / Max / Ultra`。不含 none/minimal。
- `minimal` 和 `none`：文档措辞是"当所选模型支持这些低延迟档位时使用"，即仅部分模型支持。
- `max`：需在应用设置中启用才可见；`ultra`：走 subagents 并行（桌面端需开 "Ultra in model picker slider"）。
- **关键架构事实**：每个模型支持哪些档位不是客户端硬编码的 —— `ModelInfo.supported_reasoning_levels: Vec<ReasoningEffortPreset>`（含 effort + description）由服务端模型目录下发（`ModelPreset.supported_reasoning_efforts` 同源）。`default_reasoning_level` 也随目录下发，缺省回退 `none`。
- UI 建议：select 放全 8 档并标注"是否可用取决于所选模型"，或跟随所选模型动态过滤（codex 官方客户端是后者）。

### 当前模型清单（models 页，2026-07-23）

- 推荐：`gpt-5.6-sol`（旗舰，细节与打磨）、`gpt-5.6-terra`（日常主力，性价比）、`gpt-5.6-luna`（最快最便宜）、`gpt-5.5`（上代旗舰）、`gpt-5.3-codex-spark`（Pro 专属 research preview，近即时纯文本）
- 其他：`gpt-5.4`、`gpt-5.4-mini`
- 已弃用（ChatGPT 登录下）：`gpt-5.2`、`gpt-5.3-codex`
- 注意：`model = "gpt-5.6"`（不带后缀）也在官方示例中出现（`codex --model gpt-5.6`），与 -sol/-terra/-luna 具体 id 并存；003 文档"start with gpt-5.6"即此用法。

来源：
- https://developers.openai.com/codex/models
- https://developers.openai.com/codex/config-reference （learn.chatgpt.com/docs/config-file/config-reference 为同一内容的站点变体）
- https://developers.openai.com/codex/subagents
- https://github.com/openai/codex → codex-rs/protocol/src/openai_models.rs（main，2026-07-23）

## 2. `sandbox_mode` 取值

config-reference 与源码 `SandboxMode` 枚举（kebab-case）一致，仍是三值，无新增：

```
read-only(默认) | workspace-write | danger-full-access
```

workspace-write 细节由 `[sandbox_workspace_write]` 子表控制（exclude_slash_tmp、network_access 等）。

来源：https://developers.openai.com/codex/config-reference ；codex-rs/protocol/src/config_types.rs

## 3. Codex 的 base_url + API key 解析

### 供应商选择

- `model_provider = "<id>"`：从 `model_providers` 里选活动供应商，**默认 `openai`**。
- 内置保留 id：`openai`、`ollama`、`lmstudio`（不可覆盖）+ `amazon-bedrock`。

### `[model_providers.<id>]` 字段（config-reference 全表 + 源码 struct 一致）

`name`、`base_url`、`env_key`、`env_key_instructions`、`experimental_bearer_token`（不推荐）、`auth`（命令式 token：command/args/cwd/refresh_interval_ms/timeout_ms）、`aws`、`wire_api`（**现仅支持 `"responses"`，也是缺省值**；chat completions 已弃用将移除）、`query_params`、`http_headers`、`env_http_headers`、`request_max_retries`（默认4）、`stream_max_retries`（默认5）、`stream_idle_timeout_ms`（默认300000）、`supports_websockets`、`requires_openai_auth`（默认 false）。

**重要：没有内联 `api_key` 字段。** `ModelProviderInfo` 结构体（codex-rs/model-provider-info/src/lib.rs）不含它，serde 默认忽略未知键 —— 本机 cliproxyapi 供应商表里写的 `api_key` 实际被 codex 忽略。

### 默认 base_url（源码 `to_api_provider`）

- ChatGPT 系登录态（Chatgpt/ChatgptAuthTokens/Headers/AgentIdentity/PersonalAccessToken）→ `https://chatgpt.com/backend-api/codex`
- 否则（API key 模式 / 未配置 base_url）→ **`https://api.openai.com/v1`**

### API key 实际解析优先级（codex-rs/model-provider/src/auth.rs `resolve_provider_auth`）

1. `env_key` 指定的**环境变量**（配置了 env_key 但环境变量缺失/为空 → 直接报错，不回退）
2. `experimental_bearer_token` 内联值
3. `[model_providers.<id>.auth]` 命令式 bearer token
4. 都没有 → 登录态凭据 `CodexAuth`：`~/.codex/auth.json`（或 OS keyring，`cli_auth_credentials_store = file|keyring|auto`）

### `~/.codex/auth.json` 结构（源码 `AuthDotJson` + 本机实测一致）

```json
{ "auth_mode": "...", "OPENAI_API_KEY": "sk-...", "tokens": {...可选}, "last_refresh": "...", "agent_identity": {...} }
```

本机（codex-cli 0.144.6）顶层键实测：`OPENAI_API_KEY`、`auth_mode`。`codex login --with-api-key`（stdin 传入）即写此文件。官方明言该文件是明文缓存，含 access token，按密码对待。

### 典型第三方中转形态（本机 + cc-switch 写法印证）

config.toml：`model_provider = "<relay-id>"` + `[model_providers.<relay-id>]` 写 `name/base_url/wire_api`；真正的 key 写进 `auth.json` 的 `OPENAI_API_KEY`（cc-switch 的 codex_config.rs 就是"原子写 auth.json + config.toml、第二步失败回滚第一步"）。
→ **对本任务的启示**：解析用户 Codex 配置时，key 的读取顺序应为：provider 的 env_key 环境变量 → auth.json 的 OPENAI_API_KEY；base_url 取 provider.base_url，缺省 `https://api.openai.com/v1`。

来源：
- https://developers.openai.com/codex/auth
- https://github.com/openai/codex → codex-rs/model-provider-info/src/lib.rs、codex-rs/model-provider/src/auth.rs、codex-rs/login/src/auth/storage.rs
- 本机 ~/.codex 实测（仅键名）

## 4. `/v1/models` 响应结构（OpenAI 兼容）

官方 OpenAPI 规格（openai/openai-openapi）：`GET {base}/models`，鉴权 `Authorization: Bearer <key>`：

```json
{ "object": "list",
  "data": [ { "id": "gpt-...", "object": "model", "created": 1686935002, "owned_by": "openai" } ] }
```

- `object`/`data` 必填；Model 四字段 `id`(string)/`object`("model")/`created`(unix秒)/`owned_by`(string) 均为 required。
- **无分页参数**（该端点定义无 query 参数、无 has_more）。
- 401 实测（api.openai.com 无 key）：`{"error":{"message":"Missing bearer authentication in header","type":"invalid_request_error","param":null,"code":null}}`
- 第三方兼容端点常见坑（cc-switch 经验）：`data` 可能缺省（需按空数组处理）；有的网关 base_url 已含版本段（如 `/v4`）时端点是 `{base}/models` 而非 `{base}/v1/models`；部分端点有 UA 白名单。
- **codex 自身同构佐证**：CLI 内部 `OpenAiModelsEndpoint` 就是拼 `MODELS_ENDPOINT = "/models"` 到 provider base_url 拉模型目录（codex-rs/model-provider/src/models_endpoint.rs）。

来源：https://github.com/openai/openai-openapi (openapi.yaml)；https://api.openai.com/v1/models 实测

## 5. cc-switch 的模型选择交互（github.com/farion1231/cc-switch）

- **链路**：前端 `src/lib/api/model-fetch.ts` → `invoke("fetch_models_for_config", { baseUrl, apiKey, isFullUrl?, modelsUrl?, customUserAgent? })` → 后端 `src-tauri/src/services/model_fetch.rs` 用 reqwest GET 候选 URL，`Authorization: Bearer <apiKey>`，15s 超时。
- **候选 URL 策略**：`modelsUrl` 覆写优先；否则 base_url 以 `/v{N}` 结尾拼 `/models`、不然拼 `/v1/models`；命中已知 Anthropic 兼容子路径后缀（/anthropic、/api/coding 等）时剥后缀再试；404/405 换下一个候选，其他错误立刻终止。
- **UI 模式（`ModelInputWithFetch.tsx`）**：**始终是自由文本 Input**（手输兜底天然存在）+ 右侧图标按钮三态：未拉取=下载图标（点击才请求，无自动拉取）；加载中=spinner（禁用）；拉取成功=ChevronDown 下拉菜单，模型按 `owned_by` 分组展示，点选回填 Input。
- **无持久缓存**：结果存组件 state，每次打开表单重新拉；用 seq ref 防竞态。
- **错误 UX**：toast 分类提示——缺 key/缺 baseUrl 前端预检、401/403 鉴权失败、404/405 或全候选失败=端点不存在、超时、解析失败=不支持；空列表单独提示。

## 6. Custom agent 文件 schema（subagents 官方页，与本地 003 文档一致）

- 位置：`~/.codex/agents/*.toml`（个人）/ `.codex/agents/*.toml`（项目），一文件一 agent，`name` 字段是身份源（文件名只是惯例）。
- 必填：`name`、`description`、`developer_instructions`；可选：`nickname_candidates`（非空唯一字符串数组，ASCII 字母/数字/空格/连字符/下划线）、`model`、`model_reasoning_effort`、`sandbox_mode`、`mcp_servers`、`skills.config`（省略则继承父会话）。
- `[mcp_servers.<id>]` 两种形态：HTTP 型 `url`（+ `startup_timeout_sec`，默认10s；`bearer_token_env_var`、`http_headers`、`auth = oauth|chatgpt`…）；stdio 型 `command` + `args` + `env` + `cwd`。另有 `enabled`、`enabled_tools`/`disabled_tools`、`tool_timeout_sec`(默认60s)、`startup_timeout_ms` 别名等 —— 003 文档只展示了 url/startup_timeout_sec，实际字段更多。
- `[[skills.config]]`：`path`（指向 SKILL.md 绝对路径）+ `enabled`（bool）。
- 全局 `[agents]`：`max_threads`(默认6)、`max_depth`(默认1)、`job_max_runtime_seconds`(缺省1800)、`interrupt_message`(默认true)。

来源：https://developers.openai.com/codex/subagents ；https://developers.openai.com/codex/config-reference

## 7. 与本地文档 docs/official/003-codex-cli-docs.md 的对照

- effort 8 档说法 **正确**（与源码枚举完全一致）；反而是官方 config-reference 表格漏了 none/max/ultra。
- `gpt-5.6-sol` 003 未提及，但确认存在且是当前旗舰；003 的模型建议（gpt-5.6/terra/5.4/spark）与 models 页现状兼容。
- agent 文件 schema、[agents] 全局键、nickname 规则：003 与在线页逐条一致（003 就是该页快照）。
- 003 示例里 `[mcp_servers.chrome_devtools]` 的 `startup_timeout_sec` 用法有效；但完整字段表远多于示例。

## Caveats / Not Found

- 每个模型支持的 effort 档位没有公开的静态对照表（服务端目录下发）；文档只给了 gpt-5.6-sol 的 6 档选择器示例与"minimal/none 仅部分模型支持"的措辞。terra/luna/5.4/spark 的具体档位集未在文档中逐一列出。
- `/v1/models` 对第三方网关的行为差异大（data 缺省、路径变体、UA 白名单），实现时建议参考 cc-switch 的候选列表 + 宽松解析。
- deepwiki MCP 在本会话不可用，未使用；所有结论均来自一手源码/文档/实测，可信度更高。
