use std::collections::{BTreeMap, BTreeSet};

use serde_yaml_ng::{Mapping, Number, Value};

use crate::{
    domain::{
        agents::{
            render_structured_instructions, AgentDraft, AgentPlatform, CapabilityDisposition,
            CapabilityIssue, ClaudeOverride, CursorOverride, DraftProvenance, NativeFormat,
            PlatformOverride, ResponseLanguage, SharedInstructionContract, UsageContract,
        },
        ports::{ParsedNativeAgent, RenderedNativeAgent},
    },
    error::{AppError, AppErrorKind},
};

#[derive(Debug, Clone, Copy)]
pub enum MarkdownFlavor {
    Claude,
    Cursor,
}

impl MarkdownFlavor {
    pub const fn platform(self) -> AgentPlatform {
        match self {
            Self::Claude => AgentPlatform::Claude,
            Self::Cursor => AgentPlatform::Cursor,
        }
    }

    pub const fn contract_version(self) -> &'static str {
        match self {
            Self::Claude => "claude-subagent-2026-07",
            Self::Cursor => "cursor-subagent-2026-07",
        }
    }
}

pub fn parse_markdown_agent(
    flavor: MarkdownFlavor,
    bytes: &[u8],
    source_name: &str,
) -> Result<ParsedNativeAgent, AppError> {
    let text = std::str::from_utf8(bytes).map_err(|source| {
        AppError::new(
            AppErrorKind::LossyRoundTripBlocked,
            "原生 Agent 文件不是有效 UTF-8，应用只能只读展示。",
        )
        .with_source(source)
    })?;
    let (frontmatter, body) = split_frontmatter(text)?;
    let mapping: Mapping = serde_yaml_ng::from_str(frontmatter).map_err(|source| {
        AppError::new(
            AppErrorKind::Validation,
            format!("无法解析 {source_name} 的 YAML frontmatter。"),
        )
        .with_source(source)
    })?;

    let name = required_string(&mapping, "name", flavor.platform())?;
    let description = required_string(&mapping, "description", flavor.platform())?;
    let structured = crate::domain::agents::parse_structured_instructions(body);
    let editable = structured.is_some() && !has_unsafe_yaml_round_trip_features(frontmatter);
    let (shared, response_language, usage) = structured.unwrap_or_else(|| {
        (
            SharedInstructionContract {
                role_goal: body.trim().to_owned(),
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

    let mut overrides = BTreeMap::new();
    match flavor {
        MarkdownFlavor::Claude => {
            overrides.insert(
                AgentPlatform::Claude,
                PlatformOverride::Claude(parse_claude_override(&mapping)),
            );
        }
        MarkdownFlavor::Cursor => {
            overrides.insert(
                AgentPlatform::Cursor,
                PlatformOverride::Cursor(parse_cursor_override(&mapping)),
            );
        }
    }

    Ok(ParsedNativeAgent {
        draft: AgentDraft {
            logical_name: name,
            description,
            shared,
            response_language,
            usage,
            platform_overrides: overrides,
            provenance: DraftProvenance::NativeSource {
                platform: flavor.platform(),
            },
        },
        editable,
        blocked_reason: (!editable).then(|| {
            "该文件不是 DIY Subagent 结构化格式，或包含无法证明无损的 YAML 特性；可只读查看，但不能在应用内覆盖。"
                .to_owned()
        }),
        preserved_fields: preserved_fields(&mapping, known_fields(flavor)),
    })
}

pub fn render_markdown_agent(
    flavor: MarkdownFlavor,
    draft: &AgentDraft,
    original_bytes: Option<&[u8]>,
) -> Result<RenderedNativeAgent, AppError> {
    let mut mapping = if let Some(bytes) = original_bytes {
        let text = std::str::from_utf8(bytes).map_err(|source| {
            AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                "原生 Agent 文件不是有效 UTF-8，不能安全覆盖。",
            )
            .with_source(source)
        })?;
        let (frontmatter, _) = split_frontmatter(text)?;
        if has_unsafe_yaml_round_trip_features(frontmatter) {
            return Err(AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                "YAML 包含注释、anchor、alias 或 tag，应用无法证明无损 round-trip。",
            ));
        }
        serde_yaml_ng::from_str::<Mapping>(frontmatter).map_err(|source| {
            AppError::new(
                AppErrorKind::LossyRoundTripBlocked,
                "无法安全解析待替换文件的 YAML frontmatter。",
            )
            .with_source(source)
        })?
    } else {
        Mapping::new()
    };

    for field in known_fields(flavor) {
        mapping.shift_remove(Value::String((*field).to_owned()));
    }

    insert_string(&mut mapping, "name", draft.logical_name.trim());
    insert_string(&mut mapping, "description", draft.description.trim());
    let capability_issues = match flavor {
        MarkdownFlavor::Claude => {
            render_claude_override(&mut mapping, draft);
            Vec::new()
        }
        MarkdownFlavor::Cursor => {
            render_cursor_override(&mut mapping, draft);
            vec![CapabilityIssue {
                id: "cursor.prompt-only-contract".to_owned(),
                field: "shared.constraints".to_owned(),
                platform: AgentPlatform::Cursor,
                disposition: CapabilityDisposition::PromptOnly,
                explanation:
                    "Cursor 通过 Prompt 执行工作契约；除 readonly 外，这些约束不是平台级权限强制。"
                        .to_owned(),
            }]
        }
    };

    let yaml = serde_yaml_ng::to_string(&mapping).map_err(|source| {
        AppError::new(AppErrorKind::Internal, "无法渲染 YAML frontmatter。").with_source(source)
    })?;
    let body = render_structured_instructions(draft);
    let native = format!("---\n{}\n---\n{}", yaml.trim_end(), body);

    Ok(RenderedNativeAgent {
        file_name: format!("{}.md", draft.logical_name),
        native_format: NativeFormat::MarkdownYaml,
        bytes: native.into_bytes(),
        capability_issues,
    })
}

fn split_frontmatter(text: &str) -> Result<(&str, &str), AppError> {
    let normalized = text.strip_prefix('\u{feff}').unwrap_or(text);
    let rest = normalized.strip_prefix("---\n").ok_or_else(|| {
        AppError::new(
            AppErrorKind::Validation,
            "Markdown Agent 缺少 YAML frontmatter 起始分隔符。",
        )
    })?;
    let boundary = rest.find("\n---\n").ok_or_else(|| {
        AppError::new(
            AppErrorKind::Validation,
            "Markdown Agent 缺少 YAML frontmatter 结束分隔符。",
        )
    })?;
    Ok((&rest[..boundary], &rest[boundary + 5..]))
}

fn required_string(
    mapping: &Mapping,
    field: &'static str,
    platform: AgentPlatform,
) -> Result<String, AppError> {
    mapping
        .get(Value::String(field.to_owned()))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
        .ok_or_else(|| {
            AppError::new(
                AppErrorKind::Validation,
                format!("{} Agent 缺少必填字段 `{field}`。", platform.as_str()),
            )
        })
}

fn parse_claude_override(mapping: &Mapping) -> ClaudeOverride {
    ClaudeOverride {
        model: optional_string(mapping, "model"),
        effort: optional_string(mapping, "effort"),
        permission_mode: optional_string(mapping, "permissionMode"),
        tools: string_list(mapping, "tools"),
        disallowed_tools: string_list(mapping, "disallowedTools"),
        max_turns: mapping
            .get(Value::String("maxTurns".to_owned()))
            .and_then(Value::as_u64)
            .and_then(|value| u32::try_from(value).ok()),
        skills: string_list(mapping, "skills"),
        memory: optional_string(mapping, "memory"),
        background: optional_bool(mapping, "background"),
        isolation: optional_string(mapping, "isolation"),
    }
}

fn parse_cursor_override(mapping: &Mapping) -> CursorOverride {
    CursorOverride {
        model: optional_string(mapping, "model"),
        readonly: optional_bool(mapping, "readonly"),
        is_background: optional_bool(mapping, "is_background"),
    }
}

fn render_claude_override(mapping: &mut Mapping, draft: &AgentDraft) {
    let value = match draft.platform_overrides.get(&AgentPlatform::Claude) {
        Some(PlatformOverride::Claude(value)) => value.clone(),
        _ => ClaudeOverride::default(),
    };
    insert_optional_string(mapping, "model", value.model.as_deref());
    insert_optional_string(mapping, "effort", value.effort.as_deref());
    insert_optional_string(mapping, "permissionMode", value.permission_mode.as_deref());
    insert_string_list(mapping, "tools", &value.tools);
    insert_string_list(mapping, "disallowedTools", &value.disallowed_tools);
    if let Some(max_turns) = value.max_turns {
        mapping.insert(
            Value::String("maxTurns".to_owned()),
            Value::Number(Number::from(u64::from(max_turns))),
        );
    }
    insert_string_list(mapping, "skills", &value.skills);
    insert_optional_string(mapping, "memory", value.memory.as_deref());
    insert_optional_bool(mapping, "background", value.background);
    insert_optional_string(mapping, "isolation", value.isolation.as_deref());
}

fn render_cursor_override(mapping: &mut Mapping, draft: &AgentDraft) {
    let value = match draft.platform_overrides.get(&AgentPlatform::Cursor) {
        Some(PlatformOverride::Cursor(value)) => value.clone(),
        _ => CursorOverride::default(),
    };
    insert_optional_string(mapping, "model", value.model.as_deref());
    insert_optional_bool(mapping, "readonly", value.readonly);
    insert_optional_bool(mapping, "is_background", value.is_background);
}

fn known_fields(flavor: MarkdownFlavor) -> &'static [&'static str] {
    match flavor {
        MarkdownFlavor::Claude => &[
            "name",
            "description",
            "model",
            "effort",
            "permissionMode",
            "tools",
            "disallowedTools",
            "maxTurns",
            "skills",
            "memory",
            "background",
            "isolation",
        ],
        MarkdownFlavor::Cursor => &["name", "description", "model", "readonly", "is_background"],
    }
}

fn preserved_fields(mapping: &Mapping, known: &[&str]) -> Vec<String> {
    let known = known.iter().copied().collect::<BTreeSet<_>>();
    mapping
        .keys()
        .filter_map(Value::as_str)
        .filter(|field| !known.contains(*field))
        .map(str::to_owned)
        .collect()
}

fn has_unsafe_yaml_round_trip_features(frontmatter: &str) -> bool {
    frontmatter.lines().any(line_has_unsafe_yaml_feature)
}

fn line_has_unsafe_yaml_feature(line: &str) -> bool {
    let mut characters = line.chars().peekable();
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut double_quote_escape = false;
    let mut previous = None;

    while let Some(character) = characters.next() {
        if in_double_quote {
            if double_quote_escape {
                double_quote_escape = false;
            } else if character == '\\' {
                double_quote_escape = true;
            } else if character == '"' {
                in_double_quote = false;
            }
            previous = Some(character);
            continue;
        }
        if in_single_quote {
            if character == '\'' {
                if characters.peek() == Some(&'\'') {
                    characters.next();
                } else {
                    in_single_quote = false;
                }
            }
            previous = Some(character);
            continue;
        }

        match character {
            '"' => in_double_quote = true,
            '\'' => in_single_quote = true,
            '#' | '&' | '*' | '!' if is_yaml_indicator_boundary(previous) => return true,
            _ => {}
        }
        previous = Some(character);
    }
    false
}

fn is_yaml_indicator_boundary(previous: Option<char>) -> bool {
    match previous {
        None => true,
        Some(character) => {
            character.is_whitespace() || matches!(character, '[' | '{' | ',' | ':' | '-' | '?')
        }
    }
}

fn optional_string(mapping: &Mapping, field: &str) -> Option<String> {
    mapping
        .get(Value::String(field.to_owned()))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn optional_bool(mapping: &Mapping, field: &str) -> Option<bool> {
    mapping
        .get(Value::String(field.to_owned()))
        .and_then(Value::as_bool)
}

fn string_list(mapping: &Mapping, field: &str) -> Vec<String> {
    let Some(value) = mapping.get(Value::String(field.to_owned())) else {
        return Vec::new();
    };
    if let Some(value) = value.as_str() {
        return value
            .split(',')
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(str::to_owned)
            .collect();
    }
    value
        .as_sequence()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::trim)
        .filter(|item| !item.is_empty())
        .map(str::to_owned)
        .collect()
}

fn insert_string(mapping: &mut Mapping, field: &str, value: &str) {
    mapping.insert(
        Value::String(field.to_owned()),
        Value::String(value.to_owned()),
    );
}

fn insert_optional_string(mapping: &mut Mapping, field: &str, value: Option<&str>) {
    if let Some(value) = value.map(str::trim).filter(|value| !value.is_empty()) {
        insert_string(mapping, field, value);
    }
}

fn insert_optional_bool(mapping: &mut Mapping, field: &str, value: Option<bool>) {
    if let Some(value) = value {
        mapping.insert(Value::String(field.to_owned()), Value::Bool(value));
    }
}

fn insert_string_list(mapping: &mut Mapping, field: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }
    insert_string(mapping, field, &values.join(", "));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_draft(flavor: MarkdownFlavor) -> AgentDraft {
        let platform = flavor.platform();
        let platform_override = match flavor {
            MarkdownFlavor::Claude => PlatformOverride::Claude(ClaudeOverride::default()),
            MarkdownFlavor::Cursor => PlatformOverride::Cursor(CursorOverride::default()),
        };
        AgentDraft {
            logical_name: "round-trip-agent".to_owned(),
            description: "Preserve native fields.".to_owned(),
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
            platform_overrides: BTreeMap::from([(platform, platform_override)]),
            provenance: DraftProvenance::NativeSource { platform },
        }
    }

    #[test]
    fn preserves_unknown_yaml_fields_for_claude_and_cursor() {
        for flavor in [MarkdownFlavor::Claude, MarkdownFlavor::Cursor] {
            let draft = sample_draft(flavor);
            let body = render_structured_instructions(&draft);
            let original = format!(
                "---\nname: round-trip-agent\ndescription: Preserve native fields.\nunknown_scalar: keep-me\nunknown_nested:\n  enabled: true\n---\n{body}"
            );
            let parsed = parse_markdown_agent(flavor, original.as_bytes(), "agent.md")
                .expect("structured native agent parses");
            assert!(parsed.editable);
            assert_eq!(
                parsed.preserved_fields,
                vec!["unknown_scalar".to_owned(), "unknown_nested".to_owned()]
            );

            let rendered = render_markdown_agent(flavor, &parsed.draft, Some(original.as_bytes()))
                .expect("native agent rerenders");
            let rendered_text = std::str::from_utf8(&rendered.bytes).expect("render is UTF-8");
            let (frontmatter, _) = split_frontmatter(rendered_text).expect("frontmatter splits");
            let mapping: Mapping =
                serde_yaml_ng::from_str(frontmatter).expect("rendered YAML parses");
            assert_eq!(
                mapping
                    .get(Value::String("unknown_scalar".to_owned()))
                    .and_then(Value::as_str),
                Some("keep-me")
            );
            assert_eq!(
                mapping
                    .get(Value::String("unknown_nested".to_owned()))
                    .and_then(Value::as_mapping)
                    .and_then(|nested| nested.get(Value::String("enabled".to_owned())))
                    .and_then(Value::as_bool),
                Some(true)
            );
        }
    }

    #[test]
    fn blocks_yaml_features_that_cannot_be_preserved_losslessly() {
        let draft = sample_draft(MarkdownFlavor::Claude);
        let body = render_structured_instructions(&draft);
        for unsafe_field in [
            "unknown: value # inline comment",
            "unknown: &shared value",
            "unknown: *shared",
            "unknown: !custom value",
        ] {
            let original = format!(
                "---\nname: round-trip-agent\ndescription: Preserve native fields.\n{unsafe_field}\n---\n{body}"
            );
            let error =
                render_markdown_agent(MarkdownFlavor::Claude, &draft, Some(original.as_bytes()))
                    .expect_err("unsafe YAML is blocked");
            assert_eq!(error.kind, AppErrorKind::LossyRoundTripBlocked);
        }
    }

    #[test]
    fn quoted_hashes_are_not_misclassified_as_yaml_comments() {
        assert!(!has_unsafe_yaml_round_trip_features(
            "description: \"Use #channel when reporting\""
        ));
        assert!(!has_unsafe_yaml_round_trip_features(
            "description: 'Use #channel when reporting'"
        ));
    }
}
