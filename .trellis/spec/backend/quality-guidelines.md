# Quality Guidelines

> Correctness and safety gates for Rust, Tauri IPC, and user-owned files.

---

## Required Patterns

- Rust code is formatted with `cargo fmt` and passes Clippy with warnings denied.
- Public and cross-layer types have explicit ownership and serialization rules.
- Platform behavior is implemented through `AgentFormatAdapter`; services do
  not branch on file extensions or copy serializer logic.
- All external bytes, YAML/TOML/JSON values, IPC requests, and database rows are
  validated before becoming domain values.
- Native files remain the source of truth; previews use optimistic concurrency.
- Mutating operations follow this sequence:

```text
resolve safe target
-> read current bytes
-> parse and validate
-> render preview and diff
-> confirm expected source hash
-> write temporary file in same directory
-> flush/sync
-> create or verify backup
-> atomic rename
-> sync directory
-> re-read and validate
-> update derived SQLite metadata
```

- Unknown native fields are preserved during supported edits.
- Adding an `AgentPlatform` variant requires an explicit adapter-registry branch
  and exhaustive tests; there is no generic fallback to Claude.
- Tauri commands are thin and contain no business logic.

---

## Forbidden Patterns

- `unwrap`, `expect`, `panic!`, silent `let _ =`, or catch-all success fallbacks
  in runtime paths.
- Arbitrary filesystem paths supplied directly by the frontend.
- In-place truncation of a user configuration file.
- Writes without preview, backup policy, conflict detection, and post-write
  verification.
- Storing secrets or full user config bodies in SQLite or logs.
- One universal YAML schema pretending Claude, Codex, and Cursor are identical.
- Lossy parse-and-render behavior that silently deletes unknown fields.
- Mock production data or placeholder contract fixtures.
- Blocking filesystem or database work on the async UI execution path.

---

## Testing Requirements

Use real parsers, temporary directories, temporary SQLite databases, and
sanitized contract fixtures derived from official platform examples and
`docs/official/002-trellis-docs.md`. Do not replace production adapters with
mocks in integration tests.

Minimum coverage:

1. Adapter contract tests for Claude, Codex, and Cursor.
2. Parse-render-parse round trips preserving known and unknown fields.
3. Required-field and invalid-permission validation.
4. Exact, unsupported, and native-only capability mapping outcomes.
5. Project/user discovery and precedence conflicts.
6. Cursor compatibility discovery without duplicate native writes.
7. Safe-path, traversal, and symlink cases.
8. External-edit conflict between preview and commit.
9. Atomic-write failure at each stage, including rollback failure.
10. SQLite migration from the previous released schema.
11. Log redaction using realistic secret-shaped values.

Expected commands after scaffolding:

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```

---

## Scenario: Preview and Commit a Native Agent File

### 1. Scope / Trigger

This contract applies whenever the UI creates, updates, converts, installs, or
deletes a user-owned native agent definition. It prevents silent data loss,
stale-preview overwrites, path injection, and unsupported cross-platform
translation.

### 2. Signatures

```rust
#[tauri::command]
async fn preview_agent_write(
    request: PreviewAgentWriteRequestDto,
    state: tauri::State<'_, AppState>,
) -> Result<AgentWritePreviewDto, IpcErrorDto>;

