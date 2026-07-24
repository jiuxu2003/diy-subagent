# Codex 侧简化：官方示例模板与低门槛配置页

## Goal

把 Codex 侧的 subagent 创作流程从「理解九段式指令契约」降到「填名称、描述、指令三个框就能装」，同时让内置模板直接来自 Codex 官方文档的示例 agent。本轮只优化 Codex 侧；Claude / Cursor 仅保证编译与既有测试可通过，不做体验优化。

## Requirements

### R1 内置模板重做

- 删除现有 6 个预设模板：requirements-clarifier、architecture-mapper、docs-researcher、root-cause-debugger、code-reviewer、delivery-verifier。
- `custom-blank` 保留为「自定义」空白起点（用户已确认），并改造为新契约默认值：名称、描述、遵循指令为空；思考强度 `medium`；沙盒模式 `read-only`；三平台覆盖保留。
- 新增 6 个模板，内容来自 `docs/official/003-codex-cli-docs.md` 的示例 agent，**完整还原**（用户已确认）：
  - `pr_explorer`（gpt-5.3-codex-spark / medium / read-only）
  - `reviewer`（gpt-5.4 / high / read-only）
  - `docs_researcher`（gpt-5.4-mini / medium / read-only + `[mcp_servers.openaiDeveloperDocs]`）
  - `code_mapper`（gpt-5.4-mini / medium / read-only）
  - `browser_debugger`（gpt-5.4 / high / workspace-write + `[mcp_servers.chrome_devtools]` 含 `startup_timeout_sec`）
  - `ui_fixer`（gpt-5.3-codex-spark / medium，无 sandbox_mode + `[[skills.config]]`）
- `developer_instructions` 与模型配置保持文档英文原文；模板卡片的名称 / 描述（manifest 层）使用中文。
- 新模板 `supportedPlatforms` 仅 `codex`。
- 安装到 `~/.codex/agents/<name>.toml` 后的文件与文档示例语义一致（含 mcp_servers / skills 表）。

### R2 配置页（结构化编辑器）简化

- 主表单仅保留三个字段：
  - 名称（原生 `name`，默认空）
  - 描述（原生 `description`，默认空）
  - 遵循指令（原生 `developer_instructions`，多行自由文本，默认空）
- 删除「共享语义章节」（角色目标 / 适用场景 / 禁用场景 / 输入要求 / 执行步骤 / 输出契约 / 约束 / 停止条件 / 失败处理）与「语言与使用契约」（响应语言 / 显式调用示例 / 自动委派建议 / 安装后验证任务）两个整节。
- 模型 / 思考强度 / 沙盒模式**不上提**到主表单（用户已确认），继续留在「目标平台与高级字段」的 Codex 行内并在原位增强：
  - 思考强度：下拉选择，档位以 OpenAI 官方文档为准（本地文档口径：none / minimal / low / medium / high / xhigh / max / ultra，需研究确认），保留「继承」；新建默认 `medium`。
  - 沙盒模式：下拉 read-only / workspace-write / danger-full-access + 继承；新建默认 `read-only`。
- 「沙盒模式」「遵循指令」两个字段旁提供问号图标，悬停显示中文说明（tooltip）。
- 「目标平台与高级字段」「保存为个人模板」两个区域保留，不做结构调整。

### R3 模型下拉（参考 cc-switch）

- Codex 行的 `model` 字段支持从模型列表中选择：后端拉取 `{base_url}/models`（OpenAI 兼容 `/v1/models`）。
- base_url 与 api key 从 `~/.codex/config.toml` 解析：`model_provider` → `[model_providers.<id>]` 的 `base_url` 与内联 `api_key`；无内联 key 时回退 `~/.codex/auth.json` 的 `OPENAI_API_KEY`；无 provider 配置时回退官方 `https://api.openai.com/v1`（已在本机配置上验证该结构成立）。
- 拉取结果**本地缓存**，应用重启后不重新下载；提供手动刷新按钮强制重拉。
- 拉取失败 / 未配置 key / 列表为空时不阻塞：允许手动输入模型名。
- 遵循所有权规则：网络请求与配置文件读取全部在 Rust 侧，前端只经 IPC 取数。

### R4 指令契约放宽（简化的必然结果）

- Codex 渲染的 `developer_instructions` 为用户输入原文，不再嵌入 DIY 结构化标记。
- 存量「无结构化标记」的 codex agent 文件导入后应变为可编辑（当前会被判只读），未知 TOML 表继续按现有 preserved 机制保留。
- Claude / Cursor 适配器改为以 `developer_instructions` 作为正文渲染，仅保证编译与测试通过。

## Constraints

- 前端不触碰文件系统与平台格式（`.trellis/spec` 所有权规则）；IPC 变更需四件套同步：Rust DTO + zod schema + `appIpc` 方法 + fixtures/契约测试；新命令需注册 `generate_handler!`。
- UI 与错误文案简体中文，代码注释英文，conventional commit 中文主题。
- e2e 断言依赖中文 UI 字符串，删除章节后需同步更新。
- 不得在日志 / 代码 / 文档中泄露用户 api key。

## Acceptance Criteria

- [ ] 模板选择区仅显示「自定义」+ 6 个官方示例模板；旧 6 个模板不再出现。
- [ ] 选择 docs_researcher 并安装到 Codex 后，`~/.codex/agents/docs_researcher.toml` 包含 name / description / model / model_reasoning_effort / sandbox_mode / developer_instructions 及 `[mcp_servers.openaiDeveloperDocs]`。
- [ ] 新建页主表单只有 名称 / 描述 / 遵循指令 三个输入项；「共享语义章节」「语言与使用契约」不再渲染。
- [ ] 空白起点新建时：三个输入默认为空，Codex 高级区思考强度显示 medium、沙盒模式显示 read-only。
- [ ] 思考强度下拉档位与研究确认的官方口径一致；沙盒模式与遵循指令旁问号悬停出现中文说明。
- [ ] Codex 高级区 model 可从拉取的模型列表中选择；断网 / 无 key 时可手动输入；应用重启后列表来自缓存；刷新按钮可强制重拉。
- [ ] 手写的无标记 codex TOML（含 `[mcp_servers.*]`）导入后可编辑，保存回写不丢未知表。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 与 `cargo fmt --check`、`cargo clippy -D warnings`、`cargo test` 全部通过。

## Notes

- 用户决策记录：创建任务 ✔；custom-blank 保留 ✔；模型 / 思考强度 / 沙盒不上提主表单（维持在 Codex 高级区）✔；模板完整还原（含 mcp_servers 与 skills.config）✔。
- 本机 `~/.codex/config.toml` 实测结构：`model_provider = "cliproxyapi"`，provider 表含 `base_url` 与内联 `api_key`，`auth.json` 含 `OPENAI_API_KEY`；模型为 `gpt-5.6-sol`，effort 实际使用 high / xhigh。
- 研究产物见 `research/codebase.md`（代码内部链路）与 `research/external.md`（官方档位 / 配置解析 / cc-switch 模式）。
