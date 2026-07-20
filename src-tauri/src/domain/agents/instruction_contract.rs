use super::{AgentDraft, ResponseLanguage, SharedInstructionContract, UsageContract};

const STRUCTURED_MARKER: &str = "<!-- diy-subagent:structured:v1 -->";

pub fn render_structured_instructions(draft: &AgentDraft) -> String {
    let mut output = String::new();
    output.push_str(STRUCTURED_MARKER);
    output.push_str("\n\n# 角色目标\n\n");
    output.push_str(draft.shared.role_goal.trim());
    push_list(&mut output, "适用场景", &draft.shared.when_to_use);
    push_list(&mut output, "禁用场景", &draft.shared.when_not_to_use);
    push_list(&mut output, "输入要求", &draft.shared.input_requirements);
    push_ordered_list(&mut output, "执行步骤", &draft.shared.execution_steps);
    push_text(&mut output, "输出契约", &draft.shared.output_contract);
    push_list(&mut output, "约束", &draft.shared.constraints);
    push_list(&mut output, "停止条件", &draft.shared.stop_conditions);
    push_text(&mut output, "失败处理", &draft.shared.failure_handling);
    push_text(
        &mut output,
        "响应语言",
        response_language_instruction(draft.response_language),
    );
    push_list(
        &mut output,
        "显式调用示例",
        &draft.usage.explicit_invocation_examples,
    );
    push_text(
        &mut output,
        "自动委派建议",
        &draft.usage.auto_delegation_guidance,
    );
    push_text(&mut output, "验证任务", &draft.usage.verification_task);
    output.push('\n');
    output
}

pub fn parse_structured_instructions(
    body: &str,
) -> Option<(SharedInstructionContract, ResponseLanguage, UsageContract)> {
    if !body.contains(STRUCTURED_MARKER) {
        return None;
    }

    let role_goal = section(body, "角色目标")?;
    let when_to_use = unordered_list(section(body, "适用场景")?);
    let when_not_to_use = unordered_list(section(body, "禁用场景")?);
    let input_requirements = unordered_list(section(body, "输入要求")?);
    let execution_steps = ordered_list(section(body, "执行步骤")?);
    let output_contract = section(body, "输出契约")?;
    let constraints = unordered_list(section(body, "约束")?);
    let stop_conditions = unordered_list(section(body, "停止条件")?);
    let failure_handling = section(body, "失败处理")?;
    let response_language = match section(body, "响应语言")?.trim() {
        "始终使用简体中文回复；代码、命令、日志和原生字段保持原文。" => {
            ResponseLanguage::SimplifiedChinese
        }
        "始终使用英文回复。" => ResponseLanguage::English,
        _ => ResponseLanguage::FollowUser,
    };
    let explicit_invocation_examples = unordered_list(section(body, "显式调用示例")?);
    let auto_delegation_guidance = section(body, "自动委派建议")?;
    let verification_task = section(body, "验证任务")?;

    Some((
        SharedInstructionContract {
            role_goal,
            when_to_use,
            when_not_to_use,
            input_requirements,
            execution_steps,
            output_contract,
            constraints,
            stop_conditions,
            failure_handling,
        },
        response_language,
        UsageContract {
            explicit_invocation_examples,
            auto_delegation_guidance,
            verification_task,
        },
    ))
}

fn response_language_instruction(language: ResponseLanguage) -> &'static str {
    match language {
        ResponseLanguage::FollowUser => "跟随用户当前使用的语言回复。",
        ResponseLanguage::SimplifiedChinese => {
            "始终使用简体中文回复；代码、命令、日志和原生字段保持原文。"
        }
        ResponseLanguage::English => "始终使用英文回复。",
    }
}

fn push_text(output: &mut String, heading: &str, text: &str) {
    output.push_str("\n\n# ");
    output.push_str(heading);
    output.push_str("\n\n");
    output.push_str(text.trim());
}

fn push_list(output: &mut String, heading: &str, values: &[String]) {
    output.push_str("\n\n# ");
    output.push_str(heading);
    output.push_str("\n\n");
    for value in values {
        output.push_str("- ");
        output.push_str(value.trim());
        output.push('\n');
    }
    while output.ends_with('\n') {
        output.pop();
    }
}

fn push_ordered_list(output: &mut String, heading: &str, values: &[String]) {
    output.push_str("\n\n# ");
    output.push_str(heading);
    output.push_str("\n\n");
    for (index, value) in values.iter().enumerate() {
        output.push_str(&(index + 1).to_string());
        output.push_str(". ");
        output.push_str(value.trim());
        output.push('\n');
    }
    while output.ends_with('\n') {
        output.pop();
    }
}

fn section(body: &str, heading: &str) -> Option<String> {
    let start_marker = format!("# {heading}\n\n");
    let start = body.find(&start_marker)? + start_marker.len();
    let rest = &body[start..];
    let end = rest.find("\n\n# ").unwrap_or(rest.len());
    Some(rest[..end].trim().to_owned())
}

fn unordered_list(value: String) -> Vec<String> {
    value
        .lines()
        .filter_map(|line| line.trim().strip_prefix("- "))
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

fn ordered_list(value: String) -> Vec<String> {
    value
        .lines()
        .filter_map(|line| line.split_once(". ").map(|(_, item)| item.trim()))
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect()
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use pretty_assertions::assert_eq;

    use super::{parse_structured_instructions, render_structured_instructions};
    use crate::domain::agents::{
        AgentDraft, DraftProvenance, ResponseLanguage, SharedInstructionContract, UsageContract,
    };

    #[test]
    fn structured_instructions_round_trip() {
        let draft = AgentDraft {
            logical_name: "requirements-clarifier".to_owned(),
            description: "Clarifies ambiguous requirements.".to_owned(),
            shared: SharedInstructionContract {
                role_goal: "收敛真实需求。".to_owned(),
                when_to_use: vec!["需求存在歧义。".to_owned()],
                when_not_to_use: vec!["需求已经明确。".to_owned()],
                input_requirements: vec!["用户原始目标。".to_owned()],
                execution_steps: vec!["检查证据。".to_owned(), "提出关键问题。".to_owned()],
                output_contract: "输出已确认需求。".to_owned(),
                constraints: vec!["一次只问一个问题。".to_owned()],
                stop_conditions: vec!["验收标准可测试。".to_owned()],
                failure_handling: "说明缺失信息。".to_owned(),
            },
            response_language: ResponseLanguage::FollowUser,
            usage: UsageContract {
                explicit_invocation_examples: vec!["澄清这个需求。".to_owned()],
                auto_delegation_guidance: "需求不清时使用。".to_owned(),
                verification_task: "检查需求是否可测试。".to_owned(),
            },
            platform_overrides: BTreeMap::new(),
            provenance: DraftProvenance::BuiltinTemplate {
                template_id: "requirements-clarifier".to_owned(),
                template_version: "1.0.0".to_owned(),
            },
        };

        let rendered = render_structured_instructions(&draft);
        let parsed = parse_structured_instructions(&rendered).expect("structured body parses");

        assert_eq!(parsed.0, draft.shared);
        assert_eq!(parsed.1, draft.response_language);
        assert_eq!(parsed.2, draft.usage);
    }
}
