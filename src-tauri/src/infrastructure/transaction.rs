use std::{
    collections::HashSet,
    fs::Permissions,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
};

use serde::Serialize;
use tracing::{error, warn};
use uuid::Uuid;

use crate::{
    adapters::agents::AdapterRegistry,
    domain::{
        agents::{
            AgentPlatform, BatchCommitResult, BatchCommitTargetResult, CommitTargetStatus,
            ConflictAction,
        },
        ports::Clock,
    },
    error::{AppError, AppErrorKind, RecoveryAction},
    infrastructure::{
        database::{BackupRecord, Database},
        filesystem::{
            content_revision, ensure_safe_root, hash_bytes, hash_path, safe_path_label,
            sync_parent_directory, write_atomic,
        },
        paths::PlatformPathResolver,
        write_plan_store::{StoredTargetPlan, StoredWritePlan},
    },
};

const BACKUP_RETENTION_LIMIT: usize = 20;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum TransactionStage {
    BeforeBackup,
    AfterBackup,
    BeforeWrite,
    AfterWrite,
    BeforeVerification,
    Rollback,
}

trait TransactionFaultInjector: Send + Sync {
    fn check(&self, stage: TransactionStage, platform: AgentPlatform) -> Result<(), AppError>;
}

struct NoTransactionFaults;

impl TransactionFaultInjector for NoTransactionFaults {
    fn check(&self, _stage: TransactionStage, _platform: AgentPlatform) -> Result<(), AppError> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct BatchTransactionCoordinator {
    paths: Arc<PlatformPathResolver>,
    adapters: AdapterRegistry,
    database: Arc<Database>,
    backups_root: PathBuf,
    clock: Arc<dyn Clock>,
    fault_injector: Arc<dyn TransactionFaultInjector>,
}

#[derive(Debug)]
struct AppliedTarget {
    plan: StoredTargetPlan,
    original_bytes: Option<Vec<u8>>,
    backup_id: Option<String>,
    backup_path: Option<PathBuf>,
    root_created: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifest<'a> {
    operation_id: &'a str,
    created_at_ms: i64,
    targets: Vec<BackupManifestTarget>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupManifestTarget {
    platform: String,
    target_path_hash: String,
    backup_id: Option<String>,
    backup_file_name: Option<String>,
    original_revision: Option<String>,
}

impl BatchTransactionCoordinator {
    pub fn new(
        paths: Arc<PlatformPathResolver>,
        adapters: AdapterRegistry,
        database: Arc<Database>,
        backups_root: PathBuf,
        clock: Arc<dyn Clock>,
    ) -> Self {
        Self {
            paths,
            adapters,
            database,
            backups_root,
            clock,
            fault_injector: Arc::new(NoTransactionFaults),
        }
    }

    #[cfg(test)]
    fn with_fault_injector(mut self, fault_injector: Arc<dyn TransactionFaultInjector>) -> Self {
        self.fault_injector = fault_injector;
        self
    }

