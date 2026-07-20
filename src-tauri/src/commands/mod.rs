use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

use crate::{
    domain::{
        agents::{BatchCommitResult, PlatformDirectory},
        templates::{TemplatePackage, TemplateSummary},
    },
    dto::{
        CommitAgentInstallRequestDto, ImportAgentRequestDto, ImportAgentResultDto,
        InventoryScanDto, IpcErrorDto, NativeAgentContentDto, PlatformRequestDto,
        PreviewAgentInstallRequestDto, RecoveryRequestDto, SavePersonalTemplateRequestDto,
        ScanInstalledAgentsRequestDto, SourceRequestDto, TemplateRequestDto,
    },
    error::{AppError, AppErrorKind},
    infrastructure::macos::reveal_path,
    AppState,
};

#[tauri::command]
pub async fn get_platform_directories(
    state: State<'_, AppState>,
) -> Result<Vec<PlatformDirectory>, IpcErrorDto> {
    let service = state.settings.clone();
    run_blocking("get_platform_directories", move || {
        service.get_platform_directories()
    })
    .await
}

#[tauri::command]
pub async fn choose_platform_directory(
    app: AppHandle,
    request: PlatformRequestDto,
    state: State<'_, AppState>,
) -> Result<PlatformDirectory, IpcErrorDto> {
    let operation_id = operation_id("choose_platform_directory");
    let selected = app
        .dialog()
        .file()
        .set_title("选择用户级 Agent 目录")
        .blocking_pick_folder()
        .ok_or_else(|| {
            IpcErrorDto::from_error(
                AppError::new(AppErrorKind::DialogCancelled, "未选择目录。"),
                operation_id.clone(),
            )
        })?;
    let path = selected.into_path().map_err(|source| {
        IpcErrorDto::from_error(
            AppError::new(AppErrorKind::Validation, "所选目录不是本地文件路径。")
                .with_source(source),
            operation_id.clone(),
        )
    })?;
    let service = state.settings.clone();
    let watcher = state.inventory_watcher.clone();
    let directory = run_blocking_with_id(operation_id, move || {
        service.choose_platform_directory(request.platform, &path)
    })
    .await?;
    watcher.refresh_roots();
    Ok(directory)
}

#[tauri::command]
pub async fn reset_platform_directory(
    request: PlatformRequestDto,
    state: State<'_, AppState>,
) -> Result<PlatformDirectory, IpcErrorDto> {
    let service = state.settings.clone();
    let watcher = state.inventory_watcher.clone();
    let directory = run_blocking("reset_platform_directory", move || {
        service.reset_platform_directory(request.platform)
    })
    .await?;
    watcher.refresh_roots();
    Ok(directory)
}

#[tauri::command]
pub async fn list_templates(
    state: State<'_, AppState>,
) -> Result<Vec<TemplateSummary>, IpcErrorDto> {
    let service = state.templates.clone();
    run_blocking("list_templates", move || Ok(service.list_templates())).await
}

#[tauri::command]
pub async fn get_template(
    request: TemplateRequestDto,
    state: State<'_, AppState>,
) -> Result<TemplatePackage, IpcErrorDto> {
    let service = state.templates.clone();
    run_blocking("get_template", move || {
        service.get_template(&request.template_id)
    })
    .await
}

#[tauri::command]
pub async fn save_personal_template(
    request: SavePersonalTemplateRequestDto,
    state: State<'_, AppState>,
) -> Result<TemplateSummary, IpcErrorDto> {
    let service = state.templates.clone();
    run_blocking("save_personal_template", move || {
        service.save_personal_template(request.name, request.draft)
    })
    .await
}

#[tauri::command]
pub async fn scan_installed_agents(
    request: ScanInstalledAgentsRequestDto,
    state: State<'_, AppState>,
) -> Result<InventoryScanDto, IpcErrorDto> {
    let service = state.agents.clone();
    state.inventory_watcher.refresh_roots();
    run_blocking("scan_installed_agents", move || {
        service
            .scan_installed_agents(request.platforms)
            .map(InventoryScanDto::from)
    })
    .await
}

#[tauri::command]
pub async fn get_agent_native_content(
    request: SourceRequestDto,
    state: State<'_, AppState>,
) -> Result<NativeAgentContentDto, IpcErrorDto> {
    let service = state.agents.clone();
    run_blocking("get_agent_native_content", move || {
        service
            .get_agent_native_content(&request.source_id)
            .map(NativeAgentContentDto::from)
    })
    .await
}

#[tauri::command]
pub async fn import_agent_for_editing(
    request: ImportAgentRequestDto,
    state: State<'_, AppState>,
) -> Result<ImportAgentResultDto, IpcErrorDto> {
    let service = state.agents.clone();
    run_blocking("import_agent_for_editing", move || {
        service
            .import_agent_for_editing(&request.source_id, &request.expected_revision)
            .map(ImportAgentResultDto::from)
    })
    .await
}

#[tauri::command]
pub async fn preview_agent_install(
    request: PreviewAgentInstallRequestDto,
    state: State<'_, AppState>,
) -> Result<crate::domain::agents::PreviewBatch, IpcErrorDto> {
    let service = state.agents.clone();
    run_blocking("preview_agent_install", move || {
        service.preview_agent_install(request.draft, request.targets)
    })
    .await
}

#[tauri::command]
pub async fn commit_agent_install(
    request: CommitAgentInstallRequestDto,
    state: State<'_, AppState>,
) -> Result<BatchCommitResult, IpcErrorDto> {
    let service = state.agents.clone();
    let watcher = state.inventory_watcher.clone();
    let result = run_blocking("commit_agent_install", move || {
        service.commit_agent_install(&request.write_plan_token)
    })
    .await?;
    watcher.refresh_roots();
    Ok(result)
}

#[tauri::command]
pub async fn reveal_agent_source(
    request: SourceRequestDto,
    state: State<'_, AppState>,
) -> Result<(), IpcErrorDto> {
    let service = state.agents.clone();
    run_blocking("reveal_agent_source", move || {
        let path = service.source_path(&request.source_id)?;
        reveal_path(&path)
    })
    .await
}

#[tauri::command]
pub async fn reveal_recovery_directory(
    request: RecoveryRequestDto,
    state: State<'_, AppState>,
) -> Result<(), IpcErrorDto> {
    let service = state.agents.clone();
    run_blocking("reveal_recovery_directory", move || {
        let path = service.recovery_path(&request.recovery_id)?;
        reveal_path(&path)
    })
    .await
}

async fn run_blocking<T, F>(operation: &str, task: F) -> Result<T, IpcErrorDto>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    run_blocking_with_id(operation_id(operation), task).await
}

async fn run_blocking_with_id<T, F>(operation_id: String, task: F) -> Result<T, IpcErrorDto>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, AppError> + Send + 'static,
{
    let result = tauri::async_runtime::spawn_blocking(task).await;
    match result {
        Ok(Ok(value)) => Ok(value),
        Ok(Err(error)) => Err(IpcErrorDto::from_error(error, operation_id)),
        Err(join_error) => Err(IpcErrorDto::from_error(
            AppError::new(AppErrorKind::Internal, "后台操作异常终止。").with_source(join_error),
            operation_id,
        )),
    }
}

fn operation_id(operation: &str) -> String {
    format!("{}:{}", operation, Uuid::new_v4())
}
