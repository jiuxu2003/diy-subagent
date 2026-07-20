# PRD: 平台检测改为根目录判定并优化已安装页空状态

## Goal

用户实测发现：本机装了 Claude Code / Codex / Cursor，但应用的"已安装"页什么都不显示，设置页把 claude/codex 目录标为"缺失"，看起来像"识别失败"。目标是让应用以**平台根目录**（`~/.claude`、`~/.codex`、`~/.cursor`）判断平台是否安装，并在 UI 上区分"平台已安装但暂无 subagent 文件"与"未检测到平台"。

## Background / Confirmed Facts

- 现状判定目录是 agents 子目录：`src-tauri/src/domain/agents/model.rs:24`（`.claude/agents` 等）；子目录不存在时 `PlatformPathResolver::describe` 返回 `Missing`（`src-tauri/src/infrastructure/paths.rs:88`），且测试将其视为正常状态（`paths.rs:137`）。
- "已安装"页只渲染扫描到的 agent 文件分组，`scan_installed_agents` 对不存在的根目录直接 `continue`（`src-tauri/src/services/agents.rs:131`），空目录/缺目录时页面只有一句"三个用户级目录中还没有发现原生 Agent 文件。"（`src/features/agents/components/InstalledPage.tsx:96`）。
- 用户机器实况：`~/.claude`、`~/.codex` 存在但无 `agents` 子目录；`~/.cursor/agents` 存在但为空。因此三个平台在 UI 上全部"不可见"，与用户预期不符。
- 结论：非扫描 bug，属于检测口径与状态呈现的产品缺陷。用户已选定方案：检测平台根目录。

## Requirements

1. **R1 平台检测口径**：后端新增"平台已检测"判定 —— 平台根目录（`~/.claude`、`~/.codex`、`~/.cursor`）存在即视为该平台已安装。`PlatformDirectory` DTO 增加对应字段（如 `platformDetected: boolean`），沿 IPC 契约链同步更新：Rust DTO + zod schema + fixtures/contract tests。
2. **R2 已安装页空状态**：agents 子目录缺失或为空时，"已安装"页按平台显示状态，而不是整页空白：
   - 平台根目录存在、无 agent 文件 → "已安装 <平台>，暂无 subagent"。
   - 平台根目录不存在 → "未检测到 <平台>"。
3. **R3 设置页文案**：设置页对 `missing` 的展示区分"平台未安装"与"平台已装但 agents 目录未创建（安装确认后自动创建）"，避免被解读为识别失败。
4. **R4 零破坏**：安装流程（两阶段 preview/commit、缺失目录在 commit 时创建）与扫描行为保持不变；仅新增状态字段与 UI 展示，向后兼容。

## Acceptance Criteria

- AC1：存在 `~/.claude` 但无 `~/.claude/agents` 时，"已安装"页显示 Claude 平台"已安装、暂无 subagent"（R1/R2）。
- AC2：`~/.cursor/agents` 为空目录时，Cursor 显示"已安装、暂无 subagent"（R2）。
- AC3：根目录不存在的平台显示"未检测到"（R2）。
- AC4：契约测试锁定新字段：`src/contracts/index.test.ts` + `tests/fixtures/` + Rust DTO/paths 测试全部通过（R1）。
- AC5：cargo / vitest / lint / typecheck 全绿，安装流程行为不变（R4）。

## Out of Scope

- 通过 CLI 可执行文件（PATH 探测）判断平台安装。
- 修改各平台默认 agents 路径口径本身。
- inventory watcher 监听范围调整（仍监听 agents 子目录）。

## Open Questions

- 无（检测口径已由用户选定为"平台根目录存在"）。
