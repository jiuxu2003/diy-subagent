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
