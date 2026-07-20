use std::{
    collections::{BTreeMap, BTreeSet},
    fs::Permissions,
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
};

use similar::TextDiff;
use uuid::Uuid;
use walkdir::WalkDir;

use crate::{
    adapters::agents::AdapterRegistry,
    domain::{
        agents::{
            validate_agent_draft, AgentDraft, AgentPlatform, BatchCommitResult, ConflictAction,
            DiscoveredAgent, DraftProvenance, InventoryGroup, NativeFormat, OwnershipStatus,
            ParseStatus, PlatformDirectory, PreviewBatch, PreviewTarget, SourceId, SourceRevision,
            TargetSelection, WritePlanToken,
        },
        ports::Clock,
    },
    error::{AppError, AppErrorKind, RecoveryAction},
    infrastructure::{
        database::{Database, ImportedSourceRecord},
        filesystem::{
            content_revision, ensure_safe_root, hash_bytes, hash_path, safe_path_label,
            write_atomic,
        },
        paths::PlatformPathResolver,
        source_registry::{RegisteredSource, SourceRegistry},
        transaction::BatchTransactionCoordinator,
        write_plan_store::{StoredTargetPlan, WritePlanStore},
    },
};

#[derive(Debug, Clone)]
pub struct InventoryScan {
    pub inventory_revision: String,
    pub directories: Vec<PlatformDirectory>,
    pub groups: Vec<InventoryGroup>,
}

#[derive(Debug, Clone)]
pub struct NativeAgentContent {
    pub source_id: SourceId,
    pub platform: AgentPlatform,
    pub native_format: NativeFormat,
    pub content: String,
    pub path_label: String,
    pub revision: SourceRevision,
}

#[derive(Debug, Clone)]
pub struct ImportAgentResult {
    pub draft: AgentDraft,
    pub platform: AgentPlatform,
    pub source_id: SourceId,
    pub source_revision: SourceRevision,
    pub adapter_contract_version: String,
    pub preserved_fields: Vec<String>,
}

#[derive(Clone)]
pub struct AgentApplicationService {
    adapters: AdapterRegistry,
    paths: Arc<PlatformPathResolver>,
    database: Arc<Database>,
    sources: Arc<SourceRegistry>,
    write_plans: Arc<WritePlanStore>,
    transaction: Arc<BatchTransactionCoordinator>,
    managed_sources_root: PathBuf,
    clock: Arc<dyn Clock>,
}

pub struct AgentServiceDependencies {
    pub adapters: AdapterRegistry,
    pub paths: Arc<PlatformPathResolver>,
    pub database: Arc<Database>,
    pub sources: Arc<SourceRegistry>,
    pub write_plans: Arc<WritePlanStore>,
    pub transaction: Arc<BatchTransactionCoordinator>,
    pub managed_sources_root: PathBuf,
    pub clock: Arc<dyn Clock>,
}

impl AgentApplicationService {
    pub fn new(dependencies: AgentServiceDependencies) -> Self {
        let AgentServiceDependencies {
            adapters,
            paths,
            database,
            sources,
            write_plans,
            transaction,
            managed_sources_root,
            clock,
        } = dependencies;
        Self {
            adapters,
            paths,
            database,
            sources,
            write_plans,
            transaction,
            managed_sources_root,
            clock,
        }
    }

