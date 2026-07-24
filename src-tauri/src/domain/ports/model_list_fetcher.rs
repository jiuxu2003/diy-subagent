use crate::error::AppError;

/// Port for fetching the model identifier list from an OpenAI-compatible
/// endpoint. Production code performs a blocking HTTP request; tests inject a
/// stub so no real network is ever touched.
pub trait ModelListFetcher: Send + Sync {
    /// Fetches model ids from `{base_url}/models`. Implementations must never
    /// include the api key in returned error messages or logs.
    fn fetch(&self, base_url: &str, api_key: Option<&str>) -> Result<Vec<String>, AppError>;
}
