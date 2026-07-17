# Tech Stack

- Desktop shell: Tauri 2, macOS-first.
- Frontend: React, TypeScript strict mode, Vite, TanStack Query, Tailwind CSS, and shadcn/ui/Radix primitives.
- Backend: Rust with thin Tauri commands, application services, canonical domain models, platform adapters, and infrastructure repositories.
- Persistence: SQLite via `rusqlite` for application-owned metadata; template bodies and native agent definitions remain file-backed.
- Validation: Zod at TypeScript form/IPC boundaries and typed Rust validation in native format adapters.
- Errors/logging: `thiserror`, structured `tracing`, and a Tauri desktop log sink with strict redaction.
- Tests: Vitest and Testing Library on the frontend; Rust unit/integration tests with real parsers, temporary files, and temporary SQLite databases.
- Re-check live manifests for exact dependency versions and commands once application scaffolding exists.