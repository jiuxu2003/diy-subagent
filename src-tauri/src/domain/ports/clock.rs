use std::time::{SystemTime, UNIX_EPOCH};

pub trait Clock: Send + Sync {
    fn now_ms(&self) -> i64;
}

#[derive(Debug, Default)]
pub struct SystemClock;

impl Clock for SystemClock {
    fn now_ms(&self) -> i64 {
        let duration = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default();
        i64::try_from(duration.as_millis()).unwrap_or(i64::MAX)
    }
}
