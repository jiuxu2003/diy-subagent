use std::{collections::BTreeMap, sync::Arc};

use crate::{
    adapters::agents::AdapterRegistry,
    domain::{
        agents::{
            AgentDraft, AgentPlatform, ClaudeOverride, CodexOverride, CursorOverride,
            PlatformOverride,
        },
        templates::{TemplateManifest, TemplatePackage, TemplateRisk, TemplateSummary},
    },
    error::{AppError, AppErrorKind},
    infrastructure::templates::TemplateRepository,
};

#[derive(Clone)]
pub struct TemplateService {
    repository: Arc<TemplateRepository>,
    adapters: AdapterRegistry,
}

impl TemplateService {
    pub fn new(repository: Arc<TemplateRepository>, adapters: AdapterRegistry) -> Self {
        Self {
            repository,
            adapters,
        }
    }

    pub fn list_templates(&self) -> Vec<TemplateSummary> {
        self.repository.list()
    }

    pub fn get_template(&self, id: &str) -> Result<TemplatePackage, AppError> {
        self.repository.get(id)
    }

    pub fn save_personal_template(
        &self,
        name: String,
        draft: AgentDraft,
    ) -> Result<TemplateSummary, AppError> {
        let name = name.trim();
        if name.is_empty() {
            return Err(AppError::new(
                AppErrorKind::Validation,
                "个人模板名称不能为空。",
            ));
        }
        let adapter_contracts = AgentPlatform::ALL
            .into_iter()
            .map(|platform| {
                (
                    platform,
                    self.adapters.get(platform).contract_version().to_owned(),
                )
            })
            .collect();
        let platform_overrides = complete_platform_overrides(draft.platform_overrides.clone());
        let package = TemplatePackage {
            manifest: TemplateManifest {
                id: format!("personal-{}", draft.logical_name),
                version: "1.0.0".to_owned(),
                name: name.to_owned(),
                description: draft.description.clone(),
                author: "本机用户".to_owned(),
                source: "personal".to_owned(),
                tags: vec!["个人模板".to_owned()],
                supported_platforms: AgentPlatform::ALL.to_vec(),
                risk: TemplateRisk {
                    level: "local".to_owned(),
                    summary: "仅保存在本机；安装前仍会执行逐平台预览和安全校验。".to_owned(),
                },
                adapter_contracts,
            },
            logical_name: draft.logical_name,
            default_description: draft.description,
            developer_instructions: draft.developer_instructions,
            platform_overrides,
        };
        self.repository.save_personal(package)
    }
}

