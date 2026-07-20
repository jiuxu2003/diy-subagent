use serde::{Deserialize, Serialize};

use super::AgentPlatform;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectorySource {
    UserOverride,
    Default,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DirectoryAvailability {
    Ready,
    Missing,
    PermissionDenied,
    InvalidOverride,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlatformDirectory {
    pub platform: AgentPlatform,
    pub absolute_path: String,
    pub source: DirectorySource,
    pub availability: DirectoryAvailability,
    pub can_read: bool,
    pub can_write: bool,
}
