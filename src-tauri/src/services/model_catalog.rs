use std::{fs, path::PathBuf, sync::Arc};

use serde::{Deserialize, Serialize};

use crate::{
    domain::ports::{Clock, ModelListFetcher},
    error::{AppError, AppErrorKind},
    infrastructure::{codex_config::resolve_codex_endpoint, filesystem::write_atomic},
};

const CACHE_FILE_NAME: &str = "codex-models-cache.json";
const CODEX_CONFIG_RELATIVE: &str = ".codex/config.toml";
const CODEX_AUTH_RELATIVE: &str = ".codex/auth.json";

/// Result of a model list lookup, either freshly fetched or served from the
/// local cache file.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ModelList {
    pub base_url: String,
    pub models: Vec<String>,
    pub fetched_at_ms: i64,
    pub from_cache: bool,
}

/// On-disk cache payload; field names intentionally match the IPC casing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelListCache {
    base_url: String,
    fetched_at_ms: i64,
    models: Vec<String>,
}

impl ModelListCache {
    fn into_model_list(self, from_cache: bool) -> ModelList {
        ModelList {
            base_url: self.base_url,
            models: self.models,
            fetched_at_ms: self.fetched_at_ms,
            from_cache,
        }
    }
}

/// Lists Codex-compatible model ids, caching results on disk so the list
/// survives application restarts without a new network request.
#[derive(Clone)]
pub struct ModelCatalogService {
    fetcher: Arc<dyn ModelListFetcher>,
    clock: Arc<dyn Clock>,
    home_dir: PathBuf,
    cache_path: PathBuf,
}

impl ModelCatalogService {
    pub fn new(
        fetcher: Arc<dyn ModelListFetcher>,
        clock: Arc<dyn Clock>,
        home_dir: PathBuf,
        app_data_dir: PathBuf,
    ) -> Self {
        Self {
            fetcher,
            clock,
            home_dir,
            cache_path: app_data_dir.join(CACHE_FILE_NAME),
        }
    }

    /// Returns the model list for the currently configured Codex endpoint.
    ///
    /// - Without `force_refresh`, a cache entry whose base URL matches the
    ///   resolved endpoint is returned directly.
    /// - Otherwise the endpoint is fetched; success rewrites the cache.
    /// - On fetch failure any existing cache is returned as a fallback; with
    ///   no cache a typed error tells the user manual input still works.
    pub fn list_models(&self, force_refresh: bool) -> Result<ModelList, AppError> {
        let endpoint = self.resolve_endpoint();
        let cache = self.read_cache();

        if !force_refresh {
            if let Some(entry) = &cache {
                if entry.base_url == endpoint.base_url {
                    return Ok(entry.clone().into_model_list(true));
                }
            }
        }

        match self
            .fetcher
            .fetch(&endpoint.base_url, endpoint.api_key.as_deref())
        {
            Ok(models) => {
                let entry = ModelListCache {
                    base_url: endpoint.base_url,
                    fetched_at_ms: self.clock.now_ms(),
                    models,
                };
                self.write_cache(&entry)?;
                Ok(entry.into_model_list(false))
            }
            Err(error) => match cache {
                Some(entry) => Ok(entry.into_model_list(true)),
                None => Err(AppError::new(
                    AppErrorKind::Internal,
                    format!(
                        "无法获取模型列表：{}；可直接手动输入模型名。",
                        error.message
                    ),
                )
                .with_source(error)),
            },
        }
    }

    /// Reads `~/.codex/config.toml` and `~/.codex/auth.json` (both optional)
    /// and resolves the endpoint. Missing files degrade to the official URL.
    fn resolve_endpoint(&self) -> crate::infrastructure::codex_config::CodexEndpoint {
        let config = fs::read_to_string(self.home_dir.join(CODEX_CONFIG_RELATIVE)).ok();
        let auth = fs::read_to_string(self.home_dir.join(CODEX_AUTH_RELATIVE)).ok();
        resolve_codex_endpoint(config.as_deref().unwrap_or(""), auth.as_deref(), &|name| {
            std::env::var(name).ok()
        })
    }

    /// A missing or corrupt cache file is simply treated as "no cache".
    fn read_cache(&self) -> Option<ModelListCache> {
        let bytes = fs::read(&self.cache_path).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    fn write_cache(&self, entry: &ModelListCache) -> Result<(), AppError> {
        let bytes = serde_json::to_vec_pretty(entry).map_err(|source| {
            AppError::new(AppErrorKind::Internal, "无法序列化模型列表缓存。").with_source(source)
        })?;
        write_atomic(&self.cache_path, &bytes)
    }
}

#[cfg(test)]
mod tests {
    use std::{collections::VecDeque, sync::Arc};

