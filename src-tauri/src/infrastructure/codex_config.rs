//! Pure resolution of the Codex CLI endpoint (base URL + api key) from the
//! textual contents of `~/.codex/config.toml` and `~/.codex/auth.json`.
//!
//! This module performs no IO: callers read the files (or pass empty/None when
//! a file is missing) and inject an environment lookup, keeping every branch
//! unit-testable and deterministic.

use toml_edit::DocumentMut;

/// Official OpenAI endpoint used when no custom model provider is configured.
pub const DEFAULT_OPENAI_BASE_URL: &str = "https://api.openai.com/v1";

/// Resolved OpenAI-compatible endpoint for model list requests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodexEndpoint {
    /// Base URL without a trailing slash, e.g. `https://api.openai.com/v1`.
    pub base_url: String,
    /// Api key resolved through the provider/env/auth.json chain, if any.
    pub api_key: Option<String>,
}

/// Resolves the endpoint from raw file contents.
///
/// Rules (mirroring Codex CLI semantics):
/// - `model_provider` selects a `[model_providers.<id>]` table; its `base_url`
///   wins, otherwise the official URL is used. A missing provider table or a
///   malformed `config.toml` degrades to the default URL without failing.
/// - Api key priority: inline provider `api_key`, then the environment
///   variable named by the provider `env_key` (via `env_lookup`), then the
///   `OPENAI_API_KEY` entry of `auth.json`.
pub fn resolve_codex_endpoint(
    config_toml: &str,
    auth_json: Option<&str>,
    env_lookup: &dyn Fn(&str) -> Option<String>,
) -> CodexEndpoint {
    // A malformed config.toml must not panic or abort the chain: treat it as
    // "no provider configured" and keep walking the key fallbacks.
    let document = config_toml.parse::<DocumentMut>().ok();
    let provider = document.as_ref().and_then(provider_table);

    let base_url = provider
        .and_then(|table| non_empty_str(table.get("base_url")))
        .map(|url| url.trim_end_matches('/'))
        .filter(|url| !url.is_empty())
        .map_or_else(|| DEFAULT_OPENAI_BASE_URL.to_owned(), str::to_owned);

    let inline_key = provider
        .and_then(|table| non_empty_str(table.get("api_key")))
        .map(str::to_owned);
    let env_key = provider
        .and_then(|table| non_empty_str(table.get("env_key")))
        .and_then(env_lookup)
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    let auth_key = auth_json.and_then(auth_json_api_key);

    CodexEndpoint {
        base_url,
        api_key: inline_key.or(env_key).or(auth_key),
    }
}

/// Looks up the `[model_providers.<id>]` table selected by `model_provider`.
fn provider_table(document: &DocumentMut) -> Option<&dyn toml_edit::TableLike> {
    let provider_id = document.get("model_provider")?.as_str()?;
    document
        .get("model_providers")?
        .as_table_like()?
        .get(provider_id)?
        .as_table_like()
}

