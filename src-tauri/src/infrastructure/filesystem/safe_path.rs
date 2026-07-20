use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, AppErrorKind};

pub fn ensure_safe_root(path: &Path) -> Result<(), AppError> {
    if !path.is_absolute() {
        return Err(AppError::new(
            AppErrorKind::UnsafePath,
            "平台目录必须是绝对路径。",
        ));
    }
    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::CurDir))
    {
        return Err(AppError::new(
            AppErrorKind::UnsafePath,
            "平台目录不能包含 `.` 或 `..` 路径段。",
        ));
    }
    if path.exists() {
        let metadata = std::fs::symlink_metadata(path).map_err(|source| {
            AppError::new(AppErrorKind::PermissionDenied, "无法检查平台目录。").with_source(source)
        })?;
        if metadata.file_type().is_symlink() || !metadata.is_dir() {
            return Err(AppError::new(
                AppErrorKind::UnsafePath,
                "所选平台路径不是安全的真实目录。",
            ));
        }
    }
    Ok(())
}

pub fn safe_path_label(path: &Path, home: &Path) -> String {
    if let Ok(relative) = path.strip_prefix(home) {
        return PathBuf::from("~")
            .join(relative)
            .to_string_lossy()
            .into_owned();
    }
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| "<configured-directory>".to_owned())
}
