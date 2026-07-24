//! Production `ModelListFetcher` backed by a blocking reqwest client.
//!
//! The client is built lazily inside `fetch` so construction happens on the
//! blocking thread pool (commands wrap service calls in `spawn_blocking`),
//! never on an async worker thread.

use std::time::Duration;

use serde::Deserialize;

use crate::{
    domain::ports::ModelListFetcher,
    error::{AppError, AppErrorKind},
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

/// Fetches `{base_url}/models` from an OpenAI-compatible endpoint.
#[derive(Debug, Default)]
pub struct HttpModelListFetcher;

/// OpenAI-compatible `/v1/models` response shape: `{"data":[{"id":"..."}]}`.
#[derive(Debug, Deserialize)]
struct ModelListResponse {
    #[serde(default)]
    data: Vec<ModelEntry>,
}

#[derive(Debug, Deserialize)]
struct ModelEntry {
    id: String,
}

impl ModelListFetcher for HttpModelListFetcher {
    fn fetch(&self, base_url: &str, api_key: Option<&str>) -> Result<Vec<String>, AppError> {
        let url = format!("{}/models", base_url.trim_end_matches('/'));
        let client = reqwest::blocking::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|source| {
                AppError::new(AppErrorKind::Internal, "无法初始化网络客户端。").with_source(source)
            })?;
        let mut request = client.get(&url);
        if let Some(key) = api_key {
            request = request.bearer_auth(key);
        }
        // reqwest errors only carry the URL and status, never request headers,
        // so the api key cannot leak through these messages or sources.
        let response = request.send().map_err(|source| {
            AppError::new(AppErrorKind::Internal, format!("请求模型列表失败：{url}"))
                .with_source(source)
        })?;
        let status = response.status();
        if !status.is_success() {
            return Err(AppError::new(
                AppErrorKind::Internal,
                format!("模型列表接口返回 HTTP {}：{url}", status.as_u16()),
            ));
        }
        let payload: ModelListResponse = response.json().map_err(|source| {
            AppError::new(
                AppErrorKind::Internal,
                "模型列表响应不是可识别的 JSON 结构。",
            )
            .with_source(source)
        })?;

        let mut models: Vec<String> = payload
            .data
            .into_iter()
            .map(|entry| entry.id.trim().to_owned())
            .filter(|id| !id.is_empty())
            .collect();
        models.sort();
        models.dedup();
        Ok(models)
    }
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        sync::mpsc,
        thread,
    };

    use pretty_assertions::assert_eq;

    use super::HttpModelListFetcher;
    use crate::domain::ports::ModelListFetcher;

    /// Serves exactly one canned HTTP response on 127.0.0.1 and returns the
    /// base URL plus a receiver yielding the raw request head.
    fn serve_once(status_line: &str, body: &str) -> (String, mpsc::Receiver<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").expect("loopback listener binds");
        let address = listener.local_addr().expect("local address resolves");
        let response = format!(
            "{status_line}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let (sender, receiver) = mpsc::channel();
        thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("connection accepted");
            let mut request = Vec::new();
            let mut buffer = [0_u8; 1024];
            loop {
                let read = stream.read(&mut buffer).expect("request bytes read");
                request.extend_from_slice(&buffer[..read]);
                if read == 0 || request.windows(4).any(|window| window == b"\r\n\r\n") {
                    break;
                }
            }
            sender
                .send(String::from_utf8_lossy(&request).into_owned())
                .expect("request head forwarded");
            stream
                .write_all(response.as_bytes())
                .expect("response written");
        });
        (format!("http://{address}"), receiver)
    }

    #[test]
    fn fetch_normalizes_the_url_sorts_and_dedupes_model_ids() {
        let (base, requests) = serve_once(
            "HTTP/1.1 200 OK",
            r#"{"object":"list","data":[{"id":"gpt-b"},{"id":"gpt-a"},{"id":"gpt-a"},{"id":"  "}]}"#,
        );

        let models = HttpModelListFetcher
            .fetch(&format!("{base}/v1/"), Some("sk-test-key"))
            .expect("model list fetches");

        assert_eq!(models, vec!["gpt-a".to_owned(), "gpt-b".to_owned()]);
        let request = requests.recv().expect("request captured");
        assert!(request.starts_with("GET /v1/models HTTP/1.1"));
        assert!(request
            .to_lowercase()
            .contains("authorization: bearer sk-test-key"));
    }

    #[test]
    fn non_success_status_surfaces_without_the_api_key() {
        let (base, _requests) = serve_once("HTTP/1.1 401 Unauthorized", r#"{"error":"nope"}"#);

        let error = HttpModelListFetcher
            .fetch(&base, Some("sk-secret-key"))
            .expect_err("unauthorized response fails");

        assert!(error.message.contains("401"));
        assert!(!error.message.contains("sk-secret-key"));
    }

    #[test]
    fn malformed_payload_is_a_typed_error() {
        let (base, _requests) = serve_once("HTTP/1.1 200 OK", "not json");

        let error = HttpModelListFetcher
            .fetch(&base, None)
            .expect_err("malformed payload fails");

        assert!(error.message.contains("JSON"));
    }
}