    pub fn recovery_path(&self, recovery_id: &str) -> Result<PathBuf, AppError> {
        if Uuid::parse_str(recovery_id).is_err() {
            return Err(AppError::new(
                AppErrorKind::Validation,
                "恢复目录标识无效。",
            ));
        }
        let path = self.backups_root.join(recovery_id);
        let metadata = std::fs::symlink_metadata(&path).map_err(|source| {
            if source.kind() == std::io::ErrorKind::NotFound {
                AppError::new(AppErrorKind::NotFound, "恢复目录不存在或已被移动。")
                    .with_source(source)
            } else {
                AppError::new(AppErrorKind::PermissionDenied, "无法检查恢复目录。")
                    .with_source(source)
            }
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(AppError::new(
                AppErrorKind::UnsafePath,
                "恢复目录不是安全的真实目录。",
            ));
        }
        Ok(path)
    }

    pub fn commit(&self, mut plan: StoredWritePlan) -> Result<BatchCommitResult, AppError> {
        plan.targets.sort_by_key(|target| target.platform);
        self.preflight(&plan.targets)?;

        let operation_id = Uuid::new_v4().to_string();
        let operation_backup_root = self.backups_root.join(&operation_id);
        let mut applied = Vec::new();

        for target in plan.targets {
            if let Err(primary_error) = self.prepare_and_write_target(
                &operation_id,
                &operation_backup_root,
                target,
                &mut applied,
            ) {
                return self.rollback_or_return(primary_error, &operation_id, applied);
            }
        }

        if applied.iter().any(|target| target.backup_path.is_some()) {
            self.persist_backup_metadata(&operation_id, &operation_backup_root, &applied, false);
            self.prune_old_backups();
        }

        let targets = applied
            .into_iter()
            .map(|applied_target| {
                Ok(BatchCommitTargetResult {
                    platform: applied_target.plan.platform,
                    status: CommitTargetStatus::Committed,
                    target_path: safe_path_label(
                        &applied_target.plan.target,
                        self.paths.home_dir(),
                    ),
                    committed_revision: Some(content_revision(&applied_target.plan.rendered_bytes)),
                    backup_id: applied_target.backup_id,
                    recovery_path: None,
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;

        Ok(BatchCommitResult {
            operation_id,
            targets,
            requires_manual_recovery: false,
        })
    }

    fn preflight(&self, targets: &[StoredTargetPlan]) -> Result<(), AppError> {
        let mut unique_targets = HashSet::new();
        for target in targets {
            let current_root = self.paths.root_path(target.platform)?;
            if current_root != target.root {
                return Err(AppError::new(
                    AppErrorKind::PreviewInvalid,
                    "平台目录设置在预览后发生变化，请重新生成预览。",
                )
                .with_recovery(RecoveryAction::RecreatePreview));
            }
            ensure_safe_root(&target.root)?;
            if target.target.parent() != Some(target.root.as_path()) {
                return Err(AppError::new(
                    AppErrorKind::UnsafePath,
                    "目标文件不在适配器控制的根目录内。",
                ));
            }
            if !unique_targets.insert(target.target.clone()) {
                return Err(AppError::new(
                    AppErrorKind::Validation,
                    "一个批次中出现重复目标路径。",
                ));
            }
            let current_bytes = read_optional(&target.target)?;
            match (&target.expected_revision, current_bytes.as_deref()) {
                (Some(expected), Some(bytes)) if &content_revision(bytes) == expected => {}
                (None, None) => {}
                _ => {
                    return Err(AppError::new(
                        AppErrorKind::SourceChanged,
                        "目标文件在预览后发生变化，未执行任何写入。",
                    )
                    .with_recovery(RecoveryAction::Refresh));
                }
            }
            if current_bytes.is_some()
                && !target.is_source_update
                && target.conflict_action == ConflictAction::Fail
            {
                return Err(AppError::new(
                    AppErrorKind::NameConflict,
                    "目标名称已存在；请改名或明确选择备份后替换。",
                )
                .with_recovery(RecoveryAction::ChangeName));
            }
        }
        Ok(())
    }

    fn prepare_and_write_target(
        &self,
        operation_id: &str,
        operation_backup_root: &Path,
        target: StoredTargetPlan,
        applied: &mut Vec<AppliedTarget>,
    ) -> Result<(), AppError> {
        self.fault_injector
            .check(TransactionStage::BeforeBackup, target.platform)?;
        let root_created = !target.root.exists();
        if root_created {
            std::fs::create_dir_all(&target.root).map_err(|source| {
                AppError::new(
                    AppErrorKind::PermissionDenied,
                    "无法创建已确认的平台 Agent 目录。",
                )
                .with_source(source)
            })?;
        }
        ensure_safe_root(&target.root)?;
        let original_bytes = read_optional(&target.target)?;
        applied.push(AppliedTarget {
            plan: target,
            original_bytes,
            backup_id: None,
            backup_path: None,
            root_created,
        });
        let backup = {
            let current = applied
                .last()
                .ok_or_else(|| AppError::new(AppErrorKind::Internal, "事务状态未正确记录。"))?;
            if let Some(original) = current.original_bytes.as_ref() {
                std::fs::create_dir_all(operation_backup_root).map_err(|source| {
                    AppError::new(AppErrorKind::BackupFailed, "无法创建备份目录。")
                        .with_source(source)
                })?;
                let backup_id = Uuid::new_v4().to_string();
                let file_name = current
                    .plan
                    .target
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("agent.bin");
                let backup_path = operation_backup_root.join(format!(
                    "{}-{}-{}",
                    current.plan.platform.as_str(),
                    backup_id,
                    file_name
                ));
                write_atomic(&backup_path, original).map_err(|source| {
                    AppError::new(AppErrorKind::BackupFailed, "创建原生 Agent 备份失败。")
                        .with_source(source)
                })?;
                std::fs::set_permissions(&backup_path, Permissions::from_mode(0o600)).map_err(
                    |source| {
                        AppError::new(AppErrorKind::BackupFailed, "设置备份文件权限失败。")
                            .with_source(source)
                    },
                )?;
                Some((backup_id, backup_path))
            } else {
                None
            }
        };
        if let Some((backup_id, backup_path)) = backup {
            let current = applied
                .last_mut()
                .ok_or_else(|| AppError::new(AppErrorKind::Internal, "事务状态未正确记录。"))?;
            current.backup_id = Some(backup_id);
            current.backup_path = Some(backup_path);
        }
        let platform = applied
            .last()
            .ok_or_else(|| AppError::new(AppErrorKind::Internal, "事务状态未正确记录。"))?
            .plan
            .platform;
        self.fault_injector
            .check(TransactionStage::AfterBackup, platform)?;
        self.fault_injector
            .check(TransactionStage::BeforeWrite, platform)?;
        let current = applied
            .last()
            .ok_or_else(|| AppError::new(AppErrorKind::Internal, "事务状态未正确记录。"))?;
        write_atomic(&current.plan.target, &current.plan.rendered_bytes)?;
        self.fault_injector
            .check(TransactionStage::AfterWrite, current.plan.platform)?;
        self.fault_injector
            .check(TransactionStage::BeforeVerification, current.plan.platform)?;
        let verified = std::fs::read(&current.plan.target).map_err(|source| {
            AppError::new(
                AppErrorKind::VerificationFailed,
                "写入后无法重新读取原生 Agent 文件。",
            )
            .with_source(source)
        })?;
        if hash_bytes(&verified) != hash_bytes(&current.plan.rendered_bytes) {
            return Err(AppError::new(
                AppErrorKind::VerificationFailed,
                "写入后文件哈希与预览内容不一致。",
            ));
        }
        self.adapters.get(current.plan.platform).parse(
            &verified,
            current
                .plan
                .target
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("agent"),
        )?;
        tracing::info!(
            operation_id = %operation_id,
            platform = %current.plan.platform,
            outcome = "verified",
            "native agent target committed"
        );
        Ok(())
    }

    fn rollback_or_return(
        &self,
        primary_error: AppError,
        operation_id: &str,
        applied: Vec<AppliedTarget>,
    ) -> Result<BatchCommitResult, AppError> {
        let mut manual_recovery = false;
        for target in applied.iter().rev() {
            let rollback_result = self
                .fault_injector
                .check(TransactionStage::Rollback, target.plan.platform)
                .and_then(|()| match target.original_bytes.as_deref() {
                    Some(original) => write_atomic(&target.plan.target, original),
                    None if target.plan.target.exists() => {
                        std::fs::remove_file(&target.plan.target)
                            .map_err(|source| {
                                AppError::new(
                                    AppErrorKind::RollbackFailed,
                                    "删除本批次创建的文件失败。",
                                )
                                .with_source(source)
                            })
                            .and_then(|()| sync_parent_directory(&target.plan.target))
                    }
                    None => Ok(()),
                })
                .and_then(|()| {
                    if target.root_created {
                        remove_created_root_if_empty(&target.plan.root)
                    } else {
                        Ok(())
                    }
                });
            if let Err(error) = rollback_result {
                manual_recovery = true;
                error!(
                    operation_id = %operation_id,
                    platform = %target.plan.platform,
                    error_code = error.code(),
                    "native agent rollback failed"
                );
            }
        }
        if manual_recovery {
            self.persist_backup_metadata(
                operation_id,
                &self.backups_root.join(operation_id),
                &applied,
                true,
            );
            return Err(AppError::new(
                AppErrorKind::RollbackFailed,
                "批次写入失败且至少一个目标无法自动恢复，需要人工处理备份。",
            )
            .with_recovery(RecoveryAction::RevealRecoveryDirectory {
                recovery_id: operation_id.to_owned(),
            })
            .with_source(primary_error));
        }
        Err(primary_error)
    }

    fn persist_backup_metadata(
        &self,
        operation_id: &str,
        operation_backup_root: &Path,
        applied: &[AppliedTarget],
        is_manual_recovery_required: bool,
    ) {
        match self.build_manifest(operation_id, applied) {
            Ok(manifest) => {
                if let Err(error) = write_manifest(operation_backup_root, &manifest) {
                    warn!(
                        operation_id = %operation_id,
                        error_code = error.code(),
                        "backup manifest write failed after native file mutation"
                    );
                }
            }
            Err(error) => warn!(
                operation_id = %operation_id,
                error_code = error.code(),
                "backup manifest could not be assembled"
            ),
        }

        for applied_target in applied {
            let (Some(backup_id), Some(backup_path), Some(original)) = (
                applied_target.backup_id.as_deref(),
                applied_target.backup_path.as_ref(),
                applied_target.original_bytes.as_ref(),
            ) else {
                continue;
            };
            let target_path_hash = match hash_path(&applied_target.plan.target) {
                Ok(hash) => hash,
                Err(error) => {
                    warn!(
                        operation_id = %operation_id,
                        platform = %applied_target.plan.platform,
                        error_code = error.code(),
                        "backup target path could not be indexed"
                    );
                    continue;
                }
            };
            let backup_file_name = backup_path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("backup.bin");
            if let Err(error) = self.database.record_backup(BackupRecord {
                id: backup_id,
                operation_id,
                platform: applied_target.plan.platform,
                target_path_hash: &target_path_hash,
                backup_file_name,
                content_hash: &hash_bytes(original),
                created_at_ms: self.clock.now_ms(),
                is_manual_recovery_required,
            }) {
                warn!(
                    operation_id = %operation_id,
                    platform = %applied_target.plan.platform,
                    error_code = error.code(),
                    "backup metadata indexing failed; filesystem remains authoritative"
                );
            }
        }
    }

    fn prune_old_backups(&self) {
        let operation_ids = match self
            .database
            .prunable_backup_operation_ids(BACKUP_RETENTION_LIMIT)
        {
            Ok(operation_ids) => operation_ids,
            Err(error) => {
                warn!(
                    error_code = error.code(),
                    "backup retention query failed; no backups were removed"
                );
                return;
            }
        };

        for operation_id in operation_ids {
            if Uuid::parse_str(&operation_id).is_err() {
                warn!("invalid backup operation id was retained for manual inspection");
                continue;
            }
            let operation_root = self.backups_root.join(&operation_id);
            let remove_result = std::fs::remove_dir_all(&operation_root);
            if let Err(source) = remove_result {
                if source.kind() != std::io::ErrorKind::NotFound {
                    warn!("expired backup directory could not be removed");
                    continue;
                }
            }
            if let Err(error) = self.database.delete_backup_operation(&operation_id) {
                warn!(
                    error_code = error.code(),
                    "expired backup files were removed but their index cleanup failed"
                );
            }
        }
    }

    fn build_manifest<'operation>(
        &self,
        operation_id: &'operation str,
        applied: &[AppliedTarget],
    ) -> Result<BackupManifest<'operation>, AppError> {
        let targets = applied
            .iter()
            .map(|target| {
                Ok(BackupManifestTarget {
                    platform: target.plan.platform.as_str().to_owned(),
                    target_path_hash: hash_path(&target.plan.target)?,
                    backup_id: target.backup_id.clone(),
                    backup_file_name: target
                        .backup_path
                        .as_ref()
                        .and_then(|path| path.file_name())
                        .map(|value| value.to_string_lossy().into_owned()),
                    original_revision: target
                        .original_bytes
                        .as_deref()
                        .map(content_revision)
                        .map(|revision| revision.0),
                })
            })
            .collect::<Result<Vec<_>, AppError>>()?;
        Ok(BackupManifest {
            operation_id,
            created_at_ms: self.clock.now_ms(),
            targets,
        })
    }
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(source) if source.kind() == std::io::ErrorKind::PermissionDenied => Err(AppError::new(
            AppErrorKind::PermissionDenied,
            "没有权限读取目标文件。",
        )
        .with_source(source)),
        Err(source) => {
            Err(AppError::new(AppErrorKind::Internal, "读取目标文件失败。").with_source(source))
        }
    }
}

fn remove_created_root_if_empty(root: &Path) -> Result<(), AppError> {
    let metadata = match std::fs::symlink_metadata(root) {
        Ok(metadata) => metadata,
        Err(source) if source.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(source) => {
            return Err(AppError::new(
                AppErrorKind::RollbackFailed,
                "无法检查本批次创建的平台目录。",
            )
            .with_source(source));
        }
    };
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Ok(());
    }
    let mut entries = std::fs::read_dir(root).map_err(|source| {
        AppError::new(
            AppErrorKind::RollbackFailed,
            "无法检查本批次创建的平台目录是否为空。",
        )
        .with_source(source)
    })?;
    if entries
        .next()
        .transpose()
        .map_err(|source| {
            AppError::new(
                AppErrorKind::RollbackFailed,
                "无法读取本批次创建的平台目录内容。",
            )
            .with_source(source)
        })?
        .is_some()
    {
        return Ok(());
    }
    std::fs::remove_dir(root).map_err(|source| {
        AppError::new(
            AppErrorKind::RollbackFailed,
            "删除本批次创建的空平台目录失败。",
        )
        .with_source(source)
    })?;
    sync_parent_directory(root)
}

fn write_manifest(root: &Path, manifest: &BackupManifest<'_>) -> Result<(), AppError> {
    std::fs::create_dir_all(root).map_err(|source| {
        AppError::new(AppErrorKind::BackupFailed, "无法创建备份 manifest 目录。")
            .with_source(source)
    })?;
    let bytes = serde_json::to_vec_pretty(manifest).map_err(|source| {
        AppError::new(AppErrorKind::Internal, "序列化备份 manifest 失败。").with_source(source)
    })?;
    let path = root.join("manifest.json");
    write_atomic(&path, &bytes)?;
    std::fs::set_permissions(path, Permissions::from_mode(0o600)).map_err(|source| {
        AppError::new(AppErrorKind::BackupFailed, "设置备份 manifest 权限失败。")
            .with_source(source)
    })
}

#[cfg(test)]
mod tests {
    use tempfile::{tempdir, TempDir};

