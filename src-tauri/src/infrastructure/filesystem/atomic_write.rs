use std::{
    fs::{File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

use uuid::Uuid;

use crate::error::{AppError, AppErrorKind};

pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new(AppErrorKind::UnsafePath, "目标文件没有可用的父目录。"))?;
    std::fs::create_dir_all(parent).map_err(|source| {
        AppError::new(AppErrorKind::PermissionDenied, "无法创建目标目录。").with_source(source)
    })?;
    let temporary = temporary_path(path)?;
    match write_temporary_and_replace(&temporary, path, bytes) {
        Ok(()) => Ok(()),
        Err(primary_error) => {
            if temporary.exists() {
                if let Err(cleanup_error) = std::fs::remove_file(&temporary) {
                    tracing::warn!(
                        error_kind = ?cleanup_error.kind(),
                        "failed to remove an atomic-write temporary file"
                    );
                }
            }
            Err(primary_error)
        }
    }
}

fn write_temporary_and_replace(
    temporary: &Path,
    path: &Path,
    bytes: &[u8],
) -> Result<(), AppError> {
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(temporary)
        .map_err(|source| {
            AppError::new(AppErrorKind::AtomicWriteFailed, "无法创建同目录临时文件。")
                .with_source(source)
        })?;
    file.write_all(bytes).map_err(|source| {
        AppError::new(AppErrorKind::AtomicWriteFailed, "写入临时文件失败。").with_source(source)
    })?;
    file.sync_all().map_err(|source| {
        AppError::new(AppErrorKind::AtomicWriteFailed, "同步临时文件失败。").with_source(source)
    })?;
    drop(file);
    std::fs::rename(temporary, path).map_err(|source| {
        AppError::new(AppErrorKind::AtomicWriteFailed, "原子替换目标文件失败。").with_source(source)
    })?;
    sync_parent_directory(path)
}

pub fn sync_parent_directory(path: &Path) -> Result<(), AppError> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new(AppErrorKind::UnsafePath, "目标文件缺少父目录。"))?;
    let directory = File::open(parent).map_err(|source| {
        AppError::new(AppErrorKind::AtomicWriteFailed, "无法打开父目录进行同步。")
            .with_source(source)
    })?;
    directory.sync_all().map_err(|source| {
        AppError::new(AppErrorKind::AtomicWriteFailed, "同步父目录失败。").with_source(source)
    })
}

fn temporary_path(path: &Path) -> Result<PathBuf, AppError> {
    let file_name = path
        .file_name()
        .ok_or_else(|| AppError::new(AppErrorKind::UnsafePath, "目标文件名无效。"))?;
    let temporary_name = format!(".{}.{}.tmp", file_name.to_string_lossy(), Uuid::new_v4());
    Ok(path.with_file_name(temporary_name))
}
