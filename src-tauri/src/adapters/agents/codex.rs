use std::{collections::BTreeMap, str::FromStr};

use toml_edit::{value, Array, DocumentMut, Item, Value};

use crate::{
    domain::{
        agents::{
            parse_structured_instructions, render_structured_instructions, validate_agent_draft,
            AgentDraft, AgentPlatform, CapabilityDisposition, CapabilityIssue, CodexOverride,
            DraftProvenance, NativeFormat, PlatformOverride, ResponseLanguage,
            SharedInstructionContract, UsageContract, ValidationIssue,
        },
        ports::{AgentFormatAdapter, ParsedNativeAgent, RenderedNativeAgent},
    },
    error::{AppError, AppErrorKind},
};

const CONTRACT_VERSION: &str = "codex-custom-agent-2026-07";
const KNOWN_FIELDS: [&str; 7] = [
    "name",
    "description",
    "developer_instructions",
    "nickname_candidates",
    "model",
    "model_reasoning_effort",
    "sandbox_mode",
];

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
        let structured = parse_structured_instructions(&developer_instructions);
        let editable = structured.is_some();
        let (shared, response_language, usage) = structured.unwrap_or_else(|| {
            (
                SharedInstructionContract {
                    role_goal: developer_instructions,
                    when_to_use: Vec::new(),
                    when_not_to_use: Vec::new(),
                    input_requirements: Vec::new(),
                    execution_steps: Vec::new(),
                    output_contract: String::new(),
                    constraints: Vec::new(),
                    stop_conditions: Vec::new(),
                    failure_handling: String::new(),
                },
                ResponseLanguage::FollowUser,
                UsageContract {
                    explicit_invocation_examples: Vec::new(),
                    auto_delegation_guidance: String::new(),
                    verification_task: String::new(),
                },
            )
        });
        let mut platform_overrides = BTreeMap::new();
        platform_overrides.insert(
            AgentPlatform::Codex,
            PlatformOverride::Codex(CodexOverride {
                model: optional_string(&document, "model"),
                model_reasoning_effort: optional_string(&document, "model_reasoning_effort"),
                sandbox_mode: optional_string(&document, "sandbox_mode"),
                nickname_candidates: string_array(&document, "nickname_candidates"),
            }),
        );

        let preserved_fields = document
            .iter()
            .map(|(key, _)| key)
            .filter(|key| !KNOWN_FIELDS.contains(key))
            .map(str::to_owned)
            .collect();

        Ok(ParsedNativeAgent {
            draft: AgentDraft {
                logical_name: name,
                description,
                shared,
                response_language,
                usage,
                platform_overrides,
                provenance: DraftProvenance::NativeSource {
                    platform: AgentPlatform::Codex,
                },
            },
            editable,
            blocked_reason: (!editable).then(|| {
                "该 Codex Agent 不包含 DIY Subagent 结构化标记；可只读查看，但不能在应用内覆盖。"
                    .to_owned()
            }),
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
        document["developer_instructions"] = value(render_structured_instructions(draft));

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

        let capability_issues = vec![CapabilityIssue {
            id: "codex.prompt-only-tool-contract".to_owned(),
            field: "shared.constraints".to_owned(),
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
        agents::{
            AgentDraft, AgentPlatform, CodexOverride, DraftProvenance, PlatformOverride,
            ResponseLanguage, SharedInstructionContract, UsageContract,
        },
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
        let draft = sample_draft();
        let rendered = CodexAdapter
            .render(&draft, Some(original))
            .expect("render succeeds");
        let text = String::from_utf8(rendered.bytes).expect("valid UTF-8");

        assert!(text.contains("[mcp_servers.docs]"));
        assert!(text.contains("developer_instructions"));
    }

    fn sample_draft() -> AgentDraft {
        let mut overrides = BTreeMap::new();
        overrides.insert(
            AgentPlatform::Codex,
            PlatformOverride::Codex(CodexOverride::default()),
        );
        AgentDraft {
            logical_name: "reviewer".to_owned(),
            description: "Reviews changes.".to_owned(),
            shared: SharedInstructionContract {
                role_goal: "审查代码。".to_owned(),
                when_to_use: vec!["代码发生变更。".to_owned()],
                when_not_to_use: vec!["没有代码变更。".to_owned()],
                input_requirements: vec!["待审 diff。".to_owned()],
                execution_steps: vec!["检查风险。".to_owned()],
                output_contract: "按严重度输出问题。".to_owned(),
                constraints: vec!["不修改代码。".to_owned()],
                stop_conditions: vec!["已覆盖所有变更。".to_owned()],
                failure_handling: "说明无法验证的部分。".to_owned(),
            },
            response_language: ResponseLanguage::FollowUser,
            usage: UsageContract {
                explicit_invocation_examples: vec!["审查这个 diff。".to_owned()],
                auto_delegation_guidance: "完成实现后使用。".to_owned(),
                verification_task: "确认报告包含证据。".to_owned(),
            },
            platform_overrides: overrides,
            provenance: DraftProvenance::BuiltinTemplate {
                template_id: "reviewer".to_owned(),
                template_version: "1.0.0".to_owned(),
            },
        }
    }
}