    use super::*;
    use crate::{
        domain::{
            agents::{AgentPlatform, SourceRevision},
            templates::TemplatePackage,
        },
        error::RecoveryAction,
    };

    #[derive(Debug)]
    struct FixedClock;

    impl Clock for FixedClock {
        fn now_ms(&self) -> i64 {
            1_000
        }
    }

    struct TestFaultInjector {
        failures: HashSet<(TransactionStage, AgentPlatform)>,
    }

    impl TestFaultInjector {
        fn new(failures: impl IntoIterator<Item = (TransactionStage, AgentPlatform)>) -> Self {
            Self {
                failures: failures.into_iter().collect(),
            }
        }
    }

    impl TransactionFaultInjector for TestFaultInjector {
        fn check(&self, stage: TransactionStage, platform: AgentPlatform) -> Result<(), AppError> {
            if self.failures.contains(&(stage, platform)) {
                let kind = if stage == TransactionStage::Rollback {
                    AppErrorKind::RollbackFailed
                } else {
                    AppErrorKind::VerificationFailed
                };
                return Err(AppError::new(kind, "injected transaction failure"));
            }
            Ok(())
        }
    }

    fn coordinator(temporary: &TempDir) -> BatchTransactionCoordinator {
        let home = temporary.path().join("home");
        std::fs::create_dir_all(&home).expect("temporary home creates");
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let clock = Arc::new(FixedClock);
        let paths = Arc::new(PlatformPathResolver::new(
            home,
            database.clone(),
            clock.clone(),
        ));
        BatchTransactionCoordinator::new(
            paths,
            AdapterRegistry::default(),
            database,
            temporary.path().join("backups"),
            clock,
        )
    }

