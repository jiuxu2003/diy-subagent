# Type Safety

> Strict TypeScript and runtime validation across UI, IPC, and platform contracts.

---

## Compiler Baseline

- Enable TypeScript `strict` mode and keep all strictness sub-options enabled.
- Do not use `any`, broad type assertions, or non-null assertions in product
  code.
- Treat data from Tauri IPC, imported files, deep links, and persisted settings
  as `unknown` until validated.
- Prefer `satisfies` for object conformance without widening literals.
- Exhaustive switches must end in a `never` assertion.

---

## Canonical Domain Types

The UI uses one canonical model for common editing workflows and a
discriminated extension for native differences.

```ts
export type AgentPlatform = \"claude\" | \"codex\" | \"cursor\";
export type AgentScope = \"project\" | \"user\";

export type AgentDefinition = {
  id: AgentId;
  platform: AgentPlatform;
  scope: AgentScope;
  name: string;
  description: string;
  instructions: string;
  capabilities: AgentCapabilities;
  source: AgentSource;
  native: AgentNativeExtension;
};

export type AgentNativeExtension =
  | { platform: \"claude\"; frontmatter: ClaudeAgentFields }
  | { platform: \"cursor\"; frontmatter: CursorAgentFields }
  | { platform: \"codex\"; config: CodexAgentFields };

export type PortabilityIssue =
  | { kind: \"unsupported\"; field: string; target: AgentPlatform }
  | { kind: \"lossy\"; field: string; target: AgentPlatform; explanation: string }
  | { kind: \"native-only\"; field: string; platform: AgentPlatform };
```

Rules:

- Do not flatten every native field into optional properties on one interface.
- Common fields are editable uniformly only when semantics actually match.
- Native extensions preserve supported platform-only fields.
- Unknown native fields remain represented in a round-trip preservation object
  owned by the backend; the frontend does not reinterpret them.
- Add new platform variants explicitly. Never use a default Claude branch.

---

## IPC Contracts

- IPC DTOs have one owner under `src/contracts/`.
- Prefer generated TypeScript bindings or schema-generated contracts from Rust.
  If generation is not yet available, keep one reviewed manual definition and
  a contract test comparing serialized examples from both languages.
- All IPC responses and errors are validated with Zod before use.
- Dates and paths cross IPC as explicit strings/integers with documented
  semantics, not JavaScript `Date` objects or platform-dependent path objects.
- IDs use branded string types when mixing them would be dangerous.
- Zod 4 enum-keyed records are exhaustive: use `z.record(enumSchema, value)`
  only when every key is required, and `z.partialRecord` when imported or
  editable domain state may contain a subset.
- For Rust enums with struct variants, require a shared JSON fixture that proves
  `rename_all_fields = "camelCase"` matches the Zod field names.

```ts
const ipcErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  operationId: z.string().min(1),
  fieldErrors: z.array(fieldErrorSchema),
  recovery: recoverySchema.nullable(),
});

export function parseIpcError(value: unknown): IpcError {
  return ipcErrorSchema.parse(value);
}
```

---

## Platform Contract Differences

The application must preserve these first-release differences:

| Platform | Native location | Native shape | Required core fields |
|----------|-----------------|--------------|----------------------|
| Claude Code | `.claude/agents/{name}.md` | YAML frontmatter + Markdown body | `name`, `description` |
| Cursor | `.cursor/agents/{name}.md` | YAML frontmatter + Markdown body | `name`, `description` |
| Codex | `.codex/agents/{name}.toml` | TOML configuration layer | `name`, `description`, `developer_instructions` |

Cursor may discover compatible Claude/Codex locations, but native Cursor writes
target `.cursor/agents/` unless the user explicitly selected an existing
compatible source. Discovery compatibility must not create duplicate writes.

The adapter architecture must remain capable of adding the Markdown, TOML, and
JSON format families documented in `docs/official/002-trellis-docs.md`.

---

## Validation

- Zod owns frontend form and IPC runtime validation.
- Rust adapters remain the authority for native platform validation.
- Frontend schemas must not claim that a native field is valid when the backend
  adapter rejects it.
- Validation issues contain canonical field paths, native field names where
  useful, and stable codes.
- Validate file names and agent identifiers separately; native platforms may
  identify an agent by a field rather than the filename.
- Never coerce malformed values silently. Show the original value and require an
  explicit correction or preservation choice.

---

## Forbidden Patterns

- `any`, `as unknown as T`, or non-null assertions used to bypass contracts.
- Re-declaring the same IPC payload inside multiple hooks/components.
- Stringly typed platform, scope, status, permission, or error codes.
- Optional fields that create impossible combinations instead of unions.
- Parsing YAML/TOML/Markdown in the browser.
- Treating a successful TypeScript compile as runtime validation.
