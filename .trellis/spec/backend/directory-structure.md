# Directory Structure

> Rust/Tauri backend layout for a multi-platform subagent configuration editor.

---

## Overview

The backend follows explicit dependency boundaries:

```text
Tauri command -> application service -> domain port -> infrastructure adapter
```

The first supported agent platforms are Claude Code, Codex, and Cursor. Their
native formats are intentionally different:

- Claude Code: Markdown plus YAML frontmatter under `.claude/agents/`.
- Cursor: Markdown plus YAML frontmatter under `.cursor/agents/`.
- Codex: standalone TOML files under `.codex/agents/`.

The domain layer owns one canonical model. Format-specific parsing, discovery,
precedence, and rendering stay behind adapters. Never spread platform checks
through Tauri commands or UI-facing DTOs.

---

## Directory Layout

```text
src-tauri/
├── Cargo.toml
├── migrations/                 # Ordered SQLite migrations
└── src/
    ├── lib.rs                  # Tauri builder and dependency wiring
    ├── main.rs                 # Minimal binary entry point
    ├── commands/               # Thin #[tauri::command] IPC handlers
    ├── services/               # Application use cases and orchestration
    ├── domain/
    │   ├── agents/             # Canonical AgentDefinition and capabilities
    │   ├── templates/          # Template and workflow domain models
    │   └── ports/              # Traits for adapters and repositories
    ├── adapters/
    │   └── agents/
    │       ├── claude.rs       # Markdown + YAML frontmatter
    │       ├── codex.rs        # TOML configuration layer
    │       ├── cursor.rs       # Native Cursor Markdown + compatibility rules
    │       └── registry.rs     # Exhaustive platform-to-adapter mapping
    ├── infrastructure/
    │   ├── filesystem/         # Discovery, backups, atomic writes, symlink policy
    │   ├── database/           # SQLite connection and repositories
    │   ├── logging/            # tracing and tauri-plugin-log setup
    │   └── macos/              # macOS-only integration behind traits
    ├── dto/                    # Serializable IPC request/response types
    └── error.rs                # AppError and stable IPC error conversion
```

Do not create a generic `utils` dumping ground. Put reusable code next to its
owner or behind a focused module such as `filesystem::atomic_write`.

---

## Module Responsibilities

### Commands

- Accept small, validated DTOs rather than arbitrary filesystem paths.
- Resolve dependencies and call exactly one application service operation.
- Contain no parsing, database queries, file writes, or platform branching.
- Return typed success DTOs or the stable IPC error envelope.

### Services

- Implement use cases such as discover, import, validate, preview, install,
  update, export, and delete.
- Coordinate adapters, repositories, backup policy, and atomic writes.
- Produce a preview/diff before any operation that changes a user-owned file.
- Treat native agent files as the source of truth; SQLite is derived metadata.

### Domain and Ports

- Domain types must not depend on Tauri, SQLite, or a concrete parser crate.
- Define traits for `AgentFormatAdapter`, `AgentFileStore`,
  `TemplateRepository`, and time/ID providers used by services.
- Model platform differences with enums and typed extension data, not maps of
  unchecked strings at every call site.

### Agent Adapters

Each adapter owns:

1. Native project and user paths.
2. Discovery and precedence rules.
3. Parsing from native bytes into the canonical model.
4. Validation of platform-specific required fields and permissions.
5. Rendering back to the platform's native syntax.
6. Preservation of unknown fields and prompt bodies during round trips.
7. Capability mapping results that distinguish exact, unsupported, and
   platform-native-only fields.

Adding a platform requires a new adapter plus an explicit registry branch.
Never let a new enum value fall through to Claude defaults.

Cross-platform conversion must never silently discard tool, permission, model,
hook, MCP, skill, or context-injection semantics. The adapter returns
portability issues for the preview UI; the service blocks a lossy write unless
the user explicitly accepts a supported downgrade.

### Infrastructure

- Filesystem code must protect against path traversal, unsafe symlinks, partial
  writes, and concurrent external edits.
- Database code implements repository traits but does not leak SQL rows into
  services or commands.
- macOS integration is isolated so future cross-platform support does not
  contaminate domain logic.

---

## Naming Conventions

- Rust modules and files: `snake_case`.
- Types, enums, and traits: `PascalCase`.
- Functions and variables: `snake_case`.
- Tauri commands: verb-first names such as `discover_agents` and
  `preview_agent_write`.
- Service methods use business verbs; repository methods use persistence verbs.
- Adapter modules use the product name (`claude`, `codex`, `cursor`), not a
  file extension such as `yaml` or `toml`.
- Error variants describe the failed operation, not an implementation detail.

---

## Canonical Example

This is the required shape for new use cases:

```rust
#[tauri::command]
pub async fn preview_agent_write(
    request: PreviewAgentWriteRequest,
    state: tauri::State<'_, AppState>,
) -> Result<AgentWritePreviewDto, IpcErrorDto> {
    state
        .agent_service
        .preview_write(request.try_into()?)
        .await
        .map(Into::into)
        .map_err(Into::into)
}
```

The command delegates immediately. Parsing, adapter selection, diff creation,
and filesystem access belong to the service and its ports.