    fn applied_created_target(root: PathBuf, target: PathBuf) -> AppliedTarget {
        AppliedTarget {
            plan: StoredTargetPlan {
                platform: AgentPlatform::Claude,
                root,
                target,
                rendered_bytes: Vec::new(),
                expected_revision: None,
                conflict_action: ConflictAction::Fail,
                is_source_update: false,
            },
            original_bytes: None,
            backup_id: None,
            backup_path: None,
            root_created: true,
        }
    }

    fn rendered_target(
        coordinator: &BatchTransactionCoordinator,
        platform: AgentPlatform,
        conflict_action: ConflictAction,
        expected_revision: Option<SourceRevision>,
    ) -> StoredTargetPlan {
        let package: TemplatePackage = serde_json::from_str(include_str!(
            "../../resources/templates/requirements-clarifier.json"
        ))
        .expect("built-in template fixture parses");
        let rendered = coordinator
            .adapters
            .get(platform)
            .render(&package.to_draft(), None)
            .expect("native target renders");
        let root = coordinator
            .paths
            .root_path(platform)
            .expect("platform root resolves");
        StoredTargetPlan {
            platform,
            target: root.join(rendered.file_name),
            root,
            rendered_bytes: rendered.bytes,
            expected_revision,
            conflict_action,
            is_source_update: false,
        }
    }

