# Backend Development Guidelines

> Rust and Tauri backend conventions for the subagent configuration desktop app.

---

## Overview

The backend is a macOS-first Tauri 2 application written in Rust. It owns all
filesystem access, platform-format parsing and rendering, validation, backups,
atomic writes, SQLite persistence, and the typed IPC boundary exposed to the
TypeScript frontend.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Tauri commands, services, domain, adapters, and infrastructure | Initial baseline |
| [Database Guidelines](./database-guidelines.md) | SQLite metadata and template persistence | Initial baseline |
| [Error Handling](./error-handling.md) | Typed Rust errors and stable IPC error contracts | Initial baseline |
| [Quality Guidelines](./quality-guidelines.md) | Rust quality gates and contract tests | Initial baseline |
| [Logging Guidelines](./logging-guidelines.md) | Structured, privacy-safe application logs | Initial baseline |

---

## Pre-Development Checklist

Before changing backend code:

1. Read the relevant guide above.
2. Identify whether the change belongs to commands, services, domain, adapters,
   or infrastructure.
3. Map the complete native-file -> adapter -> domain -> IPC data flow.
4. Confirm validation, conflict detection, backup, atomic-write, and rollback
   behavior for every user-owned file mutation.
5. Add or update real contract fixtures and failure-path tests.

---

**Language**: All documentation and code comments should be written in English.
