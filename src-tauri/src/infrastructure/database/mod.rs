use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};

use crate::{
    domain::agents::AgentPlatform,
    error::{AppError, AppErrorKind},
};

const INITIAL_MIGRATION: &str = include_str!("../../../migrations/0001_initial.sql");

pub struct Database {
    connection: Mutex<Connection>,
}

#[derive(Debug, Clone)]
pub struct ImportedSourceRecord<'a> {
    pub id: &'a str,
    pub platform: AgentPlatform,
    pub path_hash: &'a str,
    pub revision: &'a str,
    pub adapter_contract_version: &'a str,
    pub snapshot_id: &'a str,
    pub imported_at_ms: i64,
}

#[derive(Debug, Clone)]
pub struct BackupRecord<'a> {
    pub id: &'a str,
    pub operation_id: &'a str,
    pub platform: AgentPlatform,
    pub target_path_hash: &'a str,
    pub backup_file_name: &'a str,
    pub content_hash: &'a str,
    pub created_at_ms: i64,
    pub is_manual_recovery_required: bool,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, AppError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|source| {
                AppError::new(AppErrorKind::Database, "无法创建应用数据库目录。")
                    .with_source(source)
            })?;
        }
        let connection = Connection::open(path).map_err(|source| {
            AppError::new(AppErrorKind::Database, "无法打开应用数据库。").with_source(source)
        })?;
        Self::configure(connection)
    }

    #[cfg(test)]
    pub fn in_memory() -> Result<Self, AppError> {
        let connection = Connection::open_in_memory().map_err(|source| {
            AppError::new(AppErrorKind::Database, "无法创建内存数据库。").with_source(source)
        })?;
        Self::configure(connection)
    }

    fn configure(connection: Connection) -> Result<Self, AppError> {
        connection
            .busy_timeout(Duration::from_secs(5))
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "无法配置数据库 busy timeout。")
                    .with_source(source)
            })?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "无法配置数据库连接。").with_source(source)
            })?;
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|source| {
                AppError::new(AppErrorKind::Migration, "无法读取数据库版本。").with_source(source)
            })?;
        if version == 0 {
            connection
                .execute_batch(INITIAL_MIGRATION)
                .map_err(|source| {
                    AppError::new(AppErrorKind::Migration, "数据库初始化迁移失败。")
                        .with_source(source)
                })?;
        } else if version != 1 {
            return Err(AppError::new(
                AppErrorKind::Migration,
                format!("不支持的数据库版本：{version}。"),
            ));
        }
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn directory_override(&self, platform: AgentPlatform) -> Result<Option<PathBuf>, AppError> {
        let connection = self.connection.lock();
        let value = connection
            .query_row(
                "SELECT override_path FROM platform_directories WHERE platform = ?1",
                params![platform.as_str()],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "读取平台目录设置失败。").with_source(source)
            })?
            .flatten();
        Ok(value.map(PathBuf::from))
    }

    pub fn set_directory_override(
        &self,
        platform: AgentPlatform,
        path: &Path,
        now_ms: i64,
    ) -> Result<(), AppError> {
        let path = path.to_str().ok_or_else(|| {
            AppError::new(AppErrorKind::Validation, "所选目录无法表示为 UTF-8 路径。")
        })?;
        let connection = self.connection.lock();
        connection
            .execute(
                "INSERT INTO platform_directories (platform, override_path, updated_at_ms)
                 VALUES (?1, ?2, ?3)
                 ON CONFLICT(platform) DO UPDATE SET
                   override_path = excluded.override_path,
                   updated_at_ms = excluded.updated_at_ms",
                params![platform.as_str(), path, now_ms],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "保存平台目录设置失败。").with_source(source)
            })?;
        Ok(())
    }

    pub fn reset_directory_override(
        &self,
        platform: AgentPlatform,
        now_ms: i64,
    ) -> Result<(), AppError> {
        let connection = self.connection.lock();
        connection
            .execute(
                "INSERT INTO platform_directories (platform, override_path, updated_at_ms)
                 VALUES (?1, NULL, ?2)
                 ON CONFLICT(platform) DO UPDATE SET
                   override_path = NULL,
                   updated_at_ms = excluded.updated_at_ms",
                params![platform.as_str(), now_ms],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "重置平台目录设置失败。").with_source(source)
            })?;
        Ok(())
    }

    pub fn record_import(&self, record: ImportedSourceRecord<'_>) -> Result<(), AppError> {
        let connection = self.connection.lock();
        connection
            .execute(
                "INSERT INTO imported_sources (
                   id, platform, path_hash, revision, adapter_contract_version,
                   snapshot_id, imported_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
                 ON CONFLICT(id) DO UPDATE SET
                   revision = excluded.revision,
                   adapter_contract_version = excluded.adapter_contract_version,
                   snapshot_id = excluded.snapshot_id,
                   imported_at_ms = excluded.imported_at_ms",
                params![
                    record.id,
                    record.platform.as_str(),
                    record.path_hash,
                    record.revision,
                    record.adapter_contract_version,
                    record.snapshot_id,
                    record.imported_at_ms,
                ],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "记录导入来源失败。").with_source(source)
            })?;
        Ok(())
    }

    pub fn imported_path_hashes(&self) -> Result<Vec<String>, AppError> {
        let connection = self.connection.lock();
        let mut statement = connection
            .prepare("SELECT path_hash FROM imported_sources")
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "读取导入索引失败。").with_source(source)
            })?;
        let rows = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "读取导入索引失败。").with_source(source)
            })?;
        let mut values = Vec::new();
        for row in rows {
            values.push(row.map_err(|source| {
                AppError::new(AppErrorKind::Database, "解析导入索引失败。").with_source(source)
            })?);
        }
        Ok(values)
    }

    pub fn record_backup(&self, record: BackupRecord<'_>) -> Result<(), AppError> {
        let connection = self.connection.lock();
        connection
            .execute(
                "INSERT INTO backup_manifests (
                   id, operation_id, platform, target_path_hash, backup_file_name,
                   content_hash, created_at_ms, is_manual_recovery_required
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    record.id,
                    record.operation_id,
                    record.platform.as_str(),
                    record.target_path_hash,
                    record.backup_file_name,
                    record.content_hash,
                    record.created_at_ms,
                    if record.is_manual_recovery_required {
                        1_i64
                    } else {
                        0_i64
                    },
                ],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "记录备份 manifest 失败。")
                    .with_source(source)
            })?;
        Ok(())
    }

    pub fn prunable_backup_operation_ids(&self, retain: usize) -> Result<Vec<String>, AppError> {
        let connection = self.connection.lock();
        let mut statement = connection
            .prepare(
                "SELECT operation_id
                 FROM backup_manifests
                 GROUP BY operation_id
                 HAVING MAX(is_manual_recovery_required) = 0
                 ORDER BY MAX(created_at_ms) DESC, operation_id DESC
                 LIMIT -1 OFFSET ?1",
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "准备备份保留查询失败。").with_source(source)
            })?;
        let rows = statement
            .query_map(params![retain as i64], |row| row.get::<_, String>(0))
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "查询待清理备份失败。").with_source(source)
            })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|source| {
            AppError::new(AppErrorKind::Database, "读取待清理备份结果失败。").with_source(source)
        })
    }

    pub fn delete_backup_operation(&self, operation_id: &str) -> Result<(), AppError> {
        let connection = self.connection.lock();
        connection
            .execute(
                "DELETE FROM backup_manifests WHERE operation_id = ?1",
                params![operation_id],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "删除过期备份索引失败。").with_source(source)
            })?;
        Ok(())
    }

    pub fn index_template(
        &self,
        id: &str,
        version: &str,
        source_name: &str,
        name: &str,
        content_hash: &str,
        now_ms: i64,
    ) -> Result<(), AppError> {
        let connection = self.connection.lock();
        connection
            .execute(
                "INSERT INTO template_index (
                   id, version, source, name, content_hash, updated_at_ms
                 ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                 ON CONFLICT(id, version) DO UPDATE SET
                   source = excluded.source,
                   name = excluded.name,
                   content_hash = excluded.content_hash,
                   updated_at_ms = excluded.updated_at_ms",
                params![id, version, source_name, name, content_hash, now_ms],
            )
            .map_err(|source| {
                AppError::new(AppErrorKind::Database, "更新模板索引失败。").with_source(source)
            })?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::BTreeSet, path::Path};

    use super::{BackupRecord, Database};
    use crate::domain::agents::AgentPlatform;

    #[test]
    fn persists_platform_directory_override() {
        let database = Database::in_memory().expect("database initializes");
        database
            .set_directory_override(AgentPlatform::Claude, Path::new("/tmp/claude-agents"), 1)
            .expect("override writes");

        assert_eq!(
            database
                .directory_override(AgentPlatform::Claude)
                .expect("override reads"),
            Some(Path::new("/tmp/claude-agents").to_path_buf())
        );
    }

    #[test]
    fn prunes_only_old_non_recovery_backup_operations() {
        let database = Database::in_memory().expect("database initializes");
        for index in 0..23 {
            let backup_id = format!("backup-{index:02}");
            let operation_id = format!("operation-{index:02}");
            database
                .record_backup(BackupRecord {
                    id: &backup_id,
                    operation_id: &operation_id,
                    platform: AgentPlatform::Claude,
                    target_path_hash: "target",
                    backup_file_name: "agent.md",
                    content_hash: "content",
                    created_at_ms: index,
                    is_manual_recovery_required: index == 0,
                })
                .expect("backup record writes");
        }

        let prunable = database
            .prunable_backup_operation_ids(20)
            .expect("retention query succeeds")
            .into_iter()
            .collect::<BTreeSet<_>>();

        assert_eq!(
            prunable,
            BTreeSet::from(["operation-01".to_owned(), "operation-02".to_owned()])
        );
        assert!(!prunable.contains("operation-00"));
    }
}