    #[test]
    fn rollback_removes_a_batch_created_root_after_its_file_is_removed() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let root = temporary.path().join("created-root");
        let target = root.join("agent.md");
        std::fs::create_dir_all(&root).expect("target root creates");
        std::fs::write(&target, b"created by batch").expect("target file writes");

        let error = coordinator
            .rollback_or_return(
                AppError::new(AppErrorKind::VerificationFailed, "forced failure"),
                "operation",
                vec![applied_created_target(root.clone(), target.clone())],
            )
            .expect_err("rollback returns the primary error");

        assert_eq!(error.kind, AppErrorKind::VerificationFailed);
        assert!(!target.exists());
        assert!(!root.exists());
    }

    #[test]
    fn rollback_preserves_a_batch_created_root_when_it_is_not_empty() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let root = temporary.path().join("created-root");
        let target = root.join("agent.md");
        let unrelated = root.join("external.md");
        std::fs::create_dir_all(&root).expect("target root creates");
        std::fs::write(&target, b"created by batch").expect("target file writes");
        std::fs::write(&unrelated, b"external content").expect("external file writes");

        coordinator
            .rollback_or_return(
                AppError::new(AppErrorKind::VerificationFailed, "forced failure"),
                "operation",
                vec![applied_created_target(root.clone(), target.clone())],
            )
            .expect_err("rollback returns the primary error");

