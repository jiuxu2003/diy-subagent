use std::{path::Path, sync::Arc};

use crate::{
    domain::agents::{AgentPlatform, PlatformDirectory},
    error::AppError,
    infrastructure::{paths::PlatformPathResolver, write_plan_store::WritePlanStore},
};

#[derive(Clone)]
pub struct SettingsService {
    paths: Arc<PlatformPathResolver>,
    write_plans: Arc<WritePlanStore>,
}

impl SettingsService {
    pub fn new(paths: Arc<PlatformPathResolver>, write_plans: Arc<WritePlanStore>) -> Self {
        Self { paths, write_plans }
    }

    pub fn get_platform_directories(&self) -> Result<Vec<PlatformDirectory>, AppError> {
        self.paths.resolve_all()
    }

    pub fn choose_platform_directory(
        &self,
        platform: AgentPlatform,
        path: &Path,
    ) -> Result<PlatformDirectory, AppError> {
        let result = self.paths.set_override(platform, path)?;
        self.write_plans.clear();
        Ok(result)
    }

    pub fn reset_platform_directory(
        &self,
        platform: AgentPlatform,
    ) -> Result<PlatformDirectory, AppError> {
        let result = self.paths.reset(platform)?;
        self.write_plans.clear();
        Ok(result)
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;
    use crate::{
        domain::ports::SystemClock, error::AppErrorKind, infrastructure::database::Database,
    };

    #[test]
    fn changing_a_platform_directory_invalidates_existing_write_plans() {
        let temporary = tempdir().expect("temporary directory creates");
        let home = temporary.path().join("home");
        let override_root = temporary.path().join("custom-claude-agents");
        std::fs::create_dir_all(&home).expect("temporary home creates");
        std::fs::create_dir_all(&override_root).expect("override root creates");
        let clock = Arc::new(SystemClock);
        let database = Arc::new(Database::in_memory().expect("database initializes"));
        let paths = Arc::new(PlatformPathResolver::new(home, database, clock.clone()));
        let write_plans = Arc::new(WritePlanStore::new(clock));
        let service = SettingsService::new(paths, write_plans.clone());
        let (token, _) = write_plans.create(Vec::new());

        service
            .choose_platform_directory(AgentPlatform::Claude, &override_root)
            .expect("directory override saves");
        let error = write_plans
            .take(&token)
            .expect_err("directory change invalidates preview token");

        assert_eq!(error.kind, AppErrorKind::PreviewInvalid);
    }
}
