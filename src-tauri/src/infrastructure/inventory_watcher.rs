use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
    sync::{
        mpsc::{self, Receiver, RecvTimeoutError},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use tracing::warn;

use crate::{
    domain::agents::AgentPlatform,
    error::{AppError, AppErrorKind},
    infrastructure::paths::PlatformPathResolver,
    services::AgentApplicationService,
};

pub const INVENTORY_CHANGED_EVENT: &str = "inventory://changed";
const WATCH_DEBOUNCE: Duration = Duration::from_millis(250);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InventoryChangedPayload {
    platform: AgentPlatform,
    inventory_revision: String,
}

pub struct InventoryWatcher {
    watcher: Mutex<Option<RecommendedWatcher>>,
    watched_roots: Arc<RwLock<BTreeMap<AgentPlatform, PathBuf>>>,
    paths: Arc<PlatformPathResolver>,
}

impl InventoryWatcher {
    pub fn start(
        app: AppHandle,
        agents: AgentApplicationService,
        paths: Arc<PlatformPathResolver>,
    ) -> Self {
        let watched_roots = Arc::new(RwLock::new(BTreeMap::new()));
        let (sender, receiver) = mpsc::channel::<notify::Result<Event>>();
        let mut watcher = match RecommendedWatcher::new(sender, Config::default()) {
            Ok(watcher) => Some(watcher),
            Err(source) => {
                log_watch_error(
                    &AppError::new(
                        AppErrorKind::WatchFailed,
                        "无法启动原生 Agent 目录监听，仍可使用手动刷新。",
                    )
                    .with_source(source),
                );
                None
            }
        };

        if watcher.is_some() {
            let worker_roots = watched_roots.clone();
            let spawn_result = thread::Builder::new()
                .name("inventory-watcher".to_owned())
                .spawn(move || {
                    run_event_loop(receiver, worker_roots, WATCH_DEBOUNCE, move |platform| {
                        refresh_inventory(&app, &agents, platform)
                    });
                });
            if let Err(source) = spawn_result {
                log_watch_error(
                    &AppError::new(
                        AppErrorKind::WatchFailed,
                        "无法启动目录监听工作线程，仍可使用手动刷新。",
                    )
                    .with_source(source),
                );
                watcher = None;
            }
        }

        let service = Self {
            watcher: Mutex::new(watcher),
            watched_roots,
            paths,
        };
        service.refresh_roots();
        service
    }

    pub fn refresh_roots(&self) {
        let desired = AgentPlatform::ALL
            .into_iter()
            .filter_map(|platform| match self.paths.root_path(platform) {
                Ok(root) if root.is_dir() => Some((platform, root)),
                Ok(_) => None,
                Err(error) => {
                    warn!(
                        platform = %platform,
                        error_code = error.code(),
                        "inventory watcher skipped an unresolved platform root"
                    );
                    None
                }
            })
            .collect::<BTreeMap<_, _>>();
        let mut watcher_guard = self.watcher.lock();
        let Some(watcher) = watcher_guard.as_mut() else {
            return;
        };
        let current = self.watched_roots.read().clone();
        let mut next = current.clone();

        for (platform, root) in &current {
            if desired.get(platform) == Some(root) {
                continue;
            }
            if let Err(source) = watcher.unwatch(root) {
                log_watch_error(
                    &AppError::new(AppErrorKind::WatchFailed, "移除旧 Agent 目录监听失败。")
                        .with_source(source),
                );
            }
            next.remove(platform);
        }

        for (platform, root) in desired {
            if current.get(&platform) == Some(&root) {
                continue;
            }
            match watcher.watch(&root, RecursiveMode::Recursive) {
                Ok(()) => {
                    next.insert(platform, root);
                }
                Err(source) => log_watch_error(
                    &AppError::new(
                        AppErrorKind::WatchFailed,
                        "注册 Agent 目录监听失败，仍可使用手动刷新。",
                    )
                    .with_source(source),
                ),
            }
        }

        *self.watched_roots.write() = next;
    }
}

fn run_event_loop<F>(
    receiver: Receiver<notify::Result<Event>>,
    watched_roots: Arc<RwLock<BTreeMap<AgentPlatform, PathBuf>>>,
    debounce: Duration,
    mut refresh: F,
) where
    F: FnMut(AgentPlatform),
{
    loop {
        let first = match receiver.recv() {
            Ok(event) => event,
            Err(_) => return,
        };
        let mut affected = BTreeSet::new();
        collect_affected(first, &watched_roots, &mut affected);
        let deadline = Instant::now() + debounce;
        let mut disconnected = false;

        loop {
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            match receiver.recv_timeout(remaining) {
                Ok(event) => collect_affected(event, &watched_roots, &mut affected),
                Err(RecvTimeoutError::Timeout) => break,
                Err(RecvTimeoutError::Disconnected) => {
                    disconnected = true;
                    break;
                }
            }
        }

        for platform in affected {
            refresh(platform);
        }
        if disconnected {
            return;
        }
    }
}

fn collect_affected(
    result: notify::Result<Event>,
    watched_roots: &RwLock<BTreeMap<AgentPlatform, PathBuf>>,
    affected: &mut BTreeSet<AgentPlatform>,
) {
    match result {
        Ok(event) => {
            let roots = watched_roots.read();
            for (platform, root) in roots.iter() {
                if event.paths.iter().any(|path| path.starts_with(root)) {
                    affected.insert(*platform);
                }
            }
        }
        Err(_) => warn!("filesystem watcher reported an event delivery error"),
    }
}

fn refresh_inventory(app: &AppHandle, agents: &AgentApplicationService, platform: AgentPlatform) {
    match agents.scan_installed_agents(Some(vec![platform])) {
        Ok(scan) => {
            if app
                .emit(
                    INVENTORY_CHANGED_EVENT,
                    InventoryChangedPayload {
                        platform,
                        inventory_revision: scan.inventory_revision,
                    },
                )
                .is_err()
            {
                warn!(platform = %platform, "inventory revision event could not be emitted");
            }
        }
        Err(error) => warn!(
            platform = %platform,
            error_code = error.code(),
            "inventory refresh after filesystem event failed"
        ),
    }
}

fn log_watch_error(error: &AppError) {
    warn!(
        error_code = error.code(),
        "inventory watcher unavailable or partially degraded; manual refresh remains available"
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use notify::EventKind;

    #[test]
    fn coalesces_events_and_routes_them_to_the_owning_platform() {
        let roots = Arc::new(RwLock::new(BTreeMap::from([
            (AgentPlatform::Claude, PathBuf::from("/tmp/claude-agents")),
            (AgentPlatform::Codex, PathBuf::from("/tmp/codex-agents")),
        ])));
        let (sender, receiver) = mpsc::channel();
        sender
            .send(Ok(
                Event::new(EventKind::Any).add_path(PathBuf::from("/tmp/claude-agents/one.md"))
            ))
            .expect("first event sends");
        sender
            .send(Ok(
                Event::new(EventKind::Any).add_path(PathBuf::from("/tmp/claude-agents/two.md"))
            ))
            .expect("second event sends");
        sender
            .send(Ok(
                Event::new(EventKind::Any).add_path(PathBuf::from("/tmp/codex-agents/one.toml"))
            ))
            .expect("third event sends");
        drop(sender);

        let refreshed = Arc::new(Mutex::new(Vec::new()));
        let captured = refreshed.clone();
        run_event_loop(receiver, roots, Duration::from_millis(5), move |platform| {
            captured.lock().push(platform);
        });

        assert_eq!(
            refreshed.lock().as_slice(),
            &[AgentPlatform::Claude, AgentPlatform::Codex]
        );
    }
}
