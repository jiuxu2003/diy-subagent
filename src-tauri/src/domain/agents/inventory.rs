use serde::{Deserialize, Serialize};

use super::AgentPlatform;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SourceId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct SourceRevision(pub String);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ParseStatus {
    Valid,
    Invalid,
    ReadOnlyUnsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OwnershipStatus {
    External,
    Imported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredAgent {
    pub source_id: SourceId,
    pub platform: AgentPlatform,
    pub logical_name: String,
    pub description: Option<String>,
    pub revision: SourceRevision,
    pub path_label: String,
    pub parse_status: ParseStatus,
    pub ownership: OwnershipStatus,
    pub error_code: Option<String>,
    pub compatibility_exposure: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryGroup {
    pub logical_name: String,
    pub sources: Vec<DiscoveredAgent>,
    pub has_conflict: bool,
}