    pub fn scan_installed_agents(
        &self,
        requested_platforms: Option<Vec<AgentPlatform>>,
    ) -> Result<InventoryScan, AppError> {
        let platforms = normalize_platforms(requested_platforms);
        let imported = self
            .database
            .imported_path_hashes()?
            .into_iter()
            .collect::<BTreeSet<_>>();
        let directories = platforms
            .iter()
            .map(|platform| self.paths.resolve(*platform))
            .collect::<Result<Vec<_>, AppError>>()?;
        let mut discovered = Vec::new();
        let mut registered = Vec::new();

        for platform in platforms.iter().copied() {
            let root = self.paths.root_path(platform)?;
            if !root.exists() {
                continue;
            }
            ensure_safe_root(&root)?;
            let adapter = self.adapters.get(platform);
            let adapter_platform = adapter.platform();
            for entry in WalkDir::new(&root)
                .min_depth(1)
                .max_depth(16)
                .follow_links(false)
            {
                let entry = match entry {
                    Ok(entry) => entry,
                    Err(error) => {
                        tracing::warn!(
                            platform = %platform,
                            error_kind = ?error.io_error().map(std::io::Error::kind),
                            "inventory entry could not be inspected"
                        );
                        continue;
                    }
                };
                if !entry.file_type().is_file()
                    || entry.path().extension().and_then(|value| value.to_str())
                        != Some(adapter_platform.extension())
                {
                    continue;
                }
                let path = entry.path().to_path_buf();
                let path_hash = hash_path(&path)?;
                let source_id = SourceId(format!("src_{}", &path_hash[..24]));
                let path_label = safe_path_label(&path, self.paths.home_dir());
                match std::fs::read(&path) {
                    Ok(bytes) => {
                        let revision = content_revision(&bytes);
                        let parse = adapter.parse(
                            &bytes,
                            path.file_name()
                                .and_then(|value| value.to_str())
                                .unwrap_or("agent"),
                        );
                        let (logical_name, description, parse_status, error_code) = match parse {
                            Ok(parsed) => (
                                parsed.draft.logical_name,
                                Some(parsed.draft.description),
                                if parsed.editable {
                                    ParseStatus::Valid
                                } else {
                                    ParseStatus::ReadOnlyUnsupported
                                },
                                None,
                            ),
                            Err(error) => (
                                file_stem_or_unknown(&path),
                                None,
                                ParseStatus::Invalid,
                                Some(error.code().to_owned()),
                            ),
                        };
                        discovered.push(DiscoveredAgent {
                            source_id: source_id.clone(),
                            platform: adapter_platform,
                            logical_name,
                            description,
                            revision: revision.clone(),
                            path_label,
                            parse_status,
                            ownership: if imported.contains(&path_hash) {
                                OwnershipStatus::Imported
                            } else {
                                OwnershipStatus::External
                            },
                            error_code,
                            compatibility_exposure: false,
                        });
                        registered.push(RegisteredSource {
                            id: source_id,
                            platform: adapter_platform,
                            path,
                            revision,
                        });
                    }
                    Err(error) => {
                        discovered.push(DiscoveredAgent {
                            source_id,
                            platform: adapter_platform,
                            logical_name: file_stem_or_unknown(&path),
                            description: None,
                            revision: SourceRevision("unreadable".to_owned()),
                            path_label,
                            parse_status: ParseStatus::Invalid,
                            ownership: OwnershipStatus::External,
                            error_code: Some(
                                if error.kind() == std::io::ErrorKind::PermissionDenied {
                                    "agent.permission_denied".to_owned()
                                } else {
                                    "agent.discovery_failed".to_owned()
                                },
                            ),
                            compatibility_exposure: false,
                        });
                    }
                }
            }
        }

        discovered.sort_by(|left, right| {
            left.logical_name
                .cmp(&right.logical_name)
                .then(left.platform.cmp(&right.platform))
                .then(left.path_label.cmp(&right.path_label))
        });
        self.sources.replace_platforms(&platforms, registered);
        let inventory_revision = inventory_revision(&discovered);
        let groups = group_inventory(discovered);

        Ok(InventoryScan {
            inventory_revision,
            directories,
            groups,
        })
    }

