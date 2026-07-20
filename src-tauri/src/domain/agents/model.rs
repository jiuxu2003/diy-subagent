use std::{collections::BTreeMap, fmt};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentPlatform {
    Claude,
    Codex,
    Cursor,
}

impl AgentPlatform {
    pub const ALL: [Self; 3] = [Self::Claude, Self::Codex, Self::Cursor];

    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::Codex => "codex",
            Self::Cursor => "cursor",
        }
    }

    pub const fn default_relative_root(self) -> &'static str {
        match self {
            Self::Claude => ".claude/agents",
            Self::Codex => ".codex/agents",
            Self::Cursor => ".cursor/agents",
        }
    }

    /// Platform installation root (parent of the agents directory). The
    /// presence of this directory means the platform itself is installed,
    /// even when the agents subdirectory has not been created yet.
    pub const fn default_platform_root(self) -> &'static str {
        match self {
            Self::Claude => ".claude",
            Self::Codex => ".codex",
            Self::Cursor => ".cursor",
        }
    }

    pub const fn extension(self) -> &'static str {
        match self {
            Self::Claude | Self::Cursor => "md",
            Self::Codex => "toml",
        }
    }
}

impl fmt::Display for AgentPlatform {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResponseLanguage {
    FollowUser,
    SimplifiedChinese,
    English,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SharedInstructionContract {
    pub role_goal: String,
    pub when_to_use: Vec<String>,
    pub when_not_to_use: Vec<String>,
    pub input_requirements: Vec<String>,
    pub execution_steps: Vec<String>,
    pub output_contract: String,
    pub constraints: Vec<String>,
    pub stop_conditions: Vec<String>,
    pub failure_handling: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageContract {
    pub explicit_invocation_examples: Vec<String>,
    pub auto_delegation_guidance: String,
    pub verification_task: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct ClaudeOverride {
    pub model: Option<String>,
    pub effort: Option<String>,
    pub permission_mode: Option<String>,
    pub tools: Vec<String>,
    pub disallowed_tools: Vec<String>,
    pub max_turns: Option<u32>,
    pub skills: Vec<String>,
    pub memory: Option<String>,
    pub background: Option<bool>,
    pub isolation: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CodexOverride {
    pub model: Option<String>,
    pub model_reasoning_effort: Option<String>,
    pub sandbox_mode: Option<String>,
    pub nickname_candidates: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct CursorOverride {
    pub model: Option<String>,
    pub readonly: Option<bool>,
    pub is_background: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "platform", content = "config", rename_all = "lowercase")]
pub enum PlatformOverride {
    Claude(ClaudeOverride),
    Codex(CodexOverride),
    Cursor(CursorOverride),
}

impl PlatformOverride {
    pub const fn platform(&self) -> AgentPlatform {
        match self {
            Self::Claude(_) => AgentPlatform::Claude,
            Self::Codex(_) => AgentPlatform::Codex,
            Self::Cursor(_) => AgentPlatform::Cursor,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DraftProvenance {
    BuiltinTemplate {
        template_id: String,
        template_version: String,
    },
    PersonalTemplate {
        template_id: String,
        template_version: String,
    },
    Imported {
        source_id: String,
        expected_revision: String,
    },
    NativeSource {
        platform: AgentPlatform,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentDraft {
    pub logical_name: String,
    pub description: String,
    pub shared: SharedInstructionContract,
    pub response_language: ResponseLanguage,
    pub usage: UsageContract,
    pub platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
    pub provenance: DraftProvenance,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CapabilityDisposition {
    Exact,
    PromptOnly,
    NativeOnly,
    Unsupported,
    PreservedReadOnly,
    BlockedLossy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapabilityIssue {
    pub id: String,
    pub field: String,
    pub platform: AgentPlatform,
    pub disposition: CapabilityDisposition,
    pub explanation: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ValidationSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub code: String,
    pub field: String,
    pub native_field: Option<String>,
    pub message: String,
    pub severity: ValidationSeverity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum NativeFormat {
    MarkdownYaml,
    Toml,
}