fn non_empty_str(item: Option<&toml_edit::Item>) -> Option<&str> {
    item.and_then(toml_edit::Item::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

/// Extracts `OPENAI_API_KEY` from auth.json; malformed JSON yields `None`.
fn auth_json_api_key(auth_json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(auth_json).ok()?;
    value
        .get("OPENAI_API_KEY")?
        .as_str()
        .map(str::trim)
        .filter(|key| !key.is_empty())
        .map(str::to_owned)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use pretty_assertions::assert_eq;

    use super::{resolve_codex_endpoint, CodexEndpoint, DEFAULT_OPENAI_BASE_URL};

    fn env_from(pairs: &[(&str, &str)]) -> impl Fn(&str) -> Option<String> {
        let map: HashMap<String, String> = pairs
            .iter()
            .map(|(key, value)| ((*key).to_owned(), (*value).to_owned()))
            .collect();
        move |name: &str| map.get(name).cloned()
    }

    const PROVIDER_CONFIG: &str = r#"
model = "gpt-5.6-sol"
model_provider = "cliproxyapi"

[model_providers.cliproxyapi]
name = "CLIProxyAPI"
base_url = "https://proxy.example/v1/"
api_key = "sk-inline-key"
env_key = "PROXY_API_KEY"
"#;

    #[test]
    fn inline_api_key_wins_over_env_key_and_auth_json() {
        let env = env_from(&[("PROXY_API_KEY", "sk-env-key")]);
        let endpoint = resolve_codex_endpoint(
            PROVIDER_CONFIG,
            Some(r#"{"OPENAI_API_KEY": "sk-auth-key"}"#),
            &env,
        );

        assert_eq!(
            endpoint,
            CodexEndpoint {
                base_url: "https://proxy.example/v1".to_owned(),
                api_key: Some("sk-inline-key".to_owned()),
            }
        );
    }

    #[test]
    fn env_key_is_used_when_no_inline_api_key_exists() {
        let config = r#"
model_provider = "proxy"

[model_providers.proxy]
base_url = "https://proxy.example/v1"
env_key = "PROXY_API_KEY"
"#;
        let env = env_from(&[("PROXY_API_KEY", "sk-env-key")]);
        let endpoint =
            resolve_codex_endpoint(config, Some(r#"{"OPENAI_API_KEY": "sk-auth-key"}"#), &env);

        assert_eq!(endpoint.api_key, Some("sk-env-key".to_owned()));
    }

    #[test]
    fn auth_json_is_the_last_key_fallback() {
        let config = r#"
model_provider = "proxy"

[model_providers.proxy]
base_url = "https://proxy.example/v1"
env_key = "PROXY_API_KEY"
"#;
        let env = env_from(&[]);
        let endpoint =
            resolve_codex_endpoint(config, Some(r#"{"OPENAI_API_KEY": "sk-auth-key"}"#), &env);

        assert_eq!(endpoint.api_key, Some("sk-auth-key".to_owned()));
    }

    #[test]
    fn missing_every_key_source_yields_no_api_key() {
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint("", None, &env);

        assert_eq!(
            endpoint,
            CodexEndpoint {
                base_url: DEFAULT_OPENAI_BASE_URL.to_owned(),
                api_key: None,
            }
        );
    }

    #[test]
    fn missing_provider_uses_the_official_base_url_with_auth_json_key() {
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint(
            "model = \"gpt-5.6-sol\"\n",
            Some(r#"{"OPENAI_API_KEY": "sk-auth-key"}"#),
            &env,
        );

        assert_eq!(endpoint.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(endpoint.api_key, Some("sk-auth-key".to_owned()));
    }

    #[test]
    fn provider_reference_without_a_matching_table_degrades_to_default_url() {
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint("model_provider = \"ghost\"\n", None, &env);

        assert_eq!(endpoint.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(endpoint.api_key, None);
    }

    #[test]
    fn malformed_config_degrades_without_breaking_the_key_chain() {
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint(
            "model_provider = [broken",
            Some(r#"{"OPENAI_API_KEY": "sk-auth-key"}"#),
            &env,
        );

        assert_eq!(endpoint.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(endpoint.api_key, Some("sk-auth-key".to_owned()));
    }

    #[test]
    fn malformed_auth_json_yields_no_key_instead_of_failing() {
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint("", Some("not json"), &env);

        assert_eq!(endpoint.api_key, None);
    }

    #[test]
    fn blank_inline_values_are_treated_as_absent() {
        let config = r#"
model_provider = "proxy"

[model_providers.proxy]
base_url = "   "
api_key = ""
"#;
        let env = env_from(&[]);
        let endpoint = resolve_codex_endpoint(config, None, &env);

        assert_eq!(endpoint.base_url, DEFAULT_OPENAI_BASE_URL);
        assert_eq!(endpoint.api_key, None);
    }
}
