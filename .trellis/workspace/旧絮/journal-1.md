# Journal - 旧絮 (Part 1)

> AI development session journal
> Started: 2026-07-17

---



## Session 1: Bootstrap 项目开发规范

**Date**: 2026-07-17
**Task**: Bootstrap 项目开发规范
**Branch**: `feat/bootstrap`

### Summary

基于 Tauri 2、React、TypeScript 和 Rust 建立前后端开发规范，定义 Claude、Codex、Cursor 的平台适配契约、原生文件事实源、SQLite 元数据边界、预览与原子写入流程，并初始化 Serena 项目记忆。

### Main Changes

- Populated all backend and frontend Trellis guideline files with the confirmed
  Tauri 2, React, TypeScript, Rust, TanStack Query, and SQLite baseline.
- Defined canonical multi-platform agent adapters and a preview/commit contract
  for Claude Code, Codex, and Cursor native files.
- Added validation, error, logging, accessibility, test, backup, conflict, and
  atomic-write requirements with executable examples.
- Initialized Serena project memories for architecture, stack, conventions,
  commands, and task-completion checks.

### Git Commits

| Hash | Message |
|------|---------|
| `04907c1` | docs: 完善全栈开发规范与 agent 适配契约 |
| `6c01cf5` | chore: 初始化 Serena 项目记忆 |

### Testing

- `git diff --check`
- `python3 ./.trellis/scripts/task.py validate 00-bootstrap-guidelines`
- Full semantic, local-link, language, code-fence, placeholder, and cross-layer
  contract validation across 13 spec/index files and the task PRD
- Verified no changes under `docs/` or `prompts/`

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 2: 完成 macOS Subagent 工作流管理器 MVP

**Date**: 2026-07-20
**Task**: 完成 macOS Subagent 工作流管理器 MVP
**Branch**: `feat/first-commit`

### Summary

完成三平台 Subagent 工作流管理器 MVP、跨层契约与 Codex 调研文档，验证前后端质量门禁及 macOS 打包，并归档任务。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `7279f85` | (see git log) |
| `165040d` | (see git log) |
| `3a1b532` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: GitHub Actions CI 回归与 macOS 自动发行流水线

**Date**: 2026-07-20
**Task**: GitHub Actions CI 回归与 macOS 自动发行流水线
**Branch**: `main`

### Summary

确认 mac app 构建可行后落地两条流水线：ci.yml 双 job 跑前端四件套与 Rust 三件套（PR/push main 双路径实测绿），release.yml 由 v* tag 触发做三处版本一致性校验、复用 CI 检查并经 tauri-action 产出未签名 aarch64 dmg 挂 draft release（v0.1.0 实测通过，错误 tag 被拦截）。dmg 真机挂载启动验证，签名接口以注释块预留，CI 契约与三个实测坑位沉淀至 spec/backend/ci-release-pipeline.md。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `81428c3` | (see git log) |
| `38f53f4` | (see git log) |
| `49b21fe` | (see git log) |
| `f1b217c` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: UI 视觉重构与细节修复（beauty-ui）

**Date**: 2026-07-22
**Task**: UI 视觉重构与细节修复（beauty-ui）
**Branch**: `feat/beauty-ui`

### Summary

按 macOS 原生工具风完成全站 UI 重构：透明留白重制应用图标、复制反馈状态机、系统蓝 token 与 Overlay 原生外壳、UI 原语重设（删 Badge/Card 增 StatusDot）、六屏重构与文案去术语化。经 Open Design 两轮评审落地 14px 字阶、IBM Plex Mono、品牌层三身份位、代码块随主题。修复 Radix 自绘下拉、窗口拖拽权限（core:window:allow-start-dragging）与拖拽区 closest 匹配吞点击问题，默认窗口调整为 1200x780。全程 lint/typecheck/15 单测/e2e 绿。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `ff52599` | (see git log) |
| `d743214` | (see git log) |
| `640e2fa` | (see git log) |
| `525c58c` | (see git log) |
| `4619bae` | (see git log) |
| `1f68cf7` | (see git log) |
| `d656842` | (see git log) |
| `15b584c` | (see git log) |
| `83e14a8` | (see git log) |
| `a72c42e` | (see git log) |
| `2d8f990` | (see git log) |
| `1873005` | (see git log) |
| `d52c1f0` | (see git log) |
| `4579671` | (see git log) |
| `a20b7d4` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 5: CC-Switch 风格 UI 整体重绘（v0.3.0）

**Date**: 2026-07-23
**Task**: CC-Switch 风格 UI 整体重绘（v0.3.0）
**Branch**: `feat/ccswitch-ui`

### Summary

按 CC-Switch 设计语言整体重绘六屏并调整 IA：去侧栏改双层顶栏（平台分段切换/紫蓝圆形加号），首页改为按平台的已安装 agent 卡片列表，模板并入单页胶囊新建流程（新增内置空白模板 custom-blank）；新增 Pill/SegmentedControl/Toast 原语，删除 StatusDot/TemplateLibrary/TemplatesPage；四轮走查反馈闭环（品牌区两段式与放大、底栏去 sticky、keepPreviousData 消胶囊切换闪烁、卡片操作精简为编辑、状态胶囊仅异常态、顶栏控件仅首页、刷新最小旋转+Toast、rem 字号随窗宽 16-19px 缩放、默认窗口 1000x700）；IPC 契约零改动，版本升 0.3.0，PR #5 已拉起；规范同步 CC-Switch 视觉基线/拖拽区/localStorage 例外/vitest 假计时器坑。

### Main Changes

- Detailed change bullets were not supplied; see the summary above.

### Git Commits

| Hash | Message |
|------|---------|
| `8a65cdd` | (see git log) |
| `6b4404d` | (see git log) |
| `ade5ca2` | (see git log) |
| `7b41082` | (see git log) |
| `366f085` | (see git log) |
| `5a0b21b` | (see git log) |
| `81e2824` | (see git log) |

### Testing

- Validation was not recorded for this session.

### Status

[OK] **Completed**

### Next Steps

- None - task complete