    use parking_lot::Mutex;
    use pretty_assertions::assert_eq;
    use tempfile::TempDir;

    use super::{ModelCatalogService, ModelList};
    use crate::{
        domain::ports::{Clock, ModelListFetcher},
        error::{AppError, AppErrorKind},
        infrastructure::codex_config::DEFAULT_OPENAI_BASE_URL,
    };

    struct FixedClock(i64);

    impl Clock for FixedClock {
        fn now_ms(&self) -> i64 {
            self.0
        }
    }

    #[derive(Default)]
    struct StubFetcher {
        responses: Mutex<VecDeque<Result<Vec<String>, AppError>>>,
        calls: Mutex<Vec<(String, Option<String>)>>,
    }

    impl StubFetcher {
        fn with_responses(responses: Vec<Result<Vec<String>, AppError>>) -> Arc<Self> {
            Arc::new(Self {
                responses: Mutex::new(responses.into()),
                calls: Mutex::new(Vec::new()),
            })
        }

        fn calls(&self) -> Vec<(String, Option<String>)> {
            self.calls.lock().clone()
        }
    }

    impl ModelListFetcher for StubFetcher {
        fn fetch(&self, base_url: &str, api_key: Option<&str>) -> Result<Vec<String>, AppError> {
            self.calls
                .lock()
                .push((base_url.to_owned(), api_key.map(str::to_owned)));
            self.responses
                .lock()
                .pop_front()
                .expect("stub fetcher called more times than expected")
        }
    }

    struct Harness {
        service: ModelCatalogService,
        fetcher: Arc<StubFetcher>,
        home: TempDir,
        app_data: TempDir,
    }

    fn harness(responses: Vec<Result<Vec<String>, AppError>>) -> Harness {
        let home = TempDir::new().expect("temporary home");
        let app_data = TempDir::new().expect("temporary app data dir");
        let fetcher = StubFetcher::with_responses(responses);
        let service = ModelCatalogService::new(
            fetcher.clone(),
            Arc::new(FixedClock(1_234_000)),
            home.path().to_path_buf(),
            app_data.path().to_path_buf(),
        );
        Harness {
            service,
            fetcher,
            home,
            app_data,
        }
    }

    fn cache_path(harness: &Harness) -> std::path::PathBuf {
        harness.app_data.path().join("codex-models-cache.json")
    }

    fn write_cache_file(harness: &Harness, base_url: &str, models: &[&str]) {
        let payload = serde_json::json!({
            "baseUrl": base_url,
            "fetchedAtMs": 42,
            "models": models,
        });
        std::fs::write(cache_path(harness), payload.to_string()).expect("cache file writes");
    }

    #[test]
    fn matching_cache_is_returned_without_touching_the_network() {
        let harness = harness(Vec::new());
        write_cache_file(&harness, DEFAULT_OPENAI_BASE_URL, &["gpt-5.4"]);

        let list = harness.service.list_models(false).expect("cache hit");

        assert_eq!(
            list,
            ModelList {
                base_url: DEFAULT_OPENAI_BASE_URL.to_owned(),
                models: vec!["gpt-5.4".to_owned()],
                fetched_at_ms: 42,
                from_cache: true,
            }
        );
        assert!(harness.fetcher.calls().is_empty());
    }

    #[test]
    fn force_refresh_bypasses_the_cache_and_rewrites_it() {
        let harness = harness(vec![Ok(vec![
            "gpt-5.4".to_owned(),
            "gpt-5.4-mini".to_owned(),
        ])]);
        write_cache_file(&harness, DEFAULT_OPENAI_BASE_URL, &["stale-model"]);

        let list = harness.service.list_models(true).expect("forced refresh");

        assert!(!list.from_cache);
        assert_eq!(list.fetched_at_ms, 1_234_000);
        assert_eq!(
            list.models,
            vec!["gpt-5.4".to_owned(), "gpt-5.4-mini".to_owned()]
        );
        let rewritten: serde_json::Value =
            serde_json::from_slice(&std::fs::read(cache_path(&harness)).expect("cache readable"))
                .expect("cache parses");
        assert_eq!(
            rewritten["models"],
            serde_json::json!(["gpt-5.4", "gpt-5.4-mini"])
        );
        assert_eq!(
            rewritten["baseUrl"],
            serde_json::json!(DEFAULT_OPENAI_BASE_URL)
        );
        assert_eq!(rewritten["fetchedAtMs"], serde_json::json!(1_234_000));
    }

