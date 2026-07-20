use crate::{
    adapters::agents::markdown_yaml::{
        parse_markdown_agent, render_markdown_agent, MarkdownFlavor,
    },
    domain::{
        agents::{validate_agent_draft, AgentDraft, AgentPlatform, NativeFormat, ValidationIssue},
        ports::{AgentFormatAdapter, ParsedNativeAgent, RenderedNativeAgent},
    },
    error::AppError,
};

#[derive(Debug, Default)]
pub struct ClaudeAdapter;

impl AgentFormatAdapter for ClaudeAdapter {
    fn platform(&self) -> AgentPlatform {
        AgentPlatform::Claude
    }

    fn contract_version(&self) -> &'static str {
        MarkdownFlavor::Claude.contract_version()
    }

    fn native_format(&self) -> NativeFormat {
        NativeFormat::MarkdownYaml
    }

    fn validate_draft(&self, draft: &AgentDraft) -> Vec<ValidationIssue> {
        validate_agent_draft(draft)
    }

    fn parse(&self, bytes: &[u8], source_name: &str) -> Result<ParsedNativeAgent, AppError> {
        parse_markdown_agent(MarkdownFlavor::Claude, bytes, source_name)
    }

    fn render(
        &self,
        draft: &AgentDraft,
        original_bytes: Option<&[u8]>,
    ) -> Result<RenderedNativeAgent, AppError> {
        render_markdown_agent(MarkdownFlavor::Claude, draft, original_bytes)
    }
}
