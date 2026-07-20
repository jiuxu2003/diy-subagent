mod adapters;
mod commands;
mod domain;
mod dto;
mod error;
mod infrastructure;
mod services;

use std::{path::PathBuf, sync::Arc};

use directories::BaseDirs;
use tauri::{AppHandle, Manager};

use crate::{
    adapters::agents::AdapterRegistry,
    domain::ports::{Clock, SystemClock},
    error::{AppError, AppErrorKind},
    infrastructure::{
        database::Database, inventory_watcher::InventoryWatcher, paths::PlatformPathResolver,
        source_registry::SourceRegistry, templates::TemplateRepository,
        transaction::BatchTransactionCoordinator, write_plan_store::WritePlanStore,
    },
    services::{
        AgentApplicationService, AgentServiceDependencies, SettingsService, TemplateService,
    },
};

pub struct AppState {
    settings: SettingsService,
    templates: TemplateService,
    agents: AgentApplicationService,
    inventory_watcher: Arc<InventoryWatcher>,
}

impl AppState {
    fn initialize(app: &tauri::App) -> Result<Self, AppError> {
        let app_data_dir = app.path().app_data_dir().map_err(|source| {
            AppError::new(
                AppErrorKind::Internal,
                "无法解析 macOS Application Support 目录。",
            )
            .with_source(source)
        })?;
        let base_dirs = BaseDirs::new()
            .ok_or_else(|| AppError::new(AppErrorKind::Internal, "无法解析用户主目录。"))?;
        Self::from_paths(
            app.handle().clone(),
            app_data_dir,
            base_dirs.home_dir().to_path_buf(),
        )
    }

    fn from_paths(
        app_handle: AppHandle,
        app_data_dir: PathBuf,
        home_dir: PathBuf,
    ) -> Result<Self, AppError> {
        std::fs::create_dir_all(&app_data_dir).map_err(|source| {
            AppError::new(AppErrorKind::PermissionDenied, "无法创建应用支持目录。")
                .with_source(source)
        })?;
        let clock: Arc<dyn Clock> = Arc::new(SystemClock);
        let database = Arc::new(Database::open(&app_data_dir.join("metadata.sqlite3"))?);
        let adapters = AdapterRegistry::default();
        let paths = Arc::new(PlatformPathResolver::new(
            home_dir,
            database.clone(),
            clock.clone(),
        ));
        let write_plans = Arc::new(WritePlanStore::new(clock.clone()));
        let sources = Arc::new(SourceRegistry::default());
        let templates = Arc::new(TemplateRepository::load(
            app_data_dir.join("templates"),
            database.clone(),
            clock.clone(),
        )?);
        let transaction = Arc::new(BatchTransactionCoordinator::new(
            paths.clone(),
            adapters.clone(),
            database.clone(),
            app_data_dir.join("backups"),
            clock.clone(),
        ));
        let agents = AgentApplicationService::new(AgentServiceDependencies {
            adapters: adapters.clone(),
            paths: paths.clone(),
            database: database.clone(),
            sources,
            write_plans: write_plans.clone(),
            transaction,
            managed_sources_root: app_data_dir.join("managed-sources"),
            clock: clock.clone(),
        });
        let inventory_watcher = Arc::new(InventoryWatcher::start(
            app_handle,
            agents.clone(),
            paths.clone(),
        ));

        Ok(Self {
            settings: SettingsService::new(paths.clone(), write_plans.clone()),
            templates: TemplateService::new(templates, adapters.clone()),
            agents,
            inventory_watcher,
        })
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepOne)
                .max_file_size(1_000_000)
                .build(),
        )
        .setup(|app| {
            let state = AppState::initialize(app)?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_platform_directories,
            commands::choose_platform_directory,
            commands::reset_platform_directory,
            commands::list_templates,
            commands::get_template,
            commands::save_personal_template,
            commands::scan_installed_agents,
            commands::get_agent_native_content,
            commands::import_agent_for_editing,
            commands::preview_agent_install,
            commands::commit_agent_install,
            commands::reveal_agent_source,
            commands::reveal_recovery_directory,
        ])
        .run(tauri::generate_context!());

    if let Err(error) = result {
        eprintln!("failed to run DIY Subagent: {error}");
        std::process::exit(1);
    }
}