    pub fn get_agent_native_content(
        &self,
        source_id: &str,
    ) -> Result<NativeAgentContent, AppError> {
        let source = self.sources.get(source_id)?;
        let bytes = std::fs::read(&source.path)
            .map_err(|error| map_read_error(error, "无法读取原生 Agent 文件。"))?;
        let revision = content_revision(&bytes);
        if revision != source.revision {
            return Err(AppError::new(
                AppErrorKind::SourceChanged,
                "原生 Agent 文件已在外部修改，请刷新库存。",
            )
            .with_recovery(RecoveryAction::Refresh));
        }
        let content = String::from_utf8(bytes).map_err(|source| {
            AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                "原生 Agent 文件不是有效 UTF-8。",
            )
            .with_source(source)
        })?;
        Ok(NativeAgentContent {
            source_id: source.id,
            platform: source.platform,
            native_format: self.adapters.get(source.platform).native_format(),
            content,
            path_label: safe_path_label(&source.path, self.paths.home_dir()),
            revision,
        })
    }

    pub fn import_agent_for_editing(
        &self,
        source_id: &str,
        expected_revision: &SourceRevision,
    ) -> Result<ImportAgentResult, AppError> {
        let source = self.sources.get(source_id)?;
        let bytes = std::fs::read(&source.path)
            .map_err(|error| map_read_error(error, "无法读取待导入的原生 Agent 文件。"))?;
        let revision = content_revision(&bytes);
        if &revision != expected_revision || revision != source.revision {
            return Err(AppError::new(
                AppErrorKind::SourceChanged,
                "原生 Agent 文件已变化，未执行导入。",
            )
            .with_recovery(RecoveryAction::Refresh));
        }
        let adapter = self.adapters.get(source.platform);
        let mut parsed = adapter.parse(
            &bytes,
            source
                .path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("agent"),
        )?;
        if !parsed.editable {
            return Err(AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                parsed
                    .blocked_reason
                    .unwrap_or_else(|| "该文件无法证明安全 round-trip，只能只读查看。".to_owned()),
            ));
        }
        let snapshot_id = Uuid::new_v4().to_string();
        let snapshot_directory = self.managed_sources_root.join(source_id);
        let snapshot_path =
            snapshot_directory.join(format!("{}.{}", snapshot_id, source.platform.extension()));
        write_atomic(&snapshot_path, &bytes)?;
        std::fs::set_permissions(&snapshot_path, Permissions::from_mode(0o600)).map_err(
            |source| {
                AppError::new(
                    AppErrorKind::PermissionDenied,
                    "无法限制导入快照的文件权限。",
                )
                .with_source(source)
            },
        )?;
        let path_hash = hash_path(&source.path)?;
        self.database.record_import(ImportedSourceRecord {
            id: source_id,
            platform: source.platform,
            path_hash: &path_hash,
            revision: &revision.0,
            adapter_contract_version: adapter.contract_version(),
            snapshot_id: &snapshot_id,
            imported_at_ms: self.clock.now_ms(),
        })?;
        parsed.draft.provenance = DraftProvenance::Imported {
            source_id: source_id.to_owned(),
            expected_revision: revision.0.clone(),
        };
        Ok(ImportAgentResult {
            draft: parsed.draft,
            platform: source.platform,
            source_id: source.id,
            source_revision: revision,
            adapter_contract_version: adapter.contract_version().to_owned(),
            preserved_fields: parsed.preserved_fields,
        })
    }

    pub fn preview_agent_install(
        &self,
        draft: AgentDraft,
        targets: Vec<TargetSelection>,
    ) -> Result<PreviewBatch, AppError> {
        let draft_issues = validate_agent_draft(&draft);
        if !draft_issues.is_empty() {
            return Err(AppError::validation(draft_issues));
        }
        if targets.is_empty() {
            return Err(AppError::new(
                AppErrorKind::Validation,
                "至少选择一个目标平台。",
            ));
        }
        let mut seen_platforms = BTreeSet::new();
        for target in &targets {
            if !seen_platforms.insert(target.platform) {
                return Err(AppError::new(
                    AppErrorKind::Validation,
                    "同一目标平台只能选择一次。",
                ));
            }
        }

        let imported_source = self.resolve_imported_source(&draft)?;
        if let Some(source) = imported_source.as_ref() {
            if targets.len() != 1 || targets[0].platform != source.platform {
                return Err(AppError::new(
                    AppErrorKind::Validation,
                    "导入文件首版只能写回原平台；如需生成其他平台，请先保存为个人模板。",
                ));
            }
        }
        let mut stored_targets = Vec::new();
        let mut preview_targets = Vec::new();

        for selection in targets {
            let adapter = self.adapters.get(selection.platform);
            let validation_issues = adapter.validate_draft(&draft);
            if !validation_issues.is_empty() {
                return Err(AppError::validation(validation_issues));
            }
            let root = self.paths.root_path(selection.platform)?;
            if root.exists() {
                ensure_safe_root(&root)?;
            }
            let is_source_update = imported_source
                .as_ref()
                .is_some_and(|source| source.platform == selection.platform);
            let target_path = if is_source_update {
                let source = imported_source
                    .as_ref()
                    .ok_or_else(|| AppError::new(AppErrorKind::Internal, "导入来源状态不一致。"))?;
                source.path.clone()
            } else {
                root.join(format!(
                    "{}.{}",
                    draft.logical_name,
                    selection.platform.extension()
                ))
            };
            if target_path.parent() != Some(root.as_path()) {
                return Err(AppError::new(
                    AppErrorKind::UnsafePath,
                    "目标路径不在已解析平台目录内。",
                ));
            }
            let existing = read_optional(&target_path)?;
            if is_source_update {
                let source = imported_source
                    .as_ref()
                    .ok_or_else(|| AppError::new(AppErrorKind::Internal, "导入来源状态不一致。"))?;
                let current = existing.as_deref().ok_or_else(|| {
                    AppError::new(
                        AppErrorKind::SourceChanged,
                        "导入来源已被删除，请刷新并重新导入。",
                    )
                    .with_recovery(RecoveryAction::Refresh)
                })?;
                if content_revision(current) != source.revision {
                    return Err(AppError::new(
                        AppErrorKind::SourceChanged,
                        "导入来源在导入后发生变化，请刷新并重新导入。",
                    )
                    .with_recovery(RecoveryAction::Refresh));
                }
                let parsed = adapter.parse(
                    current,
                    source
                        .path
                        .file_name()
                        .and_then(|value| value.to_str())
                        .unwrap_or("agent"),
                )?;
                if parsed.draft.logical_name != draft.logical_name {
                    return Err(AppError::new(
                        AppErrorKind::Validation,
                        "导入文件首版不支持改名写回；请保持原名称或另存为新模板。",
                    ));
                }
            }
            let expected_revision = existing.as_deref().map(content_revision);
            let rendered = adapter.render(&draft, existing.as_deref())?;
            let proposed = String::from_utf8(rendered.bytes.clone()).map_err(|source| {
                AppError::new(AppErrorKind::Internal, "适配器生成了非 UTF-8 内容。")
                    .with_source(source)
            })?;
            let current = existing
                .as_ref()
                .map(|bytes| String::from_utf8_lossy(bytes).into_owned())
                .unwrap_or_default();
            let conflict_detected = existing.is_some() && !is_source_update;
            let will_create_backup = existing.is_some()
                && (is_source_update
                    || selection.conflict_action == ConflictAction::ReplaceAfterBackup);
            preview_targets.push(PreviewTarget {
                platform: selection.platform,
                target_path: safe_path_label(&target_path, self.paths.home_dir()),
                native_format: rendered.native_format,
                native_content: proposed.clone(),
                unified_diff: unified_diff(&current, &proposed),
                current_revision: expected_revision.clone(),
                will_create_directory: !root.exists(),
                will_create_backup,
                conflict_detected,
                validation_issues: Vec::new(),
                capability_issues: rendered.capability_issues.clone(),
            });
            stored_targets.push(StoredTargetPlan {
                platform: selection.platform,
                root,
                target: target_path,
                rendered_bytes: rendered.bytes,
                expected_revision,
                conflict_action: selection.conflict_action,
                is_source_update,
            });
        }

        let (token, expires_at_ms) = self.write_plans.create(stored_targets);
        Ok(PreviewBatch {
            token,
            expires_at_ms,
            targets: preview_targets,
        })
    }

    pub fn commit_agent_install(
        &self,
        token: &WritePlanToken,
    ) -> Result<BatchCommitResult, AppError> {
        let plan = self.write_plans.take(token)?;
        self.transaction.commit(plan)
    }

    pub fn source_path(&self, source_id: &str) -> Result<PathBuf, AppError> {
        Ok(self.sources.get(source_id)?.path)
    }

    pub fn recovery_path(&self, recovery_id: &str) -> Result<PathBuf, AppError> {
        self.transaction.recovery_path(recovery_id)
    }

    fn resolve_imported_source(
        &self,
        draft: &AgentDraft,
    ) -> Result<Option<RegisteredSource>, AppError> {
        let DraftProvenance::Imported {
            source_id,
            expected_revision,
        } = &draft.provenance
        else {
            return Ok(None);
        };
        let source = self.sources.get(source_id)?;
        if source.revision.0 != *expected_revision {
            return Err(AppError::new(
                AppErrorKind::SourceChanged,
                "导入来源已经变化，请重新导入。",
            )
            .with_recovery(RecoveryAction::Refresh));
        }
        Ok(Some(source))
    }
}

