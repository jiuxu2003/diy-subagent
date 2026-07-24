# Agent Draft & Template Contracts

> Executable contracts for the simplified agent draft (2026-07 codex-first
> rework), the codex adapter's TOML behavior, and builtin template packages.

---

## Scenario: AgentDraft Simplification (free-text developer instructions)

### 1. Scope / Trigger

Cross-layer IPC payload reshape. The former 13-section structured instruction
contract (`SharedInstructionContract` + `UsageContract` + `ResponseLanguage`
plus the `<!-- diy-subagent:structured:v1 -->` marker pipeline) was deleted.
The draft is now shape-isomorphic to a codex custom-agent file.

### 2. Signatures

```rust
// src-tauri/src/domain/agents/model.rs
pub struct AgentDraft {
    pub logical_name: String,
    pub description: String,
    pub developer_instructions: String,
    pub platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
    pub provenance: DraftProvenance,
}

pub struct CodexOverride {
    pub model: Option<String>,
    pub model_reasoning_effort: Option<String>, // none|minimal|low|medium|high|xhigh|max|ultra
    pub sandbox_mode: Option<String>,           // read-only|workspace-write|danger-full-access
    pub nickname_candidates: Vec<String>,
    pub extra_toml: Option<String>,             // raw TOML tables merged at render
}
// CodexOverride::RESERVED_TOP_LEVEL_KEYS is the single source of truth for the
// seven native codex keys; adapter parsing and extraToml validation both use it.
```

`validate_logical_name`: 2–64 bytes, first char `[a-z]`, rest `[a-z0-9-_]`,
no consecutive or trailing `-`/`_`. Underscores are allowed because official
codex agent names use them (`pr_explorer`).

### 3. Contracts

- Serde: `rename_all = "camelCase"` → IPC field is `developerInstructions`.
- Zod mirror: `agentDraftSchema` / `codexOverrideSchema` (`extraToml`
  nullable-optional) in `src/contracts/index.ts`.
- Dual lock: `tests/fixtures/import-agent-result-claude.json` is parsed by both
  `src-tauri/src/dto/mod.rs` tests and `src/contracts/index.test.ts`.
- Frontend required-field mirror: `src/lib/validation/agentDraft.ts` must stay
  in sync with `validate_agent_draft`.

### 4. Validation & Error Matrix

| Condition | Issue code (field) |
|-----------|--------------------|
| logical name violates format | `agent.invalid_logical_name` (`logicalName`) |
| empty description | required-text issue (`description`) |
| empty developer instructions | required-text issue (`developerInstructions`) |
| `extraToml` fails TOML parse | `agent.invalid_extra_toml` |
| `extraToml` top-level key ∈ RESERVED_TOP_LEVEL_KEYS | `agent.reserved_extra_toml_key` |

### 5. Good / Base / Bad Cases

- Good: `pr_explorer` draft with instructions + codex override
  `{model, effort, sandbox}` renders a TOML identical in meaning to the
  official docs example.
- Base: blank draft (all three text fields empty) is a legal *editing* state;
  preview/install is where required-field validation rejects it.
- Bad: extraToml `name = "x"` — rejected at validation, never silently
  overrides a native key at render.

### 6. Tests Required

- `domain/agents/validation.rs`: underscore names accepted; three required
  fields enforced; extraToml matrix above.
- `adapters/agents/codex.rs`: render merges extraToml; merge coexists with
  `original_bytes` preservation without duplicating tables; markerless files
  parse as editable.
- `services/templates.rs`: every builtin template renders deterministically and
  parses back editable.

### 7. Wrong vs Correct

**Wrong** (adding a new codex native field): read it ad hoc in the adapter and
leave validation/zod untouched — the field silently falls into
`preserved_fields` and drops on fresh installs.

**Correct**: add it to `CodexOverride` + `RESERVED_TOP_LEVEL_KEYS` + zod
`codexOverrideSchema` + shared fixture + adapter render/parse in one change.

---

## Design Decision: Always-Editable Parsing

**Context**: the marker pipeline made any hand-written codex file read-only.

**Decision**: a parseable native file is editable. `editable=false` survives
only for genuine data-protection cases: non-UTF-8 / unparsable input, and
markdown frontmatter that cannot round-trip losslessly (unsafe YAML: comments,
anchors, aliases, tags). Do not reintroduce content-based editability gates.

## Design Decision: `extra_toml` Carrier

**Context**: builtin templates need `[mcp_servers.*]` / `[[skills.config]]`,
but the preservation mechanism only works when the target file already exists.

**Decision**: one opaque raw-TOML string on `CodexOverride` instead of typed
models per table. Render parses the snippet and assigns top-level items with
same-key-overwrite semantics (no duplicate tables when overwriting an existing
install). Parse does **not** lift unknown tables back into `extra_toml` — the
existing `preserved_fields` + `original_bytes` path remains the only owner for
round-tripping, so the same data never has two competing sources.

---

## Template Package Contract

JSON shape (camelCase, one file per template in `src-tauri/resources/templates/`):

```json
{
  "manifest": { "id", "version", "name", "description", "author", "source",
                "tags", "supportedPlatforms", "risk": {"level", "summary"},
                "adapterContracts" },
  "logicalName": "...",
  "defaultDescription": "...",
  "developerInstructions": "...",
  "platformOverrides": { "<platform>": { "platform", "config" } }
}
```

- `developerInstructions` has `#[serde(default)]`: legacy personal templates
  (old shape on disk) still load, degrading to empty instructions.
- Startup validation (`validate_template`) checks **manifest only**: id format,
  non-empty version/name/description, non-empty `supportedPlatforms`, an
  override entry per supported platform, and logical-name format only when the
  name is non-empty. Draft-level required fields are enforced at preview time,
  not at load time.

> **Warning**: builtin templates are `include_str!`-compiled and validated in
> `TemplateRepository::load` during `AppState::from_paths`. An invalid builtin
> template prevents the app from starting. Any change to draft/template shape
> must update all seven JSON files in the same commit.

Builtin inventory (2026-07): `custom-blank` (empty starter; codex config
defaults `modelReasoningEffort: "medium"`, `sandboxMode: "read-only"`) plus the
six official codex examples `pr_explorer`, `reviewer`, `docs_researcher`,
`code_mapper`, `browser_debugger`, `ui_fixer` (codex-only,
`developerInstructions` verbatim from `docs/official/003-codex-cli-docs.md`).
