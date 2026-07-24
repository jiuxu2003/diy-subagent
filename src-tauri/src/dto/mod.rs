use serde::{Deserialize, Serialize};

use crate::{
    domain::agents::{
        AgentDraft, AgentPlatform, InventoryGroup, NativeFormat, PlatformDirectory, SourceId,
        SourceRevision, TargetSelection, ValidationIssue, WritePlanToken,
    },
    error::{AppError, RecoveryAction},
    services::{ImportAgentResult, InventoryScan, ModelList, NativeAgentContent},
};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcErrorDto {
    pub code: String,
    pub message: String,
    pub operation_id: String,
    pub field_errors: Vec<ValidationIssue>,
    pub recovery: Option<RecoveryAction>,
}

impl IpcErrorDto {
    pub fn from_error(error: AppError, operation_id: impl Into<String>) -> Self {
        Self {
            code: error.code().to_owned(),
            message: error.message,
            operation_id: operation_id.into(),
            field_errors: error.field_errors,
            recovery: error.recovery,
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformRequestDto {
    pub platform: AgentPlatform,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateRequestDto {
    pub template_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavePersonalTemplateRequestDto {
    pub name: String,
    pub draft: AgentDraft,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ScanInstalledAgentsRequestDto {
    pub platforms: Option<Vec<AgentPlatform>>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRequestDto {
    pub source_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryRequestDto {
    pub recovery_id: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAgentRequestDto {
    pub source_id: String,
    pub expected_revision: SourceRevision,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAgentInstallRequestDto {
    pub draft: AgentDraft,
    pub targets: Vec<TargetSelection>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitAgentInstallRequestDto {
    pub write_plan_token: WritePlanToken,
}

#[derive(Debug, Clone, Copy, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ListCodexModelsRequestDto {
    pub force_refresh: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexModelListDto {
    pub base_url: String,
    pub models: Vec<String>,
    pub fetched_at_ms: i64,
    pub from_cache: bool,
}

impl From<ModelList> for CodexModelListDto {
    fn from(value: ModelList) -> Self {
        Self {
            base_url: value.base_url,
            models: value.models,
            fetched_at_ms: value.fetched_at_ms,
            from_cache: value.from_cache,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryScanDto {
    pub inventory_revision: String,
    pub directories: Vec<PlatformDirectory>,
    pub groups: Vec<InventoryGroup>,
}

impl From<InventoryScan> for InventoryScanDto {
    fn from(value: InventoryScan) -> Self {
        Self {
            inventory_revision: value.inventory_revision,
            directories: value.directories,
            groups: value.groups,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAgentContentDto {
    pub source_id: SourceId,
    pub platform: AgentPlatform,
    pub native_format: NativeFormat,
    pub content: String,
    pub path_label: String,
    pub revision: SourceRevision,
}

impl From<NativeAgentContent> for NativeAgentContentDto {
    fn from(value: NativeAgentContent) -> Self {
        Self {
            source_id: value.source_id,
            platform: value.platform,
            native_format: value.native_format,
            content: value.content,
            path_label: value.path_label,
            revision: value.revision,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportAgentResultDto {
    pub draft: AgentDraft,
    pub platform: AgentPlatform,
    pub source_id: SourceId,
    pub source_revision: SourceRevision,
    pub adapter_contract_version: String,
    pub preserved_fields: Vec<String>,
}

impl From<ImportAgentResult> for ImportAgentResultDto {
    fn from(value: ImportAgentResult) -> Self {
        Self {
            draft: value.draft,
            platform: value.platform,
            source_id: value.source_id,
            source_revision: value.source_revision,
            adapter_contract_version: value.adapter_contract_version,
            preserved_fields: value.preserved_fields,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;
    use crate::domain::agents::{ClaudeOverride, DraftProvenance, PlatformOverride};

    #[test]
    fn import_agent_result_matches_the_shared_frontend_fixture() {
        let dto = ImportAgentResultDto {
            draft: AgentDraft {
                logical_name: "imported-agent".to_owned(),
                description: "Imported native agent.".to_owned(),
                developer_instructions:
                    "Inspect the requested work.\nReturn a verifiable result and report missing evidence."
                        .to_owned(),
                platform_overrides: BTreeMap::from([(
                    AgentPlatform::Claude,
                    PlatformOverride::Claude(ClaudeOverride::default()),
                )]),
                provenance: DraftProvenance::Imported {
                    source_id: "source-id".to_owned(),
                    expected_revision: "revision".to_owned(),
                },
            },
            platform: AgentPlatform::Claude,
            source_id: SourceId("source-id".to_owned()),
            source_revision: SourceRevision("revision".to_owned()),
            adapter_contract_version: "claude-subagent-2026-07".to_owned(),
            preserved_fields: vec!["unknown_field".to_owned()],
        };
        let actual = serde_json::to_value(dto).expect("DTO serializes");
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/import-agent-result-claude.json"
        ))
        .expect("shared fixture parses");

        assert_eq!(actual, expected);
    }

    #[test]
    fn platform_directory_matches_the_shared_frontend_fixture() {
        let directory = PlatformDirectory {
            platform: AgentPlatform::Claude,
            absolute_path: "/Users/example/.claude/agents".to_owned(),
            source: crate::domain::agents::DirectorySource::Default,
            availability: crate::domain::agents::DirectoryAvailability::Missing,
            platform_detected: true,
            can_read: false,
            can_write: false,
        };
        let actual = serde_json::to_value(directory).expect("directory serializes");
        let expected: serde_json::Value = serde_json::from_str(include_str!(
            "../../../tests/fixtures/platform-directory-claude.json"
        ))
        .expect("shared fixture parses");

        assert_eq!(actual, expected);
    }

    #[test]
    fn recovery_action_struct_fields_use_camel_case() {
        let error = AppError::new(
            crate::error::AppErrorKind::RollbackFailed,
            "rollback failed",
        )
        .with_recovery(RecoveryAction::RevealRecoveryDirectory {
            recovery_id: "operation-id".to_owned(),
        });
        let serialized = serde_json::to_value(IpcErrorDto::from_error(error, "operation-id"))
            .expect("IPC error serializes");

        assert_eq!(
            serialized["recovery"],
            serde_json::json!({
                "action": "revealRecoveryDirectory",
                "recoveryId": "operation-id"
            })
        );
    }

    #[test]
    fn codex_model_list_dto_serializes_with_camel_case_keys() {
        let dto = CodexModelListDto {
            base_url: "https://api.openai.com/v1".to_owned(),
            models: vec!["gpt-5.4".to_owned(), "gpt-5.4-mini".to_owned()],
            fetched_at_ms: 1_234_000,
            from_cache: true,
        };
        let serialized = serde_json::to_value(dto).expect("model list DTO serializes");

        assert_eq!(
            serialized,
            serde_json::json!({
                "baseUrl": "https://api.openai.com/v1",
                "models": ["gpt-5.4", "gpt-5.4-mini"],
                "fetchedAtMs": 1_234_000,
                "fromCache": true
            })
        );
    }

    #[test]
    fn list_codex_models_request_accepts_camel_case_keys() {
        let request: ListCodexModelsRequestDto =
            serde_json::from_value(serde_json::json!({ "forceRefresh": true }))
                .expect("request DTO deserializes");

        assert!(request.force_refresh);
    }
}
