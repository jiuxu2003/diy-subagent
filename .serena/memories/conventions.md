# Conventions

- Read before editing; keep changes minimal, reviewable, and grounded in actual repository usage or explicitly confirmed bootstrap decisions.
- Trellis backend/frontend guideline files are written in English even though user interaction is in Simplified Chinese.
- Native Claude/Codex/Cursor files are authoritative; previews, conflict detection, backups, atomic writes, and post-write verification are mandatory.
- Keep one canonical agent domain model and isolate native Markdown/TOML/JSON behavior behind platform adapters.
- Cross-platform conversion must report unsupported, lossy, and platform-native-only semantics; never silently discard fields or permissions.
- Avoid mock/placeholder production data; validate external inputs explicitly and handle boundary errors with business meaning.
- Prefer strict typing and explicit error handling; do not swallow exceptions.
- Preserve unrelated user changes in a dirty worktree.
- Ask before creating content in `docs/` or `prompts/`.
- Use existing files before creating new files, unless the workflow explicitly requires a new artifact.