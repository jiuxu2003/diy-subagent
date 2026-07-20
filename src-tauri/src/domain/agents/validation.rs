use std::collections::BTreeSet;

use super::{AgentDraft, AgentPlatform, PlatformOverride, ValidationIssue, ValidationSeverity};

pub fn validate_logical_name(name: &str) -> Result<(), ValidationIssue> {
    let bytes = name.as_bytes();
    let has_valid_length = (2..=64).contains(&bytes.len());
    let starts_with_letter = bytes.first().is_some_and(u8::is_ascii_lowercase);
    let contains_only_supported_characters = bytes
        .iter()
        .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || *byte == b'-');
    let has_valid_hyphens =
        bytes.last() != Some(&b'-') && !bytes.windows(2).any(|window| window == b"--");

    if has_valid_length
        && starts_with_letter
        && contains_only_supported_characters
        && has_valid_hyphens
    {
        return Ok(());
    }

    Err(issue(
        "agent.invalid_name",
        "logicalName",
        Some("name"),
        "名称必须为 2–64 个小写字母、数字或单连字符，且以字母开头。",
    ))
}

pub fn validate_agent_draft(draft: &AgentDraft) -> Vec<ValidationIssue> {
    let mut issues = Vec::new();

    if let Err(issue) = validate_logical_name(draft.logical_name.trim()) {
        issues.push(issue);
    }

    require_text(
        &mut issues,
        "description",
        Some("description"),
        &draft.description,
        "请填写用于自动委派判断的描述。",
    );
    require_text(
        &mut issues,
        "shared.roleGoal",
        None,
        &draft.shared.role_goal,
        "请填写角色目标。",
    );
    require_list(
        &mut issues,
        "shared.whenToUse",
        &draft.shared.when_to_use,
        "至少填写一个适用场景。",
    );
    require_list(
        &mut issues,
        "shared.whenNotToUse",
        &draft.shared.when_not_to_use,
        "至少填写一个禁用场景。",
    );
    require_list(
        &mut issues,
        "shared.inputRequirements",
        &draft.shared.input_requirements,
        "至少填写一个输入要求。",
    );
    require_list(
        &mut issues,
        "shared.executionSteps",
        &draft.shared.execution_steps,
        "至少填写一个执行步骤。",
    );
    require_text(
        &mut issues,
        "shared.outputContract",
        None,
        &draft.shared.output_contract,
        "请填写输出契约。",
    );
    require_list(
        &mut issues,
        "shared.constraints",
        &draft.shared.constraints,
        "至少填写一个约束。",
    );
    require_list(
        &mut issues,
        "shared.stopConditions",
        &draft.shared.stop_conditions,
        "至少填写一个停止条件。",
    );
    require_text(
        &mut issues,
        "shared.failureHandling",
        None,
        &draft.shared.failure_handling,
        "请填写失败处理方式。",
    );
    require_text(
        &mut issues,
        "usage.autoDelegationGuidance",
        None,
        &draft.usage.auto_delegation_guidance,
        "请填写自动委派建议。",
    );
    require_text(
        &mut issues,
        "usage.verificationTask",
        None,
        &draft.usage.verification_task,
        "请填写安装后的验证任务。",
    );

    let mut seen_platforms = BTreeSet::new();
    for (platform, platform_override) in &draft.platform_overrides {
        if platform_override.platform() != *platform {
            issues.push(issue(
                "agent.platform_override_mismatch",
                &format!("platformOverrides.{}", platform.as_str()),
                None,
                "平台覆盖的键和值不一致。",
            ));
        }
        if !seen_platforms.insert(*platform) {
            issues.push(issue(
                "agent.duplicate_platform_override",
                "platformOverrides",
                None,
                "同一平台只能配置一次覆盖。",
            ));
        }
        validate_platform_override(*platform, platform_override, &mut issues);
    }

    issues
}

fn validate_platform_override(
    platform: AgentPlatform,
    platform_override: &PlatformOverride,
    issues: &mut Vec<ValidationIssue>,
) {
    match platform_override {
        PlatformOverride::Claude(value) => {
            validate_unique_non_empty(issues, "platformOverrides.claude.tools", &value.tools);
            validate_unique_non_empty(
                issues,
                "platformOverrides.claude.disallowedTools",
                &value.disallowed_tools,
            );
            if value
                .tools
                .iter()
                .any(|tool| value.disallowed_tools.contains(tool))
            {
                issues.push(issue(
                    "agent.conflicting_tool_policy",
                    "platformOverrides.claude",
                    Some("tools/disallowedTools"),
                    "同一个 Claude 工具不能同时出现在允许和禁止列表。",
                ));
            }
        }
        PlatformOverride::Codex(value) => {
            validate_unique_non_empty(
                issues,
                "platformOverrides.codex.nicknameCandidates",
                &value.nickname_candidates,
            );
        }
        PlatformOverride::Cursor(_) => {}
    }

    if platform_override.platform() != platform {
        issues.push(issue(
            "agent.platform_override_mismatch",
            &format!("platformOverrides.{}", platform.as_str()),
            None,
            "平台覆盖类型不匹配。",
        ));
    }
}

fn require_text(
    issues: &mut Vec<ValidationIssue>,
    field: &str,
    native_field: Option<&str>,
    value: &str,
    message: &str,
) {
    if value.trim().is_empty() {
        issues.push(issue("agent.required_field", field, native_field, message));
    }
}

fn require_list(issues: &mut Vec<ValidationIssue>, field: &str, values: &[String], message: &str) {
    if values.is_empty() || values.iter().any(|value| value.trim().is_empty()) {
        issues.push(issue("agent.required_list", field, None, message));
    }
}

fn validate_unique_non_empty(issues: &mut Vec<ValidationIssue>, field: &str, values: &[String]) {
    let mut seen = BTreeSet::new();
    for value in values {
        let normalized = value.trim();
        if normalized.is_empty() {
            issues.push(issue(
                "agent.invalid_list_item",
                field,
                None,
                "列表项不能为空。",
            ));
        } else if !seen.insert(normalized.to_owned()) {
            issues.push(issue(
                "agent.duplicate_list_item",
                field,
                None,
                "列表项不能重复。",
            ));
        }
    }
}

fn issue(code: &str, field: &str, native_field: Option<&str>, message: &str) -> ValidationIssue {
    ValidationIssue {
        code: code.to_owned(),
        field: field.to_owned(),
        native_field: native_field.map(str::to_owned),
        message: message.to_owned(),
        severity: ValidationSeverity::Error,
    }
}

#[cfg(test)]
mod tests {
    use super::validate_logical_name;

    #[test]
    fn validates_cross_platform_safe_names() {
        assert!(validate_logical_name("root-cause-debugger").is_ok());
        assert!(validate_logical_name("A Bad Name").is_err());
        assert!(validate_logical_name("bad--name").is_err());
        assert!(validate_logical_name("bad-").is_err());
    }
}
