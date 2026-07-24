# Implement — Codex 侧简化：官方示例模板与低门槛配置页

> 执行顺序按「保持可编译的最大原子块」划分。Stage A 是牵一发动全身的契约重构，必须整块完成后才跑得过编译；Stage B 独立，可与 A 换序。工作分支：`feat/codex-subagent`。

## Stage A — Rust 契约重构（draft / 适配器 / 模板）

- [x] A1 `domain/agents/model.rs`：`AgentDraft` 换形（删 shared/usage/responseLanguage，加 `developer_instructions`）；`CodexOverride` 加 `extra_toml: Option<String>`；删除 `SharedInstructionContract`/`UsageContract`/`ResponseLanguage`。
- [x] A2 `domain/agents/validation.rs`：logical name 字符集放宽（`_`）；必填收敛为 name/description/developerInstructions；新增 extraToml 可解析 + known-field 冲突校验；重写本文件测试。
- [x] A3 删除 `domain/agents/instruction_contract.rs`，清理 `domain/agents/mod.rs` 导出。
- [x] A4 `adapters/agents/codex.rs`：render 写指令原文 + extraToml 合并；parse 去 marker 化（editable 恒真）；更新测试（含 extraToml 合并、与 original_bytes 并存、known-field 覆盖被校验拒绝）。
- [x] A5 `adapters/agents/markdown_yaml.rs`（及 claude/cursor 适配器引用处）：正文 ⇄ `developer_instructions` 直通；更新测试到编译与断言通过。
- [x] A6 `domain/templates/model.rs`：TemplatePackage 换形（`developer_instructions` 带 `#[serde(default)]`）；`to_draft` 同步。
- [x] A7 `resources/templates/`：删 6 份旧 JSON；重写 `custom-blank.json`（空值 + codex 默认 medium/read-only）；新建 6 份官方示例 JSON（内容按 design.md §3 表格，指令为文档英文原文）。
- [x] A8 `infrastructure/templates/mod.rs`：`BUILTIN_TEMPLATES` 数组更新；`validate_template` 放宽（去 draft 全量校验、空 logicalName 合法）。
- [x] A9 `services/agents.rs` / `services/templates.rs` / `dto/mod.rs` / `infrastructure/transaction.rs` 内嵌 sample_draft 与断言全量跟随；`services/templates.rs` 重写为 7 模板新断言（数量、custom-blank 置顶数据、codex-only 模板逐个确定性渲染 + parse 回读 editable）。
- [x] A10 验证：`cargo fmt --all -- --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features`（在 `src-tauri/` 执行）。
- 回滚点：Stage A 单独成 commit 粒度；失败可 `git restore` 整块退回，不影响 B。

## Stage B — 模型列表后端链路

- [x] B1 `src-tauri/Cargo.toml` 加 `reqwest`（blocking + json + rustls-tls，default-features=false）。
- [x] B2 新建 `infrastructure/codex_config.rs`：`resolve_codex_endpoint` 纯函数 + 单测（内联 api_key / env_key / auth.json 兜底 / 无 provider 默认官方 URL / 畸形 TOML 报错）。
- [x] B3 新建 `services/model_catalog.rs`：`ModelListFetcher` 端口 + reqwest 生产实现 + 文件缓存（`write_atomic` 至 app_data_dir，按 base_url 命中）；单测覆盖缓存命中、force_refresh、失败回退缓存、无缓存报错；错误串不含 key。
- [x] B4 `commands/mod.rs` 加 `list_codex_models`（`run_blocking`）；`dto/mod.rs` 加请求/响应 DTO；`lib.rs` 注册 handler + `AppState` 装配 service。
- [x] B5 验证：同 A10 三连；额外 `cargo test model_catalog codex_config`。
- 回滚点：B 整体独立，可单独 revert。

## Stage C — 前端契约与编辑器

- [x] C1 `src/contracts/index.ts`：draft/codexOverride/templatePackage 新形状 + `codexModelListSchema`；`src/lib/validation/agentDraft.ts` 三必填复刻；`contracts/index.test.ts` 内嵌常量重写。
- [x] C2 `tests/fixtures/import-agent-result-claude.json` 重写为新形状（与 Rust `dto/mod.rs` fixture 测试同批对齐，回跑 cargo 该测试确认双边锁定）。
- [x] C3 `src/lib/ipc/client.ts` 加 `listCodexModels`；`src/lib/query/queryKeys.ts` 加 `codexModels`；新建 `features/agents/hooks/useCodexModels.ts`。
- [x] C4 新建 `components/ui/Tooltip.tsx`（Radix 封装 + `HelpTip` 问号）。
- [x] C5 `StructuredEditor.tsx` 重写：三字段主表单（遵循指令带 HelpTip）；删两大节；Codex 高级行 model=Input+datalist+刷新钮、effort 档位扩展（以 `research/external.md` 确认口径为准）、sandbox 带 HelpTip；`createPlatformOverride("codex")` 预置 medium/read-only。
- [x] C6 `editorState.ts`（createDraftFromTemplate 等）、`AgentWorkflow.tsx`、`PreviewReview.tsx`、`InstallSuccess.tsx` 去除已删字段引用。
- [x] C7 组件/类型测试跟随：`StructuredEditor.test.tsx`（新表单 + 默认值 + datalist/刷新 + tooltip）、`CreatePage.test.tsx`（新模板清单 mock）、`editorState.test.ts`、`PreviewReview.test.tsx`、`InstallSuccess.test.tsx`、`App.test.tsx`/`HomePage.test.tsx` 受牵连处。
- [x] C8 验证：`pnpm lint && pnpm typecheck && pnpm test`。

## Stage D — 全量验收

- [x] D1 `pnpm build`（tsc -b + vite）。
- [x] D2 `pnpm test:e2e`（如壳层文案未动应直绿；若断言受影响按 PRD 约束更新中文断言）。
- [x] D3 cargo 三连全量重跑（A10 命令）。
- [ ] D4 人工冒烟（`pnpm tauri:dev`）：① 模板区 = 自定义 + 6 官方；② 选 docs_researcher 预览 TOML 含 mcp_servers 表；③ 空白新建默认值正确、三字段可装；④ model 下拉出列表、断网可手输、重启走缓存、刷新强拉；⑤ 手写无 marker TOML 导入可编辑。
- [ ] D5 对照 `prd.md` Acceptance Criteria 逐条勾验。

## 复查门

- Stage A/B/C 各自验证命令绿后才进下一阶段；D4 冒烟中涉及真实网络与 `~/.codex` 读取，只读操作，不写用户配置。
- 完成后走 Phase 3：`trellis-check` 全量质检 → spec 更新（新契约写入 `.trellis/spec`）→ 中文 conventional commit。
