# Codex Model Catalog

> Executable contract for the `/v1/models` fetch chain: endpoint resolution
> from the user's codex configuration, HTTP port, file cache, and IPC command.

---

## Scenario: `list_codex_models`

### 1. Scope / Trigger

New IPC command + HTTP infrastructure + durable file cache. Feeds the model
dropdown in the codex advanced fields; must never block manual model input.

### 2. Signatures

```rust
// src-tauri/src/commands/mod.rs
#[tauri::command]
async fn list_codex_models(state, request: ListCodexModelsRequestDto)
    -> Result<CodexModelListDto, IpcErrorDto>;

// src-tauri/src/services/model_catalog.rs
impl ModelCatalogService { fn list_models(&self, force_refresh: bool) -> Result<ModelList, AppError>; }

// src-tauri/src/domain/ports/model_list_fetcher.rs (port, mirrors Clock pattern)
trait ModelListFetcher { fn fetch(&self, base_url: &str, api_key: Option<&str>) -> Result<Vec<String>, AppError>; }

// src-tauri/src/infrastructure/codex_config.rs (pure, zero IO; env lookup injected)
fn resolve_codex_endpoint(config_toml, auth_json, env_lookup) -> CodexEndpoint { base_url, api_key }
```

### 3. Contracts

- Request: `{ "forceRefresh": bool }` (camelCase, wrapped as `{ request }`).
- Response: `{ "baseUrl": string, "models": string[], "fetchedAtMs": number, "fromCache": bool }`
  → zod `codexModelListSchema`, consumed via `appIpc.listCodexModels` and
  `queryKeys.codexModels` only.
- Cache file: `app_data_dir/codex-models-cache.json` =
  `{ baseUrl, fetchedAtMs, models }`, written with `write_atomic`. Cache hit
  requires matching `baseUrl`. Corrupt cache file is treated as no cache.
- Source files (read-only): `~/.codex/config.toml`, `~/.codex/auth.json`.
- HTTP: `GET {base_url}/models` (same URL join codex itself uses — no path
  probing), `Authorization: Bearer <key>` when a key resolves, 10 s timeout,
  reqwest blocking (client built lazily inside the blocking pool), ids
  deduped + sorted.

### 4. Endpoint Resolution Rules

- `base_url`: `model_provider` → `[model_providers.<id>].base_url`, default
  `https://api.openai.com/v1` when absent.
- API key precedence: provider inline `api_key` → env var named by `env_key` →
  `auth.json.OPENAI_API_KEY` → none (request sent without auth header).
- This is a **deliberate superset** of codex's own chain (codex reads
  env_key/auth.json and ignores inline `api_key`); any config that works for
  codex works here, and inline keys honor the user-facing promise "uses what's
  in config.toml".
- Malformed `config.toml` degrades to the default endpoint + key fallback chain
  instead of erroring (intentional, tested): the dropdown is best-effort, the
  form must stay usable.

### 5. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| cache hit, not forced | return cache, `fromCache: true`, no network |
| fetch ok | write cache, `fromCache: false` |
| fetch fails, cache exists | return cache, `fromCache: true` |
| fetch fails, no cache | `AppError` whose message says manual input remains available |
| 401 / non-2xx / bad JSON | error path above; message contains base_url + status only |

### 6. Good / Base / Bad Cases

- Good: relay provider with inline key → list fetched, cached, restart serves
  cache without network.
- Base: no `config.toml` at all → official endpoint + auth.json key.
- Bad: OAuth-only login (no API key anywhere) → 401 → error → UI falls back to
  manual input; nothing blocks the form.

### 7. Tests Required

- `codex_config.rs`: inline / env_key / auth.json / none / malformed-TOML
  degradation (env lookup injected, no real env).
- `model_catalog.rs`: stub fetcher + tempdir — hit, force refresh, fail→cache
  fallback, fail→no-cache error, corrupt cache.
- Secret hygiene: regression asserts error strings never contain the api key.
  No real external network in tests (localhost loopback listeners are fine).

### 8. Wrong vs Correct

**Wrong**: fetching `/v1/models` from the webview (`fetch()`), which requires
CSP/capability holes and leaks the key into frontend state; or logging the
resolved key on failure.

**Correct**: HTTP stays behind the Rust `ModelListFetcher` port; the key lives
only in Rust memory; the frontend consumes the typed IPC response through
TanStack Query.
