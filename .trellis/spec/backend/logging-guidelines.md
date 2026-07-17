# Logging Guidelines

> Structured, privacy-safe diagnostics for a local configuration editor.

---

## Overview

Use `tracing` for structured events and spans, with `tauri-plugin-log` as the
desktop log sink. Logs diagnose operations without becoming another copy of
the user's agent definitions.

Every user-triggered backend operation receives an `operation_id` span. Child
events inherit that span through command, service, adapter, repository, and
filesystem layers.

---

## Log Levels

- `trace`: parser state and low-level timings in developer builds only.
- `debug`: discovery counts, adapter selection, cache decisions, and query
  timing without content payloads.
- `info`: application lifecycle, completed imports/exports, migrations, backup
  creation, and successful writes.
- `warn`: recoverable parse issues, skipped unsupported fields, stale previews,
  cleanup failures, and retryable database contention.
- `error`: failed user operations, startup failures, migration failures,
  rollback failures, and invariant violations.

Do not use `error` for invalid user input that the UI can correct normally.

---

## Structured Fields

Prefer stable fields over formatted prose:

- `operation_id`
- `operation`
- `platform`
- `scope` (`project` or `user`)
- `agent_name`
- `path_label` or `path_hash`, never an unrestricted absolute path
- `adapter_version`
- `outcome`
- `error_code`
- `duration_ms`
- `items_scanned` / `items_changed`

```rust
#[tracing::instrument(
    skip(service, request),
    fields(
        operation = \"install_agent\",
        platform = %request.platform,
        scope = %request.scope,
        agent_name = %request.name,
    )
)]
pub async fn install_agent(
    service: &AgentService,
    request: InstallAgentRequest,
) -> Result<InstallAgentResult, AppError> {
    service.install(request).await
}
```

---

## What to Log

- Application version, schema version, and enabled feature flags at startup.
- Adapter chosen and native scope discovered.
- Counts and durations for discovery, validation, migration, and indexing.
- Preview creation and whether the source changed before commit.
- Backup identifier and safe destination label.
- Write/verify/rollback outcome as separate events.
- Stable error code and cause chain in local diagnostic logs.

---

## What Never Enters Logs

- API keys, access tokens, cookies, authorization headers, or environment values.
- Complete YAML frontmatter, TOML documents, JSON documents, or Markdown bodies.
- Subagent system prompts or template bodies.
- MCP server headers, bearer-token values, or expanded secret references.
- Full home-directory paths, usernames, repository remotes, or file contents.
- Raw IPC request/response bodies.

Redaction happens before an event is emitted. A downstream log filter is not a
substitute for safe call sites.

---

## Retention and Diagnostics

- Keep local logs bounded by size and rotation count.
- Crash logs follow the same redaction rules.
- Diagnostic export requires explicit user action and shows what will be shared.
- Tests assert that representative secret-shaped values never appear in logs.
