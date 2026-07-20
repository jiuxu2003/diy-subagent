use std::{
    os::unix::fs::PermissionsExt,
    path::{Path, PathBuf},
    sync::Arc,
};

use crate::{
    domain::{
        agents::{AgentPlatform, DirectoryAvailability, DirectorySource, PlatformDirectory},
        ports::Clock,
    },
    error::{AppError, AppErrorKind},
    infrastructure::{database::Database, filesystem::ensure_safe_root},
};

pub struct PlatformPathResolver {
    home_dir: PathBuf,
    database: Arc<Database>,
    clock: Arc<dyn Clock>,
}

impl PlatformPathResolver {
    pub fn new(home_dir: PathBuf, database: Arc<Database>, clock: Arc<dyn Clock>) -> Self {
        Self {
            home_dir,
            database,
            clock,
        }
    }

    pub fn resolve_all(&self) -> Result<Vec<PlatformDirectory>, AppError> {
        AgentPlatform::ALL
            .into_iter()
            .map(|platform| self.resolve(platform))
            .collect()
    }

    pub fn resolve(&self, platform: AgentPlatform) -> Result<PlatformDirectory, AppError> {
        let override_path = self.database.directory_override(platform)?;
        let (path, source) = match override_path {
            Some(path) => (path, DirectorySource::UserOverride),
            None => (
                self.home_dir.join(platform.default_relative_root()),
                DirectorySource::Default,
            ),
        };
        Ok(self.describe(platform, path, source))
    }

    pub fn root_path(&self, platform: AgentPlatform) -> Result<PathBuf, AppError> {
        let override_path = self.database.directory_override(platform)?;
        Ok(override_path.unwrap_or_else(|| self.home_dir.join(platform.default_relative_root())))
    }

    pub fn set_override(
        &self,
        platform: AgentPlatform,
        path: &Path,
    ) -> Result<PlatformDirectory, AppError> {
        ensure_safe_root(path)?;
        if !path.exists() {
            return Err(AppError::new(
                AppErrorKind::PathMissing,
                "只能选择当前存在的目录；缺失默认目录会在安装确认后创建。",
            ));
        }
        self.database
            .set_directory_override(platform, path, self.clock.now_ms())?;
        self.resolve(platform)
    }

    pub fn reset(&self, platform: AgentPlatform) -> Result<PlatformDirectory, AppError> {
        self.database
            .reset_directory_override(platform, self.clock.now_ms())?;
        self.resolve(platform)
    }

    pub fn home_dir(&self) -> &Path {
        &self.home_dir
    }

    fn describe(
        &self,
        platform: AgentPlatform,
        path: PathBuf,
        source: DirectorySource,
    ) -> PlatformDirectory {
        let (availability, can_read, can_write) = if !path.exists() {
            (DirectoryAvailability::Missing, false, false)
        } else {
            match std::fs::symlink_metadata(&path) {
                Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_dir() => {
                    (DirectoryAvailability::InvalidOverride, false, false)
                }
                Ok(metadata) => {
                    let can_read = std::fs::read_dir(&path).is_ok();
                    let mode = metadata.permissions().mode();
                    let can_write = mode & 0o222 != 0;
                    let availability = if can_read {
                        DirectoryAvailability::Ready
                    } else {
                        DirectoryAvailability::PermissionDenied
                    };
                    (availability, can_read, can_write)
                }
                Err(_) => (DirectoryAvailability::PermissionDenied, false, false),
            }
        };

        // Platform detection is always based on the default platform root
        // (e.g. `~/.claude`); a user override only changes where agent files
        // are written, not whether the platform is installed.
        let platform_detected = self
            .home_dir
            .join(platform.default_platform_root())
            .is_dir();

        PlatformDirectory {
            platform,
            absolute_path: path.to_string_lossy().into_owned(),
            source,
            availability,
            platform_detected,
            can_read,
            can_write,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use tempfile::TempDir;

    use super::PlatformPathResolver;
    use crate::{
        domain::{
            agents::{AgentPlatform, DirectoryAvailability},
            ports::SystemClock,
        },
        infrastructure::database::Database,
    };

    #[test]
    fn missing_default_directory_is_a_normal_state() {
        let home = TempDir::new().expect("temporary home");
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let resolver =
            PlatformPathResolver::new(home.path().to_path_buf(), database, Arc::new(SystemClock));

        let directory = resolver
            .resolve(AgentPlatform::Claude)
            .expect("directory resolves");

        assert_eq!(directory.availability, DirectoryAvailability::Missing);
        assert!(!directory.platform_detected);
    }

    #[test]
    fn platform_root_without_agents_subdirectory_is_detected() {
        let home = TempDir::new().expect("temporary home");
        std::fs::create_dir(home.path().join(".claude")).expect("platform root created");
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let resolver =
            PlatformPathResolver::new(home.path().to_path_buf(), database, Arc::new(SystemClock));

        let directory = resolver
            .resolve(AgentPlatform::Claude)
            .expect("directory resolves");

        assert_eq!(directory.availability, DirectoryAvailability::Missing);
        assert!(directory.platform_detected);
    }

    #[test]
    fn override_keeps_detection_bound_to_default_platform_root() {
        let home = TempDir::new().expect("temporary home");
        let override_dir = TempDir::new().expect("override directory");
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let resolver =
            PlatformPathResolver::new(home.path().to_path_buf(), database, Arc::new(SystemClock));

        let directory = resolver
            .set_override(AgentPlatform::Codex, override_dir.path())
            .expect("override applies");

        // The override directory exists, but `~/.codex` does not, so the
        // platform itself is still reported as not detected.
        assert_eq!(directory.availability, DirectoryAvailability::Ready);
        assert!(!directory.platform_detected);
    }
}
