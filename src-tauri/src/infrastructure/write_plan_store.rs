use std::{collections::HashMap, path::PathBuf, sync::Arc};

use parking_lot::Mutex;
use uuid::Uuid;

use crate::{
    domain::{
        agents::{AgentPlatform, ConflictAction, SourceRevision, WritePlanToken},
        ports::Clock,
    },
    error::{AppError, AppErrorKind, RecoveryAction},
};

const WRITE_PLAN_TTL_MS: i64 = 10 * 60 * 1_000;

#[derive(Debug, Clone)]
pub struct StoredTargetPlan {
    pub platform: AgentPlatform,
    pub root: PathBuf,
    pub target: PathBuf,
    pub rendered_bytes: Vec<u8>,
    pub expected_revision: Option<SourceRevision>,
    pub conflict_action: ConflictAction,
    pub is_source_update: bool,
}

#[derive(Debug, Clone)]
pub struct StoredWritePlan {
    pub targets: Vec<StoredTargetPlan>,
    pub expires_at_ms: i64,
}

pub struct WritePlanStore {
    plans: Mutex<HashMap<String, StoredWritePlan>>,
    clock: Arc<dyn Clock>,
}

impl WritePlanStore {
    pub fn new(clock: Arc<dyn Clock>) -> Self {
        Self {
            plans: Mutex::new(HashMap::new()),
            clock,
        }
    }

    pub fn create(&self, targets: Vec<StoredTargetPlan>) -> (WritePlanToken, i64) {
        let token = WritePlanToken(Uuid::new_v4().to_string());
        let expires_at_ms = self.clock.now_ms().saturating_add(WRITE_PLAN_TTL_MS);
        self.plans.lock().insert(
            token.0.clone(),
            StoredWritePlan {
                targets,
                expires_at_ms,
            },
        );
        (token, expires_at_ms)
    }

    pub fn take(&self, token: &WritePlanToken) -> Result<StoredWritePlan, AppError> {
        let plan = self.plans.lock().remove(&token.0).ok_or_else(|| {
            AppError::new(
                AppErrorKind::PreviewInvalid,
                "预览已失效或已被使用，请重新生成预览。",
            )
            .with_recovery(RecoveryAction::RecreatePreview)
        })?;
        if plan.expires_at_ms <= self.clock.now_ms() {
            return Err(AppError::new(
                AppErrorKind::PreviewExpired,
                "预览已超过 10 分钟有效期，请重新生成。",
            )
            .with_recovery(RecoveryAction::RecreatePreview));
        }
        Ok(plan)
    }

    pub fn clear(&self) {
        self.plans.lock().clear();
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicI64, Ordering};

    use super::*;

    struct TestClock {
        now_ms: AtomicI64,
    }

    impl TestClock {
        fn new(now_ms: i64) -> Self {
            Self {
                now_ms: AtomicI64::new(now_ms),
            }
        }

        fn set(&self, now_ms: i64) {
            self.now_ms.store(now_ms, Ordering::SeqCst);
        }
    }

    impl Clock for TestClock {
        fn now_ms(&self) -> i64 {
            self.now_ms.load(Ordering::SeqCst)
        }
    }

    #[test]
    fn write_plan_tokens_are_single_use() {
        let store = WritePlanStore::new(Arc::new(TestClock::new(1_000)));
        let (token, _) = store.create(Vec::new());

        store.take(&token).expect("first token use succeeds");
        let error = store.take(&token).expect_err("second token use fails");

        assert_eq!(error.kind, AppErrorKind::PreviewInvalid);
    }

    #[test]
    fn write_plan_expires_at_the_exact_ttl_boundary() {
        let clock = Arc::new(TestClock::new(1_000));
        let store = WritePlanStore::new(clock.clone());
        let (token, expires_at_ms) = store.create(Vec::new());
        clock.set(expires_at_ms);

        let error = store.take(&token).expect_err("boundary token is expired");

        assert_eq!(error.kind, AppErrorKind::PreviewExpired);
    }

    #[test]
    fn tampered_token_does_not_consume_the_valid_plan() {
        let store = WritePlanStore::new(Arc::new(TestClock::new(1_000)));
        let (token, _) = store.create(Vec::new());
        let tampered = WritePlanToken("tampered-token".to_owned());

        let error = store
            .take(&tampered)
            .expect_err("tampered token is rejected");
        assert_eq!(error.kind, AppErrorKind::PreviewInvalid);
        store.take(&token).expect("valid token remains available");
    }

    #[test]
    fn clear_invalidates_all_write_plans() {
        let store = WritePlanStore::new(Arc::new(TestClock::new(1_000)));
        let (token, _) = store.create(Vec::new());

        store.clear();
        let error = store.take(&token).expect_err("cleared token is invalid");

        assert_eq!(error.kind, AppErrorKind::PreviewInvalid);
    }
}