#[tauri::command]
async fn commit_agent_write(
    request: CommitAgentWriteRequestDto,
    state: tauri::State<'_, AppState>,
) -> Result<AgentWriteResultDto, IpcErrorDto>;
```

The commit command accepts an opaque preview token. It does not accept rendered
file contents or an arbitrary destination path from the frontend.

### 3. Contracts

Preview request:

| Field | Type | Constraint |
|-------|------|------------|
| `platform` | `AgentPlatform` | Explicit Claude, Codex, or Cursor variant |
| `scope` | `AgentScope` | `project` or `user` |
| `projectId` | branded string or null | Required for project scope |
| `sourceId` | branded string or null | Required when updating an existing source |
| `expectedRevision` | string or null | Required for updates; null only for creates |
| `draft` | `AgentDraftDto` | Runtime-validated canonical draft |
| `targetPlatform` | `AgentPlatform` | May differ only for explicit conversion |

Preview response:

| Field | Type | Constraint |
|-------|------|------------|
| `previewToken` | opaque string | Short-lived and bound to user, target, and revision |
| `sourceRevision` | string or null | Revision observed while creating the preview |
| `targetPathLabel` | string | Display-safe path label, never unrestricted input |
| `nativeFormat` | enum | Markdown/YAML, TOML, or future JSON family |
| `diff` | structured diff | Generated from exact native bytes |
| `portabilityIssues` | `PortabilityIssueDto[]` | Exact, lossy, unsupported, or native-only |
| `willCreateBackup` | boolean | Computed backend policy |

Commit request:

| Field | Type | Constraint |
|-------|------|------------|
| `previewToken` | opaque string | Must reference an unexpired preview |
| `expectedRevision` | string or null | Must match the preview and current source |
| `acceptedIssueIds` | string[] | Only explicitly accept backend-marked lossy issues |

Commit response contains the committed revision, safe target label, optional
backup identifier, and the parsed canonical definition read back from disk.

### 4. Validation & Error Matrix

| Condition | Result |
|-----------|--------|
| Unknown platform or adapter unavailable | `agent.unsupported_platform` |
| Project scope without a registered project | `agent.project_required` |
| Invalid canonical or native field | `agent.validation_failed` with field issues |
| Target escapes the adapter-owned root or crosses an unsafe symlink | `agent.unsafe_path` |
| Source changed after preview | `agent.source_changed`; no write occurs |
| Preview expired or request fields do not match it | `agent.preview_invalid` |
| Unsupported field cannot be represented | Preview issue; commit remains blocked |
| Lossy issue not explicitly accepted | `agent.lossy_conversion_not_accepted` |
| Backup, write, sync, rename, or read-back verification fails | Typed stage error plus recovery state |

### 5. Good / Base / Bad Cases

- Good: update an existing Claude agent, preserve unknown frontmatter, preview
  the exact Markdown diff, atomically commit, and return the verified revision.
- Base: create a new Codex TOML agent with required fields, no prior revision,
  and a successful post-write parse.
- Bad: convert a Claude agent with hooks/MCP semantics to a target that cannot
  represent them and commit without showing or accepting portability issues.
- Bad: reuse a preview after the user edits the native file in another editor.

### 6. Tests Required

- Contract serialization test for both command request/response pairs.
- Create and update integration tests for all first-release adapters.
- Unknown-field preservation assertion on the exact read-back document.
- Source-revision conflict test asserting no target or metadata change.
- Path traversal and symlink escape tests asserting `agent.unsafe_path`.
- Expired/tampered preview token tests.
- Lossy conversion test asserting commit is blocked until only permitted issue
  IDs are accepted.
- Failure injection at backup, temporary write, sync, rename, and verification;
  assert recovery state and original-file integrity.

### 7. Wrong vs Correct

#### Wrong

```ts
await invoke(\"write_agent_file\", {
  path: form.path,
  contents: renderAgentInTheBrowser(form),
});
```

This trusts a frontend path, duplicates native rendering, has no source
revision, and cannot prove what was written.

#### Correct

```ts
const preview = await agentIpc.previewAgentWrite({
  platform,
  scope,
  projectId,
  sourceId,
  expectedRevision,
  draft,
  targetPlatform,
});