fn complete_platform_overrides(
    mut overrides: BTreeMap<AgentPlatform, PlatformOverride>,
) -> BTreeMap<AgentPlatform, PlatformOverride> {
    for platform in AgentPlatform::ALL {
        overrides.entry(platform).or_insert_with(|| match platform {
            AgentPlatform::Claude => PlatformOverride::Claude(ClaudeOverride::default()),
            AgentPlatform::Codex => PlatformOverride::Codex(CodexOverride::default()),
            AgentPlatform::Cursor => PlatformOverride::Cursor(CursorOverride::default()),
        });
    }
    overrides
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        domain::{agents::DraftProvenance, ports::SystemClock},
        infrastructure::database::Database,
    };
    use tempfile::{tempdir, TempDir};

    struct OfficialTemplate {
        id: &'static str,
        model: &'static str,
        effort: &'static str,
        sandbox: Option<&'static str>,
        extra: Option<&'static str>,
    }

    const OFFICIAL_TEMPLATES: [OfficialTemplate; 6] = [
        OfficialTemplate {
            id: "pr_explorer",
            model: "gpt-5.3-codex-spark",
            effort: "medium",
            sandbox: Some("read-only"),
            extra: None,
        },
        OfficialTemplate {
            id: "reviewer",
            model: "gpt-5.4",
            effort: "high",
            sandbox: Some("read-only"),
            extra: None,
        },
        OfficialTemplate {
            id: "docs_researcher",
            model: "gpt-5.4-mini",
            effort: "medium",
            sandbox: Some("read-only"),
            extra: Some("[mcp_servers.openaiDeveloperDocs]"),
        },
        OfficialTemplate {
            id: "code_mapper",
            model: "gpt-5.4-mini",
            effort: "medium",
            sandbox: Some("read-only"),
            extra: None,
        },
        OfficialTemplate {
            id: "browser_debugger",
            model: "gpt-5.4",
            effort: "high",
            sandbox: Some("workspace-write"),
            extra: Some("startup_timeout_sec = 20"),
        },
        OfficialTemplate {
            id: "ui_fixer",
            model: "gpt-5.3-codex-spark",
            effort: "medium",
            sandbox: None,
            extra: Some("[[skills.config]]"),
        },
    ];

    fn service(temporary: &TempDir) -> TemplateService {
        let clock = Arc::new(SystemClock);
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let repository = Arc::new(
            TemplateRepository::load(temporary.path().join("templates"), database, clock)
                .expect("template repository loads"),
        );
        TemplateService::new(repository, AdapterRegistry::default())
    }

    #[test]
    fn saves_personal_templates_with_current_adapter_contracts() {
        let temporary = tempdir().expect("temporary directory creates");
        let service = service(&temporary);
        let draft = service
            .get_template("pr_explorer")
            .expect("built-in template loads")
            .to_draft();
        let logical_name = draft.logical_name.clone();

        let summary = service
            .save_personal_template("我的个人模板".to_owned(), draft)
            .expect("personal template saves");
        let saved = service
            .get_template(&summary.id)
            .expect("personal template reloads");

        assert_eq!(summary.id, format!("personal-{logical_name}"));
        assert_eq!(saved.manifest.source, "personal");
        assert_eq!(saved.manifest.adapter_contracts.len(), 3);
        assert_eq!(saved.platform_overrides.len(), 3);
        assert!(!saved.developer_instructions.is_empty());
        assert!(temporary
            .path()
            .join("templates")
            .join(&summary.id)
            .join("1.0.0.json")
            .is_file());
    }

    #[test]
    fn saving_an_imported_single_platform_draft_completes_template_overrides() {
        let temporary = tempdir().expect("temporary directory creates");
        let service = service(&temporary);
        let mut draft = service
            .get_template("docs_researcher")
            .expect("built-in template loads")
            .to_draft();
        draft
            .platform_overrides
            .retain(|platform, _| *platform == AgentPlatform::Codex);
        draft.provenance = DraftProvenance::Imported {
            source_id: "source-id".to_owned(),
            expected_revision: "revision".to_owned(),
        };

        let summary = service
            .save_personal_template("导入后模板".to_owned(), draft)
            .expect("single-platform draft saves as a reusable template");
        let saved = service
            .get_template(&summary.id)
            .expect("personal template reloads");

        assert_eq!(saved.platform_overrides.len(), 3);
        assert!(AgentPlatform::ALL
            .into_iter()
            .all(|platform| saved.platform_overrides.contains_key(&platform)));
    }

    #[test]
    fn builtin_catalog_contains_the_blank_template_and_the_six_official_examples() {
        let temporary = tempdir().expect("temporary directory creates");
        let service = service(&temporary);
        let summaries = service.list_templates();

        assert_eq!(summaries.len(), 7);
        assert!(summaries
            .iter()
            .any(|summary| summary.id == "custom-blank" && summary.name == "自定义"));
        for template in &OFFICIAL_TEMPLATES {
            assert!(
                summaries.iter().any(|summary| summary.id == template.id),
                "official template {} is listed",
                template.id
            );
        }
    }

    #[test]
    fn the_blank_template_starts_empty_with_codex_defaults() {
        let temporary = tempdir().expect("temporary directory creates");
        let service = service(&temporary);
        let package = service
            .get_template("custom-blank")
            .expect("blank template loads");

        assert_eq!(package.logical_name, "");
        assert_eq!(package.default_description, "");
        assert_eq!(package.developer_instructions, "");
        assert_eq!(package.platform_overrides.len(), 3);
        let Some(PlatformOverride::Codex(codex)) =
            package.platform_overrides.get(&AgentPlatform::Codex)
        else {
            panic!("blank template carries a Codex override");
        };
        assert_eq!(codex.model_reasoning_effort.as_deref(), Some("medium"));
        assert_eq!(codex.sandbox_mode.as_deref(), Some("read-only"));
        assert_eq!(codex.model, None);
        assert_eq!(codex.extra_toml, None);
    }

    #[test]
    fn official_templates_render_deterministic_codex_files_matching_the_docs() {
        let temporary = tempdir().expect("temporary directory creates");
        let service = service(&temporary);
        let adapter = service.adapters.get(AgentPlatform::Codex);

        for OfficialTemplate {
            id,
            model,
            effort,
            sandbox,
            extra,
        } in OFFICIAL_TEMPLATES
        {
            let package = service.get_template(id).expect("official template loads");
            assert_eq!(
                package.manifest.supported_platforms,
                vec![AgentPlatform::Codex],
                "{id} targets Codex only"
            );
            let draft = package.to_draft();
            assert!(
                adapter.validate_draft(&draft).is_empty(),
                "{id} draft validates"
            );

            let first = adapter.render(&draft, None).expect("template renders");
            let second = adapter.render(&draft, None).expect("template rerenders");
            assert_eq!(first.bytes, second.bytes, "{id} renders deterministically");
            assert_eq!(first.file_name, format!("{id}.toml"));

            let text = String::from_utf8(first.bytes.clone()).expect("render is UTF-8");
            assert!(text.contains(&format!("name = \"{id}\"")));
            assert!(text.contains(&format!("model = \"{model}\"")));
            assert!(text.contains(&format!("model_reasoning_effort = \"{effort}\"")));
            match sandbox {
                Some(sandbox) => {
                    assert!(text.contains(&format!("sandbox_mode = \"{sandbox}\"")));
                }
                None => assert!(!text.contains("sandbox_mode"), "{id} inherits the sandbox"),
            }
            assert!(text.contains("developer_instructions = "));
            if let Some(extra) = extra {
                assert!(text.contains(extra), "{id} render contains {extra}");
            }

            let parsed = adapter
                .parse(&first.bytes, &first.file_name)
                .expect("rendered template parses");
            assert!(parsed.editable, "{id} parses back as editable");
            assert_eq!(parsed.draft.logical_name, draft.logical_name);
            assert_eq!(
                parsed.draft.developer_instructions,
                draft.developer_instructions.trim()
            );
        }
    }
}
