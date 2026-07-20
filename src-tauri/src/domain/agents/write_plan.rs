use serde::{Deserialize, Serialize};

use super::{AgentPlatform, CapabilityIssue, NativeFormat, SourceRevision, ValidationIssue};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ConflictAction {
    Fail,
    ReplaceAfterBackup,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetSelection {
    pub platform: AgentPlatform,
    pub conflict_action: ConflictAction,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WritePlanToken(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewTarget {
    pub platform: AgentPlatform,
    pub target_path: String,
    pub native_format: NativeFormat,
    pub native_content: String,
    pub unified_diff: String,
    pub current_revision: Option<SourceRevision>,
    pub will_create_directory: bool,
    pub will_create_backup: bool,
    pub conflict_detected: bool,
    pub validation_issues: Vec<ValidationIssue>,
    pub capability_issues: Vec<CapabilityIssue>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewBatch {
    pub token: WritePlanToken,
    pub expires_at_ms: i64,
    pub targets: Vec<PreviewTarget>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CommitTargetStatus {
    Committed,
    Unchanged,
    Restored,
    RemovedCreatedFile,
    ManualRecoveryRequired,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCommitResult {
    pub operation_id: String,
    pub targets: Vec<BatchCommitTargetResult>,
    pub requires_manual_recovery: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatchCommitTargetResult {
    pub platform: AgentPlatform,
    pub status: CommitTargetStatus,
    pub target_path: String,
    pub committed_revision: Option<SourceRevision>,
    pub backup_id: Option<String>,
    pub recovery_path: Option<String>,
}
