PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS platform_directories (
  platform TEXT PRIMARY KEY NOT NULL,
  override_path TEXT,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS imported_sources (
  id TEXT PRIMARY KEY NOT NULL,
  platform TEXT NOT NULL,
  path_hash TEXT NOT NULL,
  revision TEXT NOT NULL,
  adapter_contract_version TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  imported_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS template_index (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  source TEXT NOT NULL,
  name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);

CREATE INDEX IF NOT EXISTS ix_template_index_source_name
  ON template_index(source, name);

CREATE UNIQUE INDEX IF NOT EXISTS ux_imported_sources_platform_path_hash
  ON imported_sources(platform, path_hash);

CREATE TABLE IF NOT EXISTS backup_manifests (
  id TEXT PRIMARY KEY NOT NULL,
  operation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  target_path_hash TEXT NOT NULL,
  backup_file_name TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  is_manual_recovery_required INTEGER NOT NULL DEFAULT 0 CHECK (
    is_manual_recovery_required IN (0, 1)
  )
);

CREATE INDEX IF NOT EXISTS ix_backup_manifests_created_at_ms
  ON backup_manifests(created_at_ms DESC);

PRAGMA user_version = 1;
