use std::sync::Arc;

use crate::domain::{agents::AgentPlatform, ports::AgentFormatAdapter};

use super::{claude::ClaudeAdapter, codex::CodexAdapter, cursor::CursorAdapter};

#[derive(Clone)]
pub struct AdapterRegistry {
    claude: Arc<ClaudeAdapter>,
    codex: Arc<CodexAdapter>,
    cursor: Arc<CursorAdapter>,
}

impl Default for AdapterRegistry {
    fn default() -> Self {
        Self {
            claude: Arc::new(ClaudeAdapter),
            codex: Arc::new(CodexAdapter),
            cursor: Arc::new(CursorAdapter),
        }
    }
}

impl AdapterRegistry {
    pub fn get(&self, platform: AgentPlatform) -> &dyn AgentFormatAdapter {
        match platform {
            AgentPlatform::Claude => self.claude.as_ref(),
            AgentPlatform::Codex => self.codex.as_ref(),
            AgentPlatform::Cursor => self.cursor.as_ref(),
        }
    }
}
