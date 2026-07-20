use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::domain::agents::{
    AgentDraft, AgentPlatform, DraftProvenance, PlatformOverride, ResponseLanguage,
    SharedInstructionContract, UsageContract,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateRisk {
    pub level: String,
    pub summary: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateManifest {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub author: String,
    pub source: String,
    pub tags: Vec<String>,
    pub supported_platforms: Vec<AgentPlatform>,
    pub risk: TemplateRisk,
    pub adapter_contracts: BTreeMap<AgentPlatform, String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePackage {
    pub manifest: TemplateManifest,
    pub logical_name: String,
    pub default_description: String,
    pub shared_defaults: SharedInstructionContract,
    pub usage_defaults: UsageContract,
    pub response_language: ResponseLanguage,
    pub platform_overrides: BTreeMap<AgentPlatform, PlatformOverride>,
}

impl TemplatePackage {
    pub fn to_draft(&self) -> AgentDraft {
        AgentDraft {
            logical_name: self.logical_name.clone(),
            description: self.default_description.clone(),
            shared: self.shared_defaults.clone(),
            response_language: self.response_language,
            usage: self.usage_defaults.clone(),
            platform_overrides: self.platform_overrides.clone(),
            provenance: DraftProvenance::BuiltinTemplate {
                template_id: self.manifest.id.clone(),
                template_version: self.manifest.version.clone(),
            },
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub version: String,
    pub name: String,
    pub description: String,
    pub tags: Vec<String>,
    pub supported_platforms: Vec<AgentPlatform>,
    pub risk: TemplateRisk,
}

impl From<&TemplatePackage> for TemplateSummary {
    fn from(value: &TemplatePackage) -> Self {
        Self {
            id: value.manifest.id.clone(),
            version: value.manifest.version.clone(),
            name: value.manifest.name.clone(),
            description: value.manifest.description.clone(),
            tags: value.manifest.tags.clone(),
            supported_platforms: value.manifest.supported_platforms.clone(),
            risk: value.manifest.risk.clone(),
        }
    }
}