fn normalize_platforms(requested_platforms: Option<Vec<AgentPlatform>>) -> Vec<AgentPlatform> {
    let mut values = requested_platforms.unwrap_or_else(|| AgentPlatform::ALL.to_vec());
    if values.is_empty() {
        values = AgentPlatform::ALL.to_vec();
    }
    values.sort();
    values.dedup();
    values
}

fn group_inventory(discovered: Vec<DiscoveredAgent>) -> Vec<InventoryGroup> {
    let mut grouped = BTreeMap::<String, Vec<DiscoveredAgent>>::new();
    for source in discovered {
        grouped
            .entry(source.logical_name.clone())
            .or_default()
            .push(source);
    }
    grouped
        .into_iter()
        .map(|(logical_name, sources)| {
            let mut counts = BTreeMap::<AgentPlatform, usize>::new();
            for source in &sources {
                if !source.compatibility_exposure {
                    *counts.entry(source.platform).or_default() += 1;
                }
            }
            let has_conflict = counts.values().any(|count| *count > 1);
            InventoryGroup {
                logical_name,
                sources,
                has_conflict,
            }
        })
        .collect()
}

fn inventory_revision(discovered: &[DiscoveredAgent]) -> String {
    let canonical = discovered
        .iter()
        .map(|source| {
            format!(
                "{}:{}:{}",
                source.source_id.0, source.platform, source.revision.0
            )
        })
        .collect::<Vec<_>>()
        .join("|");
    hash_bytes(canonical.as_bytes())
}