        assert!(!target.exists());
        assert!(root.is_dir());
        assert_eq!(
            std::fs::read(&unrelated).expect("external file remains readable"),
            b"external content"
        );
    }

    #[test]
    fn preflight_rejects_a_source_changed_after_preview() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let root = coordinator
            .paths
            .root_path(AgentPlatform::Claude)
            .expect("platform root resolves");
        let target = root.join("agent.md");
        std::fs::create_dir_all(&root).expect("target root creates");
        std::fs::write(&target, b"changed content").expect("target file writes");
        let plan = StoredTargetPlan {
            platform: AgentPlatform::Claude,
            root,
            target: target.clone(),
            rendered_bytes: b"proposed content".to_vec(),
            expected_revision: Some(SourceRevision("stale-revision".to_owned())),
            conflict_action: ConflictAction::ReplaceAfterBackup,
            is_source_update: false,
        };

        let error = coordinator
            .preflight(&[plan])
            .expect_err("source change blocks the batch before writing");

        assert_eq!(error.kind, AppErrorKind::SourceChanged);
        assert_eq!(
            std::fs::read(&target).expect("target remains readable"),
            b"changed content"
        );
    }

    #[test]
    fn preflight_rejects_a_name_conflict_without_replace_consent() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let root = coordinator
            .paths
            .root_path(AgentPlatform::Claude)
            .expect("platform root resolves");
        let target = root.join("agent.md");
        let original = b"existing content";
        std::fs::create_dir_all(&root).expect("target root creates");
        std::fs::write(&target, original).expect("target file writes");
        let plan = StoredTargetPlan {
            platform: AgentPlatform::Claude,
            root,
            target: target.clone(),
            rendered_bytes: b"proposed content".to_vec(),
            expected_revision: Some(content_revision(original)),
            conflict_action: ConflictAction::Fail,
            is_source_update: false,
        };

        let error = coordinator
            .preflight(&[plan])
            .expect_err("name conflict blocks the batch before writing");

