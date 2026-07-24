use std::{collections::BTreeMap, str::FromStr};

use toml_edit::{value, Array, DocumentMut, Item, Value};

use crate::{
    domain::{
        agents::{
            validate_agent_draft, AgentDraft, AgentPlatform, CapabilityDisposition,
            CapabilityIssue, CodexOverride, DraftProvenance, NativeFormat, PlatformOverride,
            ValidationIssue,
        },
        ports::{AgentFormatAdapter, ParsedNativeAgent, RenderedNativeAgent},
    },
    error::{AppError, AppErrorKind},
};

const CONTRACT_VERSION: &str = "codex-custom-agent-2026-07";

#[derive(Debug, Default)]
pub struct CodexAdapter;

impl AgentFormatAdapter for CodexAdapter {
    fn platform(&self) -> AgentPlatform {
        AgentPlatform::Codex
    }

    fn contract_version(&self) -> &'static str {
        CONTRACT_VERSION
    }

    fn native_format(&self) -> NativeFormat {
        NativeFormat::Toml
    }

    fn validate_draft(&self, draft: &AgentDraft) -> Vec<ValidationIssue> {
        validate_agent_draft(draft)
    }

    fn parse(&self, bytes: &[u8], source_name: &str) -> Result<ParsedNativeAgent, AppError> {
        let text = std::str::from_utf8(bytes).map_err(|source| {
            AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                "Codex Agent 文件不是有效 UTF-8，应用只能只读展示。",
            )
            .with_source(source)
        })?;
        let document = DocumentMut::from_str(text).map_err(|source| {
            AppError::new(
                AppErrorKind::Validation,
                format!("无法解析 {source_name} 的 TOML。"),
            )
            .with_source(source)
        })?;
        let name = required_string(&document, "name")?;
        let description = required_string(&document, "description")?;
        let developer_instructions = required_string(&document, "developer_instructions")?;
        let mut platform_overrides = BTreeMap::new();
        platform_overrides.insert(
            AgentPlatform::Codex,
            PlatformOverride::Codex(CodexOverride {
                model: optional_string(&document, "model"),
                model_reasoning_effort: optional_string(&document, "model_reasoning_effort"),
                sandbox_mode: optional_string(&document, "sandbox_mode"),
                nickname_candidates: string_array(&document, "nickname_candidates"),
                // Unknown tables stay in the original file and are preserved
                // through the `original_bytes` render path; only their key
                // names are surfaced via `preserved_fields`.
                extra_toml: None,
            }),
        );

        let preserved_fields = document
            .iter()
            .map(|(key, _)| key)
            .filter(|key| !CodexOverride::RESERVED_TOP_LEVEL_KEYS.contains(key))
            .map(str::to_owned)
            .collect();

        Ok(ParsedNativeAgent {
            draft: AgentDraft {
                logical_name: name,
                description,
                developer_instructions,
                platform_overrides,
                provenance: DraftProvenance::NativeSource {
                    platform: AgentPlatform::Codex,
                },
            },
            editable: true,
            blocked_reason: None,
            preserved_fields,
        })
    }

    fn render(
        &self,
        draft: &AgentDraft,
        original_bytes: Option<&[u8]>,
    ) -> Result<RenderedNativeAgent, AppError> {
        let mut document = if let Some(bytes) = original_bytes {
            let text = std::str::from_utf8(bytes).map_err(|source| {
                AppError::new(
                    AppErrorKind::LossyRoundTripBlocked,
                    "Codex Agent 文件不是有效 UTF-8，不能安全覆盖。",
                )
                .with_source(source)
            })?;
            DocumentMut::from_str(text).map_err(|source| {
                AppError::new(
                    AppErrorKind::LossyRoundTripBlocked,
                    "无法安全解析待替换的 Codex TOML。",
                )
                .with_source(source)
            })?
        } else {
            DocumentMut::new()
        };

        document["name"] = value(draft.logical_name.trim());
        document["description"] = value(draft.description.trim());
        document["developer_instructions"] = value(draft.developer_instructions.trim());

        let platform_override = match draft.platform_overrides.get(&AgentPlatform::Codex) {
            Some(PlatformOverride::Codex(value)) => value.clone(),
            _ => CodexOverride::default(),
        };
        set_optional_string(&mut document, "model", platform_override.model.as_deref());
        set_optional_string(
            &mut document,
            "model_reasoning_effort",
            platform_override.model_reasoning_effort.as_deref(),
        );
        set_optional_string(
            &mut document,
            "sandbox_mode",
            platform_override.sandbox_mode.as_deref(),
        );
        if platform_override.nickname_candidates.is_empty() {
            document.remove("nickname_candidates");
        } else {
            let mut values = Array::new();
            for nickname in platform_override.nickname_candidates {
                values.push(nickname);
            }
            document["nickname_candidates"] = Item::Value(Value::Array(values));
        }
        merge_extra_toml(&mut document, platform_override.extra_toml.as_deref())?;

        let capability_issues = vec![CapabilityIssue {
            id: "codex.prompt-only-tool-contract".to_owned(),
            field: "developerInstructions".to_owned(),
            platform: AgentPlatform::Codex,
            disposition: CapabilityDisposition::PromptOnly,
            explanation: "Codex 可通过 sandbox_mode 强制沙箱边界，但工具白名单等工作契约仍主要依赖 developer_instructions。"
                .to_owned(),
        }];

        Ok(RenderedNativeAgent {
            file_name: format!("{}.toml", draft.logical_name),
            native_format: NativeFormat::Toml,
            bytes: document.to_string().into_bytes(),
            capability_issues,
        })
    }
}

