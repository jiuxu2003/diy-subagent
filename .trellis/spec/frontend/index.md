# Frontend Development Guidelines

> React and TypeScript conventions for the Tauri desktop application.

---

## Overview

The frontend is a React application built with TypeScript and Vite. It presents
platform-aware forms and previews, but it does not parse, render, discover, or
write native agent files. Those responsibilities stay in Rust. TanStack Query
owns asynchronous Tauri IPC state; local React state owns ephemeral UI state.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Feature-first React organization | Initial baseline |
| [Component Guidelines](./component-guidelines.md) | Components, forms, styling, and accessibility | Initial baseline |
| [Hook Guidelines](./hook-guidelines.md) | TanStack Query and typed Tauri hooks | Initial baseline |
| [State Management](./state-management.md) | Local, server, draft, and persistent state boundaries | Initial baseline |
| [Quality Guidelines](./quality-guidelines.md) | TypeScript quality gates and UI tests | Initial baseline |
| [Type Safety](./type-safety.md) | Strict types and runtime boundary validation | Initial baseline |

---

## Pre-Development Checklist

Before changing frontend code:

1. Read the relevant guide above.
2. Identify the owning feature and avoid adding business logic to shared UI.
3. Confirm the typed IPC request, response, and error contracts.
4. Decide whether state is local UI state, form draft state, or TanStack Query
   server state.
5. Test keyboard, screen-reader, loading, empty, invalid, and conflict states.

---

**Language**: All documentation and code comments should be written in English.
