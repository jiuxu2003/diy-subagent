# Project Core

- Repository purpose: a macOS-first desktop app that helps users discover, author, validate, preview, install, and manage custom subagents instead of relying only on built-in agents.
- First supported platforms: Claude Code, Codex, and Cursor; design adapters for the broader Markdown/TOML/JSON format families documented in `docs/official/002-trellis-docs.md`.
- Native agent files are the source of truth. SQLite stores application-owned templates, indexes, settings, and metadata only.
- Trellis-managed workflow: task state lives under `.trellis/tasks/`; executable project guidance lives under `.trellis/spec/`.
- Do not write to `docs/` (human research) or `prompts/` (developer-LLM prompts) unless the user approves.
- User-facing discussion is Simplified Chinese; preserve original language for identifiers, commands, logs, and errors. Trellis backend/frontend guideline documents are English.
- For stack and architecture details, read `mem:tech_stack` and the relevant `.trellis/spec/` index.
- For project-specific workflow commands, read `mem:suggested_commands`.
- For editing and documentation rules, read `mem:conventions`.
- Before reporting a task complete, read `mem:task_completion`.