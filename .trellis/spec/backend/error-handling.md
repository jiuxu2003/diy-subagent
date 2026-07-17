# Error Handling

> Typed Rust errors with a stable, localizable Tauri IPC contract.

---

## Overview

Use `thiserror` for typed errors. Preserve the original cause internally while
returning a stable business error code and safe structured details to the
frontend. Do not return debug strings, filesystem stack traces, or parser dumps
over IPC.

Errors are handled at the boundary that can add meaning:

- Parser/adapter: platform, field, and source-location context.
- Filesystem: operation, safe path label, and conflict/permission distinction.
- Repository: operation and constraint context.
- Service: business operation and rollback outcome.
- Tauri command: conversion to `IpcErrorDto` only.

---

## Error Taxonomy

`AppError` must distinguish at least:

- `UnsupportedPlatform`
- `InvalidAgentDefinition`
- `UnsupportedFieldValue`
- `DiscoveryFailed`
- `SourceChanged` for optimistic-concurrency conflicts
- `PermissionDenied`
- `UnsafePath`
- `BackupFailed`
- `AtomicWriteFailed`
- `VerificationFailed`
- `Database`
- `Migration`
- `Internal`

Use nested domain-specific error enums when a module has several actionable
variants. Convert them into `AppError` with `#[from]` rather than erasing them
into strings.

```rust
#[derive(Debug, thiserror::Error)]
pub enum AgentFormatError {
    #[error(\"missing required field '{field}' for {platform}\")]
    MissingField {
        platform: AgentPlatform,
        field: &'static str,
    },

    #[error(\"failed to parse {platform} agent definition\")]
    Parse {
        platform: AgentPlatform,
        #[source]
        source: Box<dyn std::error::Error + Send + Sync>,
    },
}
```

---

## Error Handling Patterns

- Use `Result<T, AppError>` across application services.
- Use `?` for propagation only after the receiving error type preserves useful
  context.
- Never use `unwrap`, `expect`, `panic!`, or ignored `Result` values in normal
  runtime paths.
- `anyhow` may be used only at executable startup or diagnostic tooling, not in
  domain/service/command public contracts.
- A failed write must report whether the original file is unchanged, restored,
  or requires manual recovery.
- Rollback failure is a separate error detail and must not hide the first error.
- Validation returns all independent field issues when safe, rather than making
  the user fix one field per attempt.
- Cancellation and timeout are explicit outcomes, not generic internal errors.

---

## IPC Error Contract

The frontend receives stable codes and parameters, then localizes the message.

```rust
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = \"camelCase\")]
pub struct IpcErrorDto {
    pub code: String,
    pub message: String,
    pub operation_id: String,
    pub field_errors: Vec<FieldErrorDto>,
    pub recovery: Option<RecoveryDto>,
}
```

Rules:

- `code` is stable and machine-readable, for example `agent.source_changed`.
- `message` is safe fallback text, not the sole UI contract.
- `operation_id` correlates the UI error with redacted logs.
- `field_errors` use canonical field paths plus optional native field names.
- `recovery` describes retry, refresh, restore-backup, or reveal-file actions.
- Never expose full home-directory paths; return a display-safe relative path.

---

## Common Mistakes

- Mapping every adapter error to `\"invalid config\"` and losing the field name.
- Logging an error and then returning success or an empty list.
- Returning parser or SQL messages directly to the UI.
- Catching a write error without checking whether the temporary file or backup
  needs cleanup.
- Treating unsupported future fields as corruption. Preserve unknown fields
  unless the native platform explicitly rejects them.
