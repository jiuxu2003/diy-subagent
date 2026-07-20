use std::error::Error;

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::agents::ValidationIssue;

type BoxError = Box<dyn Error + Send + Sync + 'static>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppErrorKind {
    Validation,
    #[cfg(not(target_os = "macos"))]
    UnsupportedPlatform,
    LossyRoundTripBlocked,
    SourceChanged,
    NameConflict,
    PathMissing,
    PermissionDenied,
    UnsafePath,
    PreviewExpired,
    PreviewInvalid,
    BackupFailed,
    AtomicWriteFailed,
    VerificationFailed,
    RollbackFailed,
    WatchFailed,
    Database,
    Migration,
    DialogCancelled,
    NotFound,
    Internal,
}

impl AppErrorKind {
    pub const fn code(self) -> &'static str {
        match self {
            Self::Validation => "agent.validation_failed",
            #[cfg(not(target_os = "macos"))]
            Self::UnsupportedPlatform => "agent.unsupported_platform",
            Self::LossyRoundTripBlocked => "agent.lossy_round_trip_blocked",
            Self::SourceChanged => "agent.source_changed",
            Self::NameConflict => "agent.name_conflict",
            Self::PathMissing => "agent.path_missing",
            Self::PermissionDenied => "agent.permission_denied",
            Self::UnsafePath => "agent.unsafe_path",
            Self::PreviewExpired => "agent.preview_expired",
            Self::PreviewInvalid => "agent.preview_invalid",
            Self::BackupFailed => "agent.backup_failed",
            Self::AtomicWriteFailed => "agent.atomic_write_failed",
            Self::VerificationFailed => "agent.verification_failed",
            Self::RollbackFailed => "agent.rollback_failed",
            Self::WatchFailed => "inventory.watch_failed",
            Self::Database => "database.operation_failed",
            Self::Migration => "database.migration_failed",
            Self::DialogCancelled => "settings.dialog_cancelled",
            Self::NotFound => "resource.not_found",
            Self::Internal => "app.internal_error",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum RecoveryAction {
    Retry,
    Refresh,
    ChangeName,
    ChooseDirectory,
    RecreatePreview,
    RevealBackup { backup_id: String },
    RevealRecoveryDirectory { recovery_id: String },
}

#[derive(Debug, Error)]
#[error("{message}")]
pub struct AppError {
    pub kind: AppErrorKind,
    pub message: String,
    pub field_errors: Vec<ValidationIssue>,
    pub recovery: Option<RecoveryAction>,
    #[source]
    source: Option<BoxError>,
}

impl AppError {
    pub fn new(kind: AppErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
            field_errors: Vec::new(),
            recovery: None,
            source: None,
        }
    }

    pub fn validation(field_errors: Vec<ValidationIssue>) -> Self {
        Self {
            kind: AppErrorKind::Validation,
            message: "输入未通过校验，请检查标记字段。".to_owned(),
            field_errors,
            recovery: None,
            source: None,
        }
    }

    pub fn with_recovery(mut self, recovery: RecoveryAction) -> Self {
        self.recovery = Some(recovery);
        self
    }

    pub fn with_source<E>(mut self, source: E) -> Self
    where
        E: Error + Send + Sync + 'static,
    {
        self.source = Some(Box::new(source));
        self
    }

    pub const fn code(&self) -> &'static str {
        self.kind.code()
    }
}
