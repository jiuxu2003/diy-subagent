# Hook Guidelines

> Typed React hooks for Tauri IPC, TanStack Query, and feature workflows.

---

## Overview

TanStack Query owns all asynchronous data obtained from Rust: discovered
agents, templates, projects, previews, backups, and settings. React hooks expose
feature-level operations without leaking command names or transport details to
components.

---

## IPC Hooks

- Direct Tauri `invoke` calls are allowed only in `src/lib/ipc/`.
- The IPC client validates every response and error envelope at runtime.
- Feature hooks call typed IPC client methods; they never pass raw command
  strings.
- Query hooks return domain/view types with stable loading and error states.
- Mutation hooks invalidate or update only the query keys they own.
- Cancellation signals are forwarded where the backend operation supports them.

```ts
export function useAgent(platform: AgentPlatform, sourceId: AgentSourceId) {
  return useQuery({
    queryKey: agentQueryKeys.detail(platform, sourceId),
    queryFn: () => agentIpc.getAgent({ platform, sourceId }),
  });
}

export function useInstallAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: agentIpc.installAgent,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({
        queryKey: agentQueryKeys.scope(result.platform, result.scope),
      });
    },
  });
}
```

---

## Query Keys

- Define keys in `src/lib/query/*QueryKeys.ts`.
- Keys include every input that changes the result: platform, scope, project,
  source revision, filters, and pagination.
- Do not use display labels or localized text in keys.
- Do not duplicate string literals across hooks.
- A list key must be a prefix of its detail keys only when invalidating the list
  should intentionally affect those details.

---

## Custom Hook Patterns

- A hook owns one cohesive workflow, not an arbitrary collection of state.
- Return named values, not long positional tuples.
- Keep pure transformations outside hooks so they are testable without React.
- Use reducers for multi-step editor/preview/commit state transitions.
- Side effects belong in query/mutation callbacks or one focused effect.
- Never use `useEffect` as a replacement for a query or mutation.
- Never mirror query data into local state unless creating an explicit editable
  draft with a source revision.

---

## Agent Editing Workflow

The canonical workflow is:

```text
load native definition
-> create validated draft
-> request backend preview
-> show native diff and warnings
-> commit using preview source revision
-> handle success or source-changed conflict
```

The preview hook and commit hook are separate. A commit mutation requires the
preview token/source revision; it must not silently regenerate a different
preview.

The authoritative request/response and error contract is defined in
[Backend Quality Guidelines](../backend/quality-guidelines.md#scenario-preview-and-commit-a-native-agent-file).

---

## Common Mistakes

- Calling the same IPC command from several hooks with different validation.
- Using array indexes or object identity in query keys.
- Invalidating every query after any mutation.
- Copying server state into a global store.
- Swallowing a rejected mutation and showing a success toast.
- Retrying validation, permission, conflict, or unsafe-path errors as though
  they were transient network failures.
