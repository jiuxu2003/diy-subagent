# Directory Structure

> Feature-first React organization for the subagent configuration application.

---

## Overview

Group product code by user workflow. Shared technical primitives stay small and
must not become a second business layer. Platform-specific form metadata may be
shared by features, but native parsing and rendering always remain in Rust.

---

## Directory Layout

```text
src/
├── app/
│   ├── App.tsx
│   ├── providers/              # Query client, theme, error boundary, i18n
│   └── routes/                 # Application-level navigation
├── features/
│   ├── agents/
│   │   ├── components/         # Agent list, editor, preview, conflict UI
│   │   ├── hooks/              # Feature queries and mutations
│   │   ├── schemas/            # UI/form validation schemas
│   │   ├── types/              # Feature view models
│   │   └── index.ts            # Public feature API only
│   ├── templates/
│   ├── projects/
│   ├── backups/
│   └── settings/
├── components/
│   └── ui/                     # shadcn/ui and Radix-based primitives
├── lib/
│   ├── ipc/                    # The only direct Tauri invoke wrapper
│   ├── query/                  # Query client and centralized query keys
│   ├── validation/             # Shared Zod helpers
│   └── formatting/             # Display-only pure functions
├── contracts/                  # Generated or centrally owned IPC contracts
├── locales/
├── styles/
└── test/
    ├── fixtures/               # Sanitized real platform contract samples
    └── render.tsx              # Shared test providers
```

---

## Module Boundaries

- A feature imports shared modules and its own internals.
- One feature may consume another feature only through that feature's
  `index.ts` public API.
- `components/ui/` contains reusable visual primitives with no Tauri calls,
  TanStack Query calls, or agent-platform branching.
- `lib/ipc/` is the only location allowed to call Tauri `invoke` directly.
- `contracts/` owns IPC DTOs and error envelopes. Do not redefine them inside
  components or hooks.
- Platform presentation metadata belongs to the agents feature. Native
  serialization rules do not.
- Route components compose features and perform no parsing or persistence.

---

## Naming Conventions

- Components and component files: `PascalCase.tsx`.
- Hooks: `useCamelCase.ts` and names beginning with `use`.
- Pure modules, schemas, and utilities: `camelCase.ts`.
- Tests: `*.test.ts` or `*.test.tsx` next to the owner when focused; broader
  integration tests live under `src/test/`.
- Feature public exports come from one `index.ts`; avoid deep cross-feature
  imports.
- Query keys are nouns; mutations are verbs.
- Platform identifiers use stable lowercase values: `claude`, `codex`,
  `cursor`.

---

## Canonical Example

```text
features/agents/
├── components/
│   ├── AgentEditor.tsx
│   ├── AgentFilePreview.tsx
│   └── PlatformFieldSet.tsx
├── hooks/
│   ├── useAgent.ts
│   ├── useAgentWritePreview.ts
│   └── useInstallAgent.ts
├── schemas/
│   └── agentDraftSchema.ts
├── types/
│   └── agentViewModel.ts
└── index.ts
```

Do not create separate Claude, Codex, and Cursor copies of the whole feature.
Use shared workflow components plus typed platform field sets.
