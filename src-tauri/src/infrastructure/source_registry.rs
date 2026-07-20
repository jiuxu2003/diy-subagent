use std::{collections::HashMap, path::PathBuf};

use parking_lot::RwLock;

use crate::{
    domain::agents::{AgentPlatform, SourceId, SourceRevision},
    error::{AppError, AppErrorKind},
};

#[derive(Debug, Clone)]
pub struct RegisteredSource {
    pub id: SourceId,
    pub platform: AgentPlatform,
    pub path: PathBuf,
    pub revision: SourceRevision,
}

#[derive(Default)]
pub struct SourceRegistry {
    sources: RwLock<HashMap<String, RegisteredSource>>,
}

impl SourceRegistry {
    pub fn replace_platforms(&self, platforms: &[AgentPlatform], sources: Vec<RegisteredSource>) {
        let mut values = self.sources.write();
        values.retain(|_, source| !platforms.contains(&source.platform));
        values.extend(
            sources
                .into_iter()
                .map(|source| (source.id.0.clone(), source)),
        );
    }

    pub fn get(&self, source_id: &str) -> Result<RegisteredSource, AppError> {
        self.sources.read().get(source_id).cloned().ok_or_else(|| {
            AppError::new(AppErrorKind::NotFound, "来源标识已过期，请刷新已安装列表。")
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn source(id: &str, platform: AgentPlatform) -> RegisteredSource {
        RegisteredSource {
            id: SourceId(id.to_owned()),
            platform,
            path: PathBuf::from(format!("/{id}")),
            revision: SourceRevision(format!("revision-{id}")),
        }
    }

    #[test]
    fn replacing_one_platform_preserves_other_platform_sources() {
        let registry = SourceRegistry::default();
        registry.replace_platforms(
            &AgentPlatform::ALL,
            vec![
                source("claude-old", AgentPlatform::Claude),
                source("codex", AgentPlatform::Codex),
            ],
        );

        registry.replace_platforms(
            &[AgentPlatform::Claude],
            vec![source("claude-new", AgentPlatform::Claude)],
        );

        assert!(registry.get("claude-old").is_err());
        assert_eq!(
            registry
                .get("claude-new")
                .expect("new Claude source is registered")
                .platform,
            AgentPlatform::Claude
        );
        assert_eq!(
            registry
                .get("codex")
                .expect("Codex source is preserved")
                .platform,
            AgentPlatform::Codex
        );
    }
}
