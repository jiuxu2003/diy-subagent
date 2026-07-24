# State Management

> Clear ownership for local UI, editable drafts, asynchronous IPC, and durable state.

---

## State Categories

| Category | Owner | Examples |
|----------|-------|----------|
| Local UI state | React component/reducer | selected tab, expanded section, dialog state |
| Editable draft state | Feature reducer/form | agent fields, dirty state, validation issues |
| Backend/server state | TanStack Query | discovered files, templates, previews, backups |
| Durable app state | Rust + SQLite/settings | favorites, registered projects, preferences |
| Native agent state | User-owned files | Claude/Codex/Cursor definitions |

Native agent state is never stored as authoritative frontend state. A loaded
definition includes a source revision/hash; commits must include that revision.

---

## Local and Global State

- Keep state local until two independent feature roots need the same ephemeral
  value.
- Use context for stable application services such as theme or localization.
- Use a reducer for workflows with explicit states and events.
- Do not introduce a global state library until a concrete cross-feature use
  case cannot be modeled by TanStack Query or a focused context.
- Never move TanStack Query data into a second global cache.
- Do not use `localStorage` as the source of truth for application settings or
  user-owned files.

> **Exception (2026-07-22)**: device-level, loss-tolerant UI preferences may
> live in `localStorage` when losing the value is harmless and no backend
> behavior depends on it. Contract: read through zod `safeParse` against the
> owning enum/schema and fall back to a hardcoded default on garbage or
> storage errors; wrap reads/writes in try/catch (locked-down webviews can
> throw). Current sanctioned key: `diy-subagent.platform` (selected platform
> tab, default `codex`) via `usePersistedPlatform`. Anything that affects data
> on disk (directories, favorites) still belongs to Rust settings/SQLite.

---

## Draft State

Agent editing uses a discriminated state machine:

```ts
type AgentEditorState =
  | { status: \"loading\" }
  | { status: \"editing\"; draft: AgentDraft; sourceRevision: string }
  | {
      status: \"previewing\";
      draft: AgentDraft;
      sourceRevision: string;
    }
  | {
      status: \"reviewing\";
      draft: AgentDraft;
      preview: AgentWritePreview;
    }
  | {
      status: \"conflict\";
      draft: AgentDraft;
      latestRevision: string;
    };
```

Every reducer switch is exhaustive. Do not represent this workflow with several
independent booleans such as `isLoading`, `isPreviewing`, `hasConflict`, and
`isSaving` that can become contradictory.

---

## Backend State

- TanStack Query cache is a view of Rust state, not an offline database.
- Query freshness is chosen by data volatility; native-file listings must
  refresh on app focus and after filesystem mutation.
- External filesystem changes invalidate affected queries through an explicit
  backend event or a scoped refresh.
- Optimistic updates are allowed only for application-owned metadata. Never
  optimistically claim that a native file write succeeded.
- Mutations display the committed backend result rather than reconstructing it
  from the submitted draft.

> **Convention (2026-07)**: when durable caching lives in Rust (e.g. the codex
> model catalog persisted under `app_data_dir`), the matching query uses
> `staleTime: Infinity` — the frontend never re-fetches on its own. A manual
> refresh is a mutation calling the same IPC with `forceRefresh: true` that
> writes its result back via `setQueryData`. Do not add a second frontend
> persistence layer on top. Fetch failures must degrade to a hint; features
> with a manual-input fallback (model name) must never block on the query.

---

## Common Mistakes

- Treating SQLite metadata, query cache, or a form draft as newer than the
  native file.
- Keeping prompt bodies or imported secrets in browser storage.
- Building one giant global store for editor, templates, settings, and projects.
- Deriving state in several components instead of one reducer or selector.
- Discarding an unsaved draft when a background refresh detects an external
  change; enter a conflict state and let the user compare.