await agentIpc.commitAgentWrite({
  previewToken: preview.previewToken,
  expectedRevision: preview.sourceRevision,
  acceptedIssueIds,
});
```

The backend owns rendering, path resolution, conflict detection, backup,
atomic write, and read-back verification.

---

## Scenario: Rust DTO and Zod Contract Synchronization

### 1. Scope / Trigger

Apply this contract whenever a Rust enum with struct variants or an enum-keyed
map crosses Tauri IPC. These shapes are easy to compile independently while
serializing into JSON that the frontend rejects.

### 2. Signatures

```rust
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum DraftProvenance {
    Imported {
        source_id: String,
        expected_revision: String,
    },
}
```

```ts
const agentDraftSchema = z.object({
  platformOverrides: z.partialRecord(
    agentPlatformSchema,
    platformOverrideSchema,
  ),
});
```

### 3. Contracts

- `rename_all` controls enum variant names; `rename_all_fields` is required for
  fields inside every struct variant.
- Imported drafts contain only their native platform override. Template drafts
  may also be partial while editing; the backend completes missing explicit
  defaults before persisting a personal template that declares all platforms.
- In Zod 4, `z.record(z.enum(...), valueSchema)` is exhaustive. Use
  `z.partialRecord` only when missing enum keys are valid domain state.
- A platform override key must match the discriminated `platform` in its value;
  Rust domain validation remains authoritative for this invariant.
- Rust serialization and Zod parsing share a checked-in sanitized JSON fixture.
  Inline look-alike fixtures do not satisfy the cross-language contract.
- A platform-scoped inventory refresh replaces registry entries only for the
  refreshed platforms; sources from other platforms remain addressable.
- Recovery commands accept an opaque UUID such as `recoveryId`, never a path.

### 4. Validation & Error Matrix

| Condition | Required result |
|-----------|-----------------|
| Struct-variant field serializes as `source_id` | Contract test fails; add `rename_all_fields = "camelCase"` |
| Imported draft contains one platform override | Zod accepts it; backend restricts write-back to that platform |
| Override key and value platform differ | `agent.platform_override_mismatch` |
| Personal template declares a platform without an override | Complete the default before persistence or reject the package |
| Scoped refresh removes an unrelated platform source | Registry regression test fails |
| Recovery identifier is not a UUID or directory is missing | `agent.validation_failed` or `resource.not_found`; no Finder call |

### 5. Good / Base / Bad Cases

- Good: Rust serializes an imported Claude draft with `sourceId`, Zod parses the
  shared fixture, and only the Claude override is present.
- Base: a built-in template contains all three overrides and renders
  deterministically for every adapter.
- Bad: use exhaustive `z.record` for an imported draft and reject the valid
  single-platform payload.
- Bad: refresh Claude inventory by replacing the complete source registry,
  invalidating a still-visible Codex `sourceId`.

### 6. Tests Required

- One sanitized JSON fixture serialized by Rust and parsed by Zod.
- Serialization assertion for recovery struct fields such as `recoveryId`.
- Single-platform import fixtures for Claude, Codex, and Cursor.
- Personal-template persistence from an imported single-platform draft.
- Scoped inventory refresh preserving unrelated platform sources.
- Three-platform preview -> commit -> scan integration using temporary roots.

### 7. Wrong vs Correct

#### Wrong

```rust
#[serde(tag = "kind", rename_all = "camelCase")]
enum DraftProvenance {
    Imported { source_id: String },
}
```

```ts
platformOverrides: z.record(agentPlatformSchema, platformOverrideSchema)
```

The Rust field remains `source_id`, while Zod also incorrectly requires every
platform key.

#### Correct

```rust
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum DraftProvenance {
    Imported { source_id: String },
}
```

```ts
platformOverrides: z.partialRecord(
  agentPlatformSchema,
  platformOverrideSchema,
)
```

The serialized field and runtime schema now describe the same valid partial
draft state.

---

## Code Review Checklist

- [ ] The change has one clear owning layer.
- [ ] IPC DTOs do not leak database rows or parser-specific structures.
- [ ] Every new platform field has parsing, validation, rendering, and UI type
      coverage where applicable.
- [ ] Existing unknown fields and prompt bodies survive the change.
- [ ] File mutation is atomic, conflict-aware, recoverable, and tested.
- [ ] Logs and error payloads are free of secrets and full user paths.
- [ ] Database changes include an immutable migration and upgrade test.
- [ ] Tests exercise real adapters and failure paths, not only the happy path.
- [ ] Rust enum struct variants and Zod enum-keyed records use the intended
      casing and exhaustiveness semantics, backed by a shared fixture.
- [ ] The diff does not introduce duplicated platform mapping tables.