        assert_eq!(error.kind, AppErrorKind::NameConflict);
        assert_eq!(
            std::fs::read(&target).expect("target remains readable"),
            original
        );
    }

    #[test]
    fn rollback_restores_the_original_replaced_file() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let root = temporary.path().join("existing-root");
        let target = root.join("agent.md");
        let original = b"original content".to_vec();
        std::fs::create_dir_all(&root).expect("target root creates");
        std::fs::write(&target, b"new content").expect("replacement writes");
        let applied = AppliedTarget {
            plan: StoredTargetPlan {
                platform: AgentPlatform::Claude,
                root,
                target: target.clone(),
                rendered_bytes: b"new content".to_vec(),
                expected_revision: Some(content_revision(&original)),
                conflict_action: ConflictAction::ReplaceAfterBackup,
                is_source_update: false,
            },
            original_bytes: Some(original.clone()),
            backup_id: None,
            backup_path: None,
            root_created: false,
        };

        coordinator
            .rollback_or_return(
                AppError::new(AppErrorKind::VerificationFailed, "forced failure"),
                "operation",
                vec![applied],
            )
            .expect_err("rollback returns the primary error");

        assert_eq!(
            std::fs::read(&target).expect("restored target remains readable"),
            original
        );
    }

    #[test]
    fn recovery_paths_accept_only_existing_uuid_directories() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary);
        let recovery_id = Uuid::new_v4().to_string();
        let recovery_path = coordinator.backups_root.join(&recovery_id);
        std::fs::create_dir_all(&recovery_path).expect("recovery directory creates");

        assert_eq!(
            coordinator
                .recovery_path(&recovery_id)
                .expect("valid recovery path resolves"),
            recovery_path
        );
        assert_eq!(
            coordinator
                .recovery_path("../outside")
                .expect_err("path-like recovery id is rejected")
                .kind,
            AppErrorKind::Validation
        );
        assert_eq!(
            coordinator
                .recovery_path(&Uuid::new_v4().to_string())
                .expect_err("missing recovery directory is rejected")
                .kind,
            AppErrorKind::NotFound
        );
    }

    #[test]
    fn injected_multi_target_failure_rolls_back_every_applied_target() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator = coordinator(&temporary).with_fault_injector(Arc::new(
            TestFaultInjector::new([(TransactionStage::AfterWrite, AgentPlatform::Codex)]),
        ));
        let claude = rendered_target(
            &coordinator,
            AgentPlatform::Claude,
            ConflictAction::Fail,
            None,
        );
        let codex = rendered_target(
            &coordinator,
            AgentPlatform::Codex,
            ConflictAction::Fail,
            None,
        );
        let claude_root = claude.root.clone();
        let claude_target = claude.target.clone();
        let codex_root = codex.root.clone();
        let codex_target = codex.target.clone();

        let error = coordinator
            .commit(StoredWritePlan {
                targets: vec![claude, codex],
                expires_at_ms: i64::MAX,
            })
            .expect_err("injected write failure aborts the batch");

        assert_eq!(error.kind, AppErrorKind::VerificationFailed);
        assert!(!claude_target.exists());
        assert!(!codex_target.exists());
        assert!(!claude_root.exists());
        assert!(!codex_root.exists());
    }

    #[test]
    fn rollback_failure_persists_manual_recovery_manifest_and_action() {
        let temporary = tempdir().expect("temporary directory creates");
        let coordinator =
            coordinator(&temporary).with_fault_injector(Arc::new(TestFaultInjector::new([
                (TransactionStage::AfterWrite, AgentPlatform::Codex),
                (TransactionStage::Rollback, AgentPlatform::Claude),
            ])));
        let original = b"original Claude content".to_vec();
        let mut claude = rendered_target(
            &coordinator,
            AgentPlatform::Claude,
            ConflictAction::ReplaceAfterBackup,
            Some(content_revision(&original)),
        );
        std::fs::create_dir_all(&claude.root).expect("Claude root creates");
        std::fs::write(&claude.target, &original).expect("original Claude file writes");
        let committed_claude = claude.rendered_bytes.clone();
        claude.is_source_update = false;
        let codex = rendered_target(
            &coordinator,
            AgentPlatform::Codex,
            ConflictAction::Fail,
            None,
        );
        let codex_target = codex.target.clone();

        let error = coordinator
            .commit(StoredWritePlan {
                targets: vec![claude.clone(), codex],
                expires_at_ms: i64::MAX,
            })
            .expect_err("rollback injection requires manual recovery");

        assert_eq!(error.kind, AppErrorKind::RollbackFailed);
        let recovery_id = match error.recovery.as_ref() {
            Some(RecoveryAction::RevealRecoveryDirectory { recovery_id }) => recovery_id,
            other => panic!("unexpected recovery action: {other:?}"),
        };
        let recovery_path = coordinator
            .recovery_path(recovery_id)
            .expect("manual recovery directory resolves");
        assert!(recovery_path.join("manifest.json").is_file());
        assert_eq!(
            std::fs::read(&claude.target).expect("unrestored Claude target remains readable"),
            committed_claude
        );
        assert!(!codex_target.exists());
    }
}
