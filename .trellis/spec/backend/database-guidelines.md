# Database Guidelines

> SQLite persistence for application-owned metadata, templates, and settings.

---

## Source-of-Truth Boundary

Native files under `.claude/agents/`, `.codex/agents/`, `.cursor/agents/`, and
their user-level equivalents are the authoritative agent definitions. SQLite
must never become a second authoritative copy of those files.

SQLite stores only application-owned data:

- Built-in and user-installed template metadata.
- Tags, favorites, provenance, and compatibility information.
- Project registrations and normalized discovery indexes.
- Application settings and non-secret UI preferences.
- Optional hashes and modification metadata used to detect external changes.
- Backup manifests, never the only copy of backup bytes.

Template bodies are also file-backed:

- Built-in templates are versioned, read-only application resources.
- User-authored and installed templates live as documents plus manifests in the
  application's support directory.
- SQLite indexes template identity, provenance, version, compatibility, tags,
  and content hashes. It is not the only copy of a template body.
- Template import reads and validates the file first, then updates the index in
  a transaction after the file operation succeeds.

On every edit flow, re-read the native file and compare its current metadata to
the preview base. If it changed externally, stop with a conflict error.

---

## Library and Connection Rules

- Use SQLite through `rusqlite` behind repository traits.
- Enable foreign keys for every connection.
- Use WAL mode when supported by the app data location.
- Set a bounded busy timeout; never retry writes forever.
- Keep connection ownership in infrastructure code, not Tauri commands.
- Never construct SQL with string interpolation. Use bound parameters.
- Do not store API keys, access tokens, prompt bodies containing secrets, or
  complete copies of user configuration files in SQLite.

---

## Query and Transaction Patterns

- Repository methods return domain types, not tuples or raw SQLite rows.
- Multi-table changes and index updates run inside one transaction.
- Batch writes use prepared statements within the same transaction.
- Reads must request explicit columns; avoid `SELECT *` in production code.
- Paginate potentially unbounded template/history queries.
- Store timestamps as UTC Unix milliseconds and convert at the boundary.
- Store booleans as constrained integers and validate enum-like text values.

```rust
pub fn save_template(&self, template: &TemplateRecord) -> Result<(), AppError> {
    let mut connection = self.connection.lock()?;
    let transaction = connection.transaction()?;

    transaction.execute(
        \"INSERT INTO templates (id, name, platform_family, updated_at_ms)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           platform_family = excluded.platform_family,
           updated_at_ms = excluded.updated_at_ms\",
        rusqlite::params![
            template.id,
            template.name,
            template.platform_family.as_str(),
            template.updated_at_ms,
        ],
    )?;

    transaction.commit()?;
    Ok(())
}
```

---

## Migrations

- Store ordered, immutable migrations under `src-tauri/migrations/`.
- Every schema change adds a migration; never edit an applied migration.
- Record the applied migration version in the database.
- Run migrations before repositories become available to commands.
- Migration failure must abort startup with a recoverable diagnostic; never
  silently recreate or delete the database.
- Add an upgrade test starting from the previous released schema.
- Back up the application database before destructive migrations.

---

## Naming Conventions

- Tables and columns: plural `snake_case` tables and singular field names.
- Primary keys: `id`; foreign keys: `<entity>_id`.
- Timestamp fields: `<event>_at_ms`.
- Boolean fields: `is_<state>` or `has_<property>`.
- Unique indexes: `ux_<table>_<columns>`.
- Non-unique indexes: `ix_<table>_<columns>`.
- Migration files: `<zero-padded-version>_<description>.sql`.

---

## Common Mistakes

- Treating cached database content as newer than a user-edited native file.
- Persisting secrets extracted from frontmatter, TOML, MCP configuration, or
  environment-variable expansions.
- Storing template bodies only in SQLite, making them opaque to backup,
  versioning, review, and recovery workflows.
- Updating the database before the filesystem write has committed, leaving the
  UI index ahead of reality.
- Running an unbounded scan or migration on the Tauri UI thread.
- Using SQLite transactions as a substitute for atomic filesystem writes; the
  two resources require explicit compensation and conflict handling.