fn unified_diff(current: &str, proposed: &str) -> String {
    TextDiff::from_lines(current, proposed)
        .unified_diff()
        .context_radius(3)
        .header("current", "proposed")
        .to_string()
}

fn file_stem_or_unknown(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .map(str::to_owned)
        .unwrap_or_else(|| "unknown-agent".to_owned())
}

fn read_optional(path: &Path) -> Result<Option<Vec<u8>>, AppError> {
    match std::fs::read(path) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(map_read_error(error, "无法读取目标 Agent 文件。")),
    }
}

fn map_read_error(error: std::io::Error, message: &str) -> AppError {
    if error.kind() == std::io::ErrorKind::PermissionDenied {
        AppError::new(AppErrorKind::PermissionDenied, message).with_source(error)
    } else {
        AppError::new(AppErrorKind::Internal, message).with_source(error)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use tempfile::{tempdir, TempDir};

    use super::*;
    use crate::{
        domain::{
            agents::{
                ClaudeOverride, CodexOverride, CommitTargetStatus, CursorOverride,
                PlatformOverride, ResponseLanguage, SharedInstructionContract, UsageContract,
            },
            ports::Clock,
        },
        infrastructure::{
            database::Database, source_registry::SourceRegistry,
            transaction::BatchTransactionCoordinator, write_plan_store::WritePlanStore,
        },
    };

    #[derive(Debug)]
    struct FixedClock;

    impl Clock for FixedClock {
        fn now_ms(&self) -> i64 {
            1_000
        }
    }

    struct TestHarness {
        service: AgentApplicationService,
    }

    impl TestHarness {
        fn new(temporary: &TempDir) -> Self {
            let home = temporary.path().join("home");
            std::fs::create_dir_all(&home).expect("temporary home creates");
            let clock = Arc::new(FixedClock);
            let database = Arc::new(Database::in_memory().expect("database initializes"));
            let paths = Arc::new(PlatformPathResolver::new(
                home,
                database.clone(),
                clock.clone(),
            ));
            let sources = Arc::new(SourceRegistry::default());
            let write_plans = Arc::new(WritePlanStore::new(clock.clone()));
            let adapters = AdapterRegistry::default();
            let transaction = Arc::new(BatchTransactionCoordinator::new(
                paths.clone(),
                adapters.clone(),
                database.clone(),
                temporary.path().join("backups"),
                clock.clone(),
            ));
            let service = AgentApplicationService::new(AgentServiceDependencies {
                adapters,
                paths,
                database,
                sources,
                write_plans,
                transaction,
                managed_sources_root: temporary.path().join("managed-sources"),
                clock,
            });
            Self { service }
        }

        fn write_native_agent(&self, draft: &AgentDraft, platform: AgentPlatform) -> PathBuf {
            let adapter = self.service.adapters.get(platform);
            let rendered = adapter.render(draft, None).expect("native agent renders");
            let root = self
                .service
                .paths
                .root_path(platform)
                .expect("platform root resolves");
            std::fs::create_dir_all(&root).expect("platform root creates");
            let path = root.join(rendered.file_name);
            std::fs::write(&path, rendered.bytes).expect("native agent writes");
            path
        }
    }

    fn sample_draft() -> AgentDraft {
        AgentDraft {
            logical_name: "test-agent".to_owned(),
            description: "Use this agent for contract tests.".to_owned(),
            shared: SharedInstructionContract {
                role_goal: "Inspect the requested work.".to_owned(),
                when_to_use: vec!["The task needs focused analysis.".to_owned()],
                when_not_to_use: vec!["The task is already complete.".to_owned()],
                input_requirements: vec!["The original request.".to_owned()],
                execution_steps: vec!["Inspect the evidence.".to_owned()],
                output_contract: "Return a verifiable result.".to_owned(),
                constraints: vec!["Do not invent evidence.".to_owned()],
                stop_conditions: vec!["The result is verified.".to_owned()],
                failure_handling: "Report missing evidence.".to_owned(),
            },
            response_language: ResponseLanguage::FollowUser,
            usage: UsageContract {
                explicit_invocation_examples: vec!["Inspect this task.".to_owned()],
                auto_delegation_guidance: "Use for focused analysis.".to_owned(),
                verification_task: "Verify the result against the source.".to_owned(),
            },
            platform_overrides: BTreeMap::from([
                (
                    AgentPlatform::Claude,
                    PlatformOverride::Claude(ClaudeOverride::default()),
                ),
                (
                    AgentPlatform::Codex,
                    PlatformOverride::Codex(CodexOverride::default()),
                ),
                (
                    AgentPlatform::Cursor,
                    PlatformOverride::Cursor(CursorOverride::default()),
                ),
            ]),
            provenance: DraftProvenance::BuiltinTemplate {
                template_id: "test-template".to_owned(),
                template_version: "1.0.0".to_owned(),
            },
        }
    }

    fn discovered_source(scan: &InventoryScan, platform: AgentPlatform) -> DiscoveredAgent {
        scan.groups
            .iter()
            .flat_map(|group| &group.sources)
            .find(|source| source.platform == platform)
            .cloned()
            .expect("platform source is discovered")
    }

    #[test]
    fn partial_inventory_scan_preserves_sources_from_other_platforms() {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        let draft = sample_draft();
        harness.write_native_agent(&draft, AgentPlatform::Claude);
        harness.write_native_agent(&draft, AgentPlatform::Codex);
        let initial = harness
            .service
            .scan_installed_agents(None)
            .expect("initial inventory scan succeeds");
        let codex = discovered_source(&initial, AgentPlatform::Codex);

        harness
            .service
            .scan_installed_agents(Some(vec![AgentPlatform::Claude]))
            .expect("partial inventory scan succeeds");
        let imported = harness
            .service
            .import_agent_for_editing(&codex.source_id.0, &codex.revision)
            .expect("Codex source remains registered");

        assert_eq!(imported.platform, AgentPlatform::Codex);
    }

    #[test]
    fn preview_rejects_an_imported_source_changed_on_disk() {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        let draft = sample_draft();
        let path = harness.write_native_agent(&draft, AgentPlatform::Claude);
        let scan = harness
            .service
            .scan_installed_agents(None)
            .expect("inventory scan succeeds");
        let source = discovered_source(&scan, AgentPlatform::Claude);
        let imported = harness
            .service
            .import_agent_for_editing(&source.source_id.0, &source.revision)
            .expect("source imports");
        std::fs::write(&path, b"externally changed").expect("source changes externally");

        let error = harness
            .service
            .preview_agent_install(
                imported.draft,
                vec![TargetSelection {
                    platform: AgentPlatform::Claude,
                    conflict_action: ConflictAction::Fail,
                }],
            )
            .expect_err("changed source blocks preview");

        assert_eq!(error.kind, AppErrorKind::SourceChanged);
    }

    #[test]
    fn imported_drafts_can_only_target_their_source_platform() {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        let draft = sample_draft();
        harness.write_native_agent(&draft, AgentPlatform::Claude);
        let scan = harness
            .service
            .scan_installed_agents(None)
            .expect("inventory scan succeeds");
        let source = discovered_source(&scan, AgentPlatform::Claude);
        let imported = harness
            .service
            .import_agent_for_editing(&source.source_id.0, &source.revision)
            .expect("source imports");

        let error = harness
            .service
            .preview_agent_install(
                imported.draft,
                vec![TargetSelection {
                    platform: AgentPlatform::Codex,
                    conflict_action: ConflictAction::Fail,
                }],
            )
            .expect_err("cross-platform imported write is blocked");

        assert_eq!(error.kind, AppErrorKind::Validation);
    }

    #[test]
    fn inventory_refresh_tracks_native_file_additions_and_deletions() {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        assert!(harness
            .service
            .scan_installed_agents(None)
            .expect("empty inventory scans")
            .groups
            .is_empty());

        let path = harness.write_native_agent(&sample_draft(), AgentPlatform::Cursor);
        let populated = harness
            .service
            .scan_installed_agents(None)
            .expect("populated inventory scans");
        assert_eq!(
            discovered_source(&populated, AgentPlatform::Cursor).logical_name,
            "test-agent"
        );

        std::fs::remove_file(path).expect("native source deletes");
        assert!(harness
            .service
            .scan_installed_agents(None)
            .expect("updated inventory scans")
            .groups
            .is_empty());
    }

    #[test]
    fn inventory_treats_cross_platform_variants_as_normal_and_same_platform_duplicates_as_conflict()
    {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        let draft = sample_draft();
        let claude_path = harness.write_native_agent(&draft, AgentPlatform::Claude);
        harness.write_native_agent(&draft, AgentPlatform::Codex);

        let cross_platform = harness
            .service
            .scan_installed_agents(None)
            .expect("cross-platform inventory scans");
        let group = cross_platform
            .groups
            .iter()
            .find(|group| group.logical_name == "test-agent")
            .expect("logical agent group exists");
        assert!(!group.has_conflict);
        assert_eq!(group.sources.len(), 2);

        let duplicate_directory = claude_path
            .parent()
            .expect("Claude source has a parent")
            .join("nested");
        std::fs::create_dir_all(&duplicate_directory).expect("nested directory creates");
        std::fs::copy(&claude_path, duplicate_directory.join("duplicate.md"))
            .expect("duplicate Claude source copies");
        let duplicated = harness
            .service
            .scan_installed_agents(None)
            .expect("duplicate inventory scans");
        let group = duplicated
            .groups
            .iter()
            .find(|group| group.logical_name == "test-agent")
            .expect("logical agent group exists");

        assert!(group.has_conflict);
        assert_eq!(
            group
                .sources
                .iter()
                .filter(|source| source.platform == AgentPlatform::Claude)
                .count(),
            2
        );
    }

    #[test]
    fn three_platform_preview_commit_and_inventory_round_trip() {
        let temporary = tempdir().expect("temporary directory creates");
        let harness = TestHarness::new(&temporary);
        let targets = AgentPlatform::ALL
            .into_iter()
            .map(|platform| TargetSelection {
                platform,
                conflict_action: ConflictAction::Fail,
            })
            .collect();

        let preview = harness
            .service
            .preview_agent_install(sample_draft(), targets)
            .expect("three-platform preview succeeds");
        assert_eq!(preview.targets.len(), 3);
        assert!(preview
            .targets
            .iter()
            .all(|target| target.will_create_directory && !target.conflict_detected));

        let result = harness
            .service
            .commit_agent_install(&preview.token)
            .expect("three-platform batch commits");
        assert_eq!(result.targets.len(), 3);
        assert!(result
            .targets
            .iter()
            .all(|target| target.status == CommitTargetStatus::Committed));

        let inventory = harness
            .service
            .scan_installed_agents(None)
            .expect("committed inventory scans");
        let group = inventory
            .groups
            .iter()
            .find(|group| group.logical_name == "test-agent")
            .expect("installed logical agent is grouped");
        assert_eq!(group.sources.len(), 3);
        assert!(!group.has_conflict);
    }
}
