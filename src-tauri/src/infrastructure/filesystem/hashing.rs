use std::path::Path;

use sha2::{Digest, Sha256};

use crate::{
    domain::agents::SourceRevision,
    error::{AppError, AppErrorKind},
};

pub fn hash_bytes(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

pub fn content_revision(bytes: &[u8]) -> SourceRevision {
    SourceRevision(hash_bytes(bytes))
}

pub fn hash_path(path: &Path) -> Result<String, AppError> {
    let value = path.to_str().ok_or_else(|| {
        AppError::new(
            AppErrorKind::UnsafePath,
            "路径无法表示为 UTF-8，已阻止操作。",
        )
    })?;
    Ok(hash_bytes(value.as_bytes()))
}
