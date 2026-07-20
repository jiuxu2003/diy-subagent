use std::path::Path;

use crate::error::{AppError, AppErrorKind};

#[cfg(target_os = "macos")]
pub fn reveal_path(path: &Path) -> Result<(), AppError> {
    let status = std::process::Command::new("open")
        .arg("-R")
        .arg(path)
        .status()
        .map_err(|source| {
            AppError::new(AppErrorKind::Internal, "无法调用 macOS Finder。").with_source(source)
        })?;
    if status.success() {
        Ok(())
    } else {
        Err(AppError::new(
            AppErrorKind::Internal,
            "Finder 未能显示原生 Agent 文件。",
        ))
    }
}

#[cfg(not(target_os = "macos"))]
pub fn reveal_path(_path: &Path) -> Result<(), AppError> {
    Err(AppError::new(
        AppErrorKind::UnsupportedPlatform,
        "当前原型只支持在 macOS Finder 中显示文件。",
    ))
}
