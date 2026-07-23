# Quality Guidelines

> Quality gates for React, TypeScript, accessibility, and data-loss-sensitive workflows.

---

## Required Patterns

- TypeScript strict mode passes without suppressed errors.
- ESLint and formatting checks run in CI.
- Components consume feature hooks or typed view models, never raw Tauri calls.
- Async state uses TanStack Query; multi-step editor state uses a reducer.
- Every mutation exposes pending, success, recoverable error, and conflict UI.
- Native file changes always display a backend-generated preview/diff first.
- Platform switches are exhaustive and tested.
- Shared platform metadata has one owner; do not duplicate field maps in forms,
  validation, and display components.
- All user-visible strings are localization-ready.
- Accessibility is part of acceptance criteria, not a later pass.

---

## Forbidden Patterns

- `any`, unchecked casts, suppressed TypeScript errors, or disabled lint rules
  without a narrow documented reason.
- Direct `invoke` calls outside `src/lib/ipc/`.
- `useEffect` data fetching.
- A second global cache containing TanStack Query data.
- Saving a draft without preview and source-revision conflict detection.
- Mock or placeholder production data in shipped flows.
- Tests that replace the real IPC contract with a shape the backend never emits.
- Snapshot-only tests for forms, diffs, errors, or destructive operations.
- Platform-specific copies of whole screens when only a field set differs.
- UI that displays secrets, unrestricted absolute paths, or raw parser errors.

---

## Testing Requirements

Use Vitest and Testing Library. Tests use sanitized real contract fixtures from
official examples and `docs/official/002-trellis-docs.md`. Integration tests
exercise the real Rust command boundary in a temporary application environment
where practical; unit tests keep pure presentation logic independent of IPC.

Minimum coverage:

1. Claude, Codex, and Cursor platform field rendering.
2. Required-field, invalid-value, and unknown-field presentation.
3. Editor state transitions from load through preview, commit, and conflict.
4. Portability warnings for unsupported, lossy, and native-only fields.
5. Backend error-code mapping and recovery actions.
6. Keyboard navigation, focus restoration, labels, and announcements.
7. Light/dark appearance and long localized text.
8. Query-key scoping and mutation invalidation.
9. No direct native-file write path from the UI.

Expected commands after scaffolding:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

> **Gotcha (2026-07-23): fake timers + `@testing-library/user-event` hang under
> Vitest.** RTL v16's async wrapper drains microtasks with `setTimeout(0)` and
> only advances fake timers through a global `jest` object
> (`jestFakeTimersAreEnabled` in `@testing-library/react/dist/pure.js`); Vitest
> has no `jest` global, so every `userEvent` call awaits forever once
> `vi.useFakeTimers()` is active. Fix: in the test file's `beforeAll`, add
> `vi.stubGlobal("jest", { advanceTimersByTime: (ms) => vi.advanceTimersByTime(ms) })`.
> Harmless under real timers. Precedent: `src/app/App.test.tsx`.

---

## Code Review Checklist

- [ ] The change lives in the correct feature and exposes a small public API.
- [ ] Props and state cannot represent impossible combinations.
- [ ] IPC input/output is typed and runtime-validated.
- [ ] Loading, empty, invalid, conflict, and error states are visible.
- [ ] Keyboard and screen-reader behavior was verified.
- [ ] The UI never claims a write succeeded before the backend confirms it.
- [ ] Platform differences are localized and exhaustive.
- [ ] Tests use real contract shapes and assert behavior, not implementation.
- [ ] No secrets, raw prompts, or full home paths enter telemetry or UI errors.
