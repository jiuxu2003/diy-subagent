use crate::{
    domain::agents::{AgentDraft, AgentPlatform, CapabilityIssue, NativeFormat, ValidationIssue},
    error::AppError,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedNativeAgent {
    pub draft: AgentDraft,
    pub editable: bool,
    pub blocked_reason: Option<String>,
    pub preserved_fields: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RenderedNativeAgent {
    pub file_name: String,
    pub native_format: NativeFormat,
    pub bytes: Vec<u8>,
    pub capability_issues: Vec<CapabilityIssue>,
}

pub trait AgentFormatAdapter: Send + Sync {
    fn platform(&self) -> AgentPlatform;
    fn contract_version(&self) -> &'static str;
    fn native_format(&self) -> NativeFormat;
    fn validate_draft(&self, draft: &AgentDraft) -> Vec<ValidationIssue>;
    fn parse(&self, bytes: &[u8], source_name: &str) -> Result<ParsedNativeAgent, AppError>;
    fn render(
        &self,
        draft: &AgentDraft,
        original_bytes: Option<&[u8]>,
    ) -> Result<RenderedNativeAgent, AppError>;
}