/// Merges the free-form TOML fragment into the rendered document. Same-key
/// assignment replaces the existing item, so tables never duplicate.
/// Reserved-key collisions are rejected earlier by draft validation.
fn merge_extra_toml(document: &mut DocumentMut, extra_toml: Option<&str>) -> Result<(), AppError> {
    let Some(extra) = extra_toml.map(str::trim).filter(|value| !value.is_empty()) else {
        return Ok(());
    };
    let fragment = DocumentMut::from_str(extra).map_err(|source| {
        AppError::new(AppErrorKind::Validation, "附加 TOML 无法解析，请检查语法。")
            .with_source(source)
    })?;
    for (key, item) in fragment.iter() {
        document.insert(key, item.clone());
    }
    Ok(())
}

fn required_string(document: &DocumentMut, field: &'static str) -> Result<String, AppError> {
    optional_string(document, field).ok_or_else(|| {
        AppError::new(
            AppErrorKind::Validation,
            format!("Codex Agent 缺少必填字段 `{field}`。"),
        )
    })
}

fn optional_string(document: &DocumentMut, field: &str) -> Option<String> {
    document
        .get(field)
        .and_then(Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn string_array(document: &DocumentMut, field: &str) -> Vec<String> {
    document
        .get(field)
        .and_then(Item::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .collect()
}

fn set_optional_string(document: &mut DocumentMut, field: &str, candidate: Option<&str>) {
    if let Some(text) = candidate
        .map(str::trim)
        .filter(|candidate| !candidate.is_empty())
    {
        document[field] = value(text);
    } else {
        document.remove(field);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use crate::domain::{
        agents::{AgentDraft, AgentPlatform, CodexOverride, DraftProvenance, PlatformOverride},
        ports::AgentFormatAdapter,
    };

    use super::CodexAdapter;

    #[test]
    fn preserves_unknown_codex_tables() {
        let original = br#"
name = "reviewer"
description = "Reviews changes."
developer_instructions = "legacy body"

[mcp_servers.docs]
url = "https://developers.openai.com/mcp"
"#;
        let draft = sample_draft(CodexOverride::default());
        let rendered = CodexAdapter
            .render(&draft, Some(original))
            .expect("render succeeds");
        let text = String::from_utf8(rendered.bytes).expect("valid UTF-8");

        assert!(text.contains("[mcp_servers.docs]"));
        assert!(text.contains("developer_instructions"));
    }

    #[test]
    fn parses_a_plain_native_file_as_editable() {
        let original = br#"
name = "docs_researcher"
description = "Documentation specialist."
developer_instructions = "Use the docs MCP server.\nDo not make code changes."
model = "gpt-5.4-mini"
model_reasoning_effort = "medium"
sandbox_mode = "read-only"

[mcp_servers.openaiDeveloperDocs]
url = "https://developers.openai.com/mcp"
"#;
        let parsed = CodexAdapter
            .parse(original, "docs_researcher.toml")
            .expect("plain TOML parses");

        assert!(parsed.editable);
        assert_eq!(parsed.blocked_reason, None);
        assert_eq!(parsed.draft.logical_name, "docs_researcher");
        assert_eq!(
            parsed.draft.developer_instructions,
            "Use the docs MCP server.\nDo not make code changes."
        );
        assert_eq!(parsed.preserved_fields, vec!["mcp_servers".to_owned()]);
    }

    #[test]
    fn renders_extra_toml_tables_into_the_document() {
        let draft = sample_draft(CodexOverride {
            model: Some("gpt-5.4-mini".to_owned()),
            model_reasoning_effort: Some("medium".to_owned()),
            sandbox_mode: Some("read-only".to_owned()),
            extra_toml: Some(
                "[mcp_servers.openaiDeveloperDocs]\nurl = \"https://developers.openai.com/mcp\"\n"
                    .to_owned(),
            ),
            ..CodexOverride::default()
        });
        let rendered = CodexAdapter.render(&draft, None).expect("render succeeds");
        let text = String::from_utf8(rendered.bytes).expect("valid UTF-8");

        assert!(text.contains("[mcp_servers.openaiDeveloperDocs]"));
        assert!(text.contains("url = \"https://developers.openai.com/mcp\""));
        let reparsed = CodexAdapter
            .parse(text.as_bytes(), "reviewer.toml")
            .expect("rendered TOML parses back");
        assert!(reparsed.editable);
    }

    #[test]
    fn extra_toml_replaces_the_same_table_from_original_bytes_without_duplication() {
        let original = br#"
name = "reviewer"
description = "Reviews changes."
developer_instructions = "legacy body"

[mcp_servers.docs]
url = "https://old.example.com/mcp"
"#;
        let draft = sample_draft(CodexOverride {
            extra_toml: Some(
                "[mcp_servers.docs]\nurl = \"https://developers.openai.com/mcp\"\n".to_owned(),
            ),
            ..CodexOverride::default()
        });
        let rendered = CodexAdapter
            .render(&draft, Some(original))
            .expect("render succeeds");
        let text = String::from_utf8(rendered.bytes).expect("valid UTF-8");

        assert_eq!(text.matches("[mcp_servers.docs]").count(), 1);
        assert!(text.contains("https://developers.openai.com/mcp"));
        assert!(!text.contains("https://old.example.com/mcp"));
    }

    #[test]
    fn unparseable_extra_toml_fails_render_with_a_validation_error() {
        let draft = sample_draft(CodexOverride {
            extra_toml: Some("[broken\nurl =".to_owned()),
            ..CodexOverride::default()
        });

        let error = CodexAdapter
            .render(&draft, None)
            .expect_err("broken fragment is rejected");

        assert_eq!(error.kind, crate::error::AppErrorKind::Validation);
    }

    fn sample_draft(codex: CodexOverride) -> AgentDraft {
        let mut overrides = BTreeMap::new();
        overrides.insert(AgentPlatform::Codex, PlatformOverride::Codex(codex));
        AgentDraft {
            logical_name: "reviewer".to_owned(),
            description: "Reviews changes.".to_owned(),
            developer_instructions:
                "Review code like an owner.\nPrioritize correctness, security, behavior regressions, and missing test coverage."
                    .to_owned(),
            platform_overrides: overrides,
            provenance: DraftProvenance::BuiltinTemplate {
                template_id: "reviewer".to_owned(),
                template_version: "1.0.0".to_owned(),
            },
        }
    }
}
