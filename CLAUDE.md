# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

DIY Subagent — a macOS-first Tauri 2 desktop app for authoring custom coding subagents and safely installing them into platform directories (Claude Code, Codex, Cursor). React 19 + TypeScript frontend, Rust backend.

## Commands

Package manager is pnpm (pinned via `packageManager` in package.json).

- `pnpm dev` — frontend dev server (port 1420, strict)
- `pnpm tauri:dev` — full desktop app (Vite + Rust backend)
- `pnpm build` — typecheck (`tsc -b`) + Vite bundle; `pnpm tauri:build` bundles the macOS app
- `pnpm lint` — ESLint with `--max-warnings=0`
- `pnpm typecheck` — `tsc -b` only
- `pnpm test` — Vitest unit tests (jsdom, excludes `tests/e2e/`)
  - single file: `pnpm vitest run src/contracts/index.test.ts`
  - by name: `pnpm vitest run -t "test name"`
- `pnpm test:e2e` — Playwright (starts its own `pnpm dev` server)

Rust checks run from `src-tauri/`:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
cargo test <name>        # single test
```

Playwright exercises the web frontend **without** the Rust backend, so e2e only covers non-IPC UI behavior (assertions use the Chinese UI strings, e.g. `模板`, `已安装`, `设置`). IPC-dependent logic is tested by Vitest contract tests (frontend) and cargo tests (backend).

## Architecture

Two layers over a typed IPC boundary.

**Ownership rule (from `.trellis/spec`):** the React frontend never parses, renders, discovers, or writes native agent files. All filesystem access, platform-format parsing/rendering, validation, backups, atomic writes, and SQLite persistence live in Rust.

### IPC contract (the load-bearing piece)

- `src-tauri/src/dto/mod.rs` — serde DTOs, all `#[serde(rename_all = "camelCase")]`; errors cross the boundary as `IpcErrorDto`.
- `src/contracts/index.ts` — zod schemas mirroring those DTOs. `src/contracts/index.test.ts` parses shared JSON fixtures from `tests/fixtures/` to lock both sides together.
- `src/lib/ipc/client.ts` — `appIpc`, the **only** place `invoke()` is called. Every response is `schema.parse()`d at runtime; errors normalize to `IpcError`. Tauri events are validated the same way (`useInventoryEvents` parses payloads with a zod schema).

Changing an IPC payload means updating together: Rust DTO + zod schema + `appIpc` method + fixture/contract tests. A new command additionally needs a `#[tauri::command]` in `src-tauri/src/commands/mod.rs` **and** registration in the `generate_handler![...]` list in `src-tauri/src/lib.rs`.

### Backend layering (`src-tauri/src/`)

`commands` → `services` → `domain`, with adapters and infrastructure injected through ports:

- `commands/` — thin handlers: wrap service calls in `run_blocking`, return `Result<_, IpcErrorDto>`.
- `services/` — `AgentApplicationService`, `TemplateService`, `SettingsService`; all dependencies are wired in `AppState::from_paths` (lib.rs), including a `Clock` port so time is injectable in tests.
- `domain/` — pure models and rules: agent model, validation, instruction contract, inventory, write plans; `ports/` defines the `AgentAdapter` and `Clock` traits.
- `adapters/agents/` — per-platform serialization (claude / codex / cursor) built on shared `markdown_yaml`, resolved via `registry.rs`.
- `infrastructure/` — SQLite (`database/`), atomic writes + safe paths + hashing (`filesystem/`), platform path resolution (`paths.rs`), `notify`-based `inventory_watcher` (emits Tauri events consumed by `useInventoryEvents`), `transaction.rs` (`BatchTransactionCoordinator` with backups), `write_plan_store.rs`.

### Key flow: two-phase install

Installs never write directly. `preview_agent_install` validates the draft, renders per-platform previews/diffs, and stores a write plan keyed by a token; `commit_agent_install` consumes that token and applies the plan through the transaction coordinator (backup → atomic write → rollback on failure). Editing an existing agent goes through `import_agent_for_editing` with an `expectedRevision` to detect concurrent modification.

### Frontend (`src/`)

Feature-first: `features/agents` (workflow: structured editor → preview/review → install result), `features/templates`, `features/settings`. TanStack Query owns all IPC/server state (query keys centralized in `src/lib/query/queryKeys.ts`); local React state is only for ephemeral UI. Shared primitives live in `components/ui` (Radix + CVA + `cn` from `src/lib/formatting/cn.ts`); styling is Tailwind 4 via the Vite plugin.

## Conventions

- This is a Trellis-managed project: workflow in `.trellis/workflow.md`, layer specs in `.trellis/spec/{backend,frontend,guides}/`. Read the relevant spec index before changing code in that layer. Session hooks in `.claude/settings.json` inject Trellis workflow state automatically.
- Code comments and documentation are written in English; user-facing UI and error strings are Simplified Chinese; commit messages use conventional-commit prefixes with Chinese subjects (see git log).
- `docs/` holds human research notes and `prompts/` holds developer↔LLM prompt logs — do not write into either directory without asking first.