    #[test]
    fn fetch_failure_falls_back_to_the_existing_cache() {
        let harness = harness(vec![Err(AppError::new(
            AppErrorKind::Internal,
            "模型列表接口返回 HTTP 503。",
        ))]);
        write_cache_file(&harness, DEFAULT_OPENAI_BASE_URL, &["gpt-5.4"]);

        let list = harness
            .service
            .list_models(true)
            .expect("cache fallback succeeds");

        assert!(list.from_cache);
        assert_eq!(list.models, vec!["gpt-5.4".to_owned()]);
    }

    #[test]
    fn fetch_failure_without_cache_reports_manual_input_guidance() {
        let harness = harness(vec![Err(AppError::new(
            AppErrorKind::Internal,
            "模型列表接口返回 HTTP 401。",
        ))]);

        let error = harness
            .service
            .list_models(false)
            .expect_err("no cache to fall back to");

        assert_eq!(error.kind, AppErrorKind::Internal);
        assert!(error.message.contains("手动输入"));
        assert!(error.message.contains("401"));
    }

    #[test]
    fn corrupt_cache_is_treated_as_missing() {
        let harness = harness(vec![Ok(vec!["gpt-5.4".to_owned()])]);
        std::fs::write(cache_path(&harness), b"{not json").expect("corrupt cache writes");

        let list = harness.service.list_models(false).expect("fresh fetch");

        assert!(!list.from_cache);
        assert_eq!(harness.fetcher.calls().len(), 1);
    }

    #[test]
    fn base_url_mismatch_ignores_the_cache_and_refetches() {
        let harness = harness(vec![Ok(vec!["proxy-model".to_owned()])]);
        write_cache_file(&harness, "https://old.example/v1", &["old-model"]);

        let list = harness
            .service
            .list_models(false)
            .expect("refetch succeeds");

        assert!(!list.from_cache);
        assert_eq!(list.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(list.models, vec!["proxy-model".to_owned()]);
    }

    #[test]
    fn provider_config_and_inline_key_reach_the_fetcher() {
        let harness = harness(vec![Ok(vec!["gpt-5.6-sol".to_owned()])]);
        let codex_dir = harness.home.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).expect("codex dir creates");
        std::fs::write(
            codex_dir.join("config.toml"),
            concat!(
                "model_provider = \"cliproxyapi\"\n\n",
                "[model_providers.cliproxyapi]\n",
                "base_url = \"https://proxy.example/v1/\"\n",
                "api_key = \"sk-inline-key\"\n",
            ),
        )
        .expect("config writes");

        let list = harness.service.list_models(false).expect("fetch succeeds");

        assert_eq!(list.base_url, "https://proxy.example/v1");
        assert_eq!(
            harness.fetcher.calls(),
            vec![(
                "https://proxy.example/v1".to_owned(),
                Some("sk-inline-key".to_owned()),
            )]
        );
    }

    #[test]
    fn auth_json_key_is_used_when_config_is_absent() {
        let harness = harness(vec![Ok(vec!["gpt-5.4".to_owned()])]);
        let codex_dir = harness.home.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).expect("codex dir creates");
        std::fs::write(
            codex_dir.join("auth.json"),
            r#"{"OPENAI_API_KEY": "sk-auth-key"}"#,
        )
        .expect("auth.json writes");

        harness.service.list_models(false).expect("fetch succeeds");

        assert_eq!(
            harness.fetcher.calls(),
            vec![(
                DEFAULT_OPENAI_BASE_URL.to_owned(),
                Some("sk-auth-key".to_owned()),
            )]
        );
    }

    #[test]
    fn error_paths_never_leak_the_api_key() {
        let harness = harness(vec![Err(AppError::new(
            AppErrorKind::Internal,
            "模型列表接口返回 HTTP 401。",
        ))]);
        let codex_dir = harness.home.path().join(".codex");
        std::fs::create_dir_all(&codex_dir).expect("codex dir creates");
        std::fs::write(
            codex_dir.join("auth.json"),
            r#"{"OPENAI_API_KEY": "sk-super-secret"}"#,
        )
        .expect("auth.json writes");

        let error = harness
            .service
            .list_models(false)
            .expect_err("fetch fails without cache");

        assert!(!error.message.contains("sk-super-secret"));
    }
}
