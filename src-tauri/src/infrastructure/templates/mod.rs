use std::{collections::BTreeMap, path::PathBuf, sync::Arc};

use walkdir::WalkDir;

use crate::{
    domain::{
        agents::{validate_agent_draft, validate_logical_name},
        ports::Clock,
        templates::{TemplatePackage, TemplateSummary},
    },
    error::{AppError, AppErrorKind},
    infrastructure::{
        database::Database,
        filesystem::{hash_bytes, write_atomic},
    },
};

const BUILTIN_TEMPLATES: [&str; 6] = [
    include_str!("../../../resources/templates/requirements-clarifier.json"),
    include_str!("../../../resources/templates/architecture-mapper.json"),
    include_str!("../../../resources/templates/docs-researcher.json"),
    include_str!("../../../resources/templates/root-cause-debugger.json"),
    include_str!("../../../resources/templates/code-reviewer.json"),
    include_str!("../../../resources/templates/delivery-verifier.json"),
];

pub struct TemplateRepository {
    templates: parking_lot::RwLock<BTreeMap<String, TemplatePackage>>,
    personal_root: PathBuf,
    database: Arc<Database>,
    clock: Arc<dyn Clock>,
}

impl TemplateRepository {
    pub fn load(
        personal_root: PathBuf,
        database: Arc<Database>,
        clock: Arc<dyn Clock>,
    ) -> Result<Self, AppError> {
        let mut templates = BTreeMap::new();
        for document in BUILTIN_TEMPLATES {
            let package = parse_template(document.as_bytes(), "内置模板")?;
            index_template(&database, clock.as_ref(), &package, document.as_bytes())?;
            templates.insert(package.manifest.id.clone(), package);
        }

        if personal_root.exists() {
            for entry in WalkDir::new(&personal_root)
                .min_depth(1)
                .max_depth(3)
                .follow_links(false)
            {
                let entry = entry.map_err(|source| {
                    AppError::new(AppErrorKind::Internal, "扫描个人模板目录失败。")
                        .with_source(source)
                })?;
                if !entry.file_type().is_file()
                    || entry.path().extension().and_then(|value| value.to_str()) != Some("json")
                {
                    continue;
                }
                let bytes = std::fs::read(entry.path()).map_err(|source| {
                    AppError::new(AppErrorKind::PermissionDenied, "读取个人模板失败。")
                        .with_source(source)
                })?;
                let package = parse_template(&bytes, "个人模板")?;
                index_template(&database, clock.as_ref(), &package, &bytes)?;
                templates.insert(package.manifest.id.clone(), package);
            }
        }

        Ok(Self {
            templates: parking_lot::RwLock::new(templates),
            personal_root,
            database,
            clock,
        })
    }

    pub fn list(&self) -> Vec<TemplateSummary> {
        self.templates
            .read()
            .values()
            .map(TemplateSummary::from)
            .collect()
    }

    pub fn get(&self, id: &str) -> Result<TemplatePackage, AppError> {
        self.templates
            .read()
            .get(id)
            .cloned()
            .ok_or_else(|| AppError::new(AppErrorKind::NotFound, "找不到指定模板。"))
    }

    pub fn save_personal(&self, package: TemplatePackage) -> Result<TemplateSummary, AppError> {
        validate_template(&package)?;
        if package.manifest.source != "personal" {
            return Err(AppError::new(
                AppErrorKind::Validation,
                "个人模板的 source 必须为 `personal`。",
            ));
        }
        let directory = self.personal_root.join(&package.manifest.id);
        let path = directory.join(format!("{}.json", package.manifest.version));
        let bytes = serde_json::to_vec_pretty(&package).map_err(|source| {
            AppError::new(AppErrorKind::Internal, "序列化个人模板失败。").with_source(source)
        })?;
        write_atomic(&path, &bytes)?;
        index_template(&self.database, self.clock.as_ref(), &package, &bytes)?;
        let summary = TemplateSummary::from(&package);
        self.templates
            .write()
            .insert(package.manifest.id.clone(), package);
        Ok(summary)
    }
}

fn parse_template(bytes: &[u8], source_label: &str) -> Result<TemplatePackage, AppError> {
    let package: TemplatePackage = serde_json::from_slice(bytes).map_err(|source| {
        AppError::new(
            AppErrorKind::Validation,
            format!("{source_label} JSON 不符合模板契约。"),
        )
        .with_source(source)
    })?;
    validate_template(&package)?;
    Ok(package)
}

fn validate_template(package: &TemplatePackage) -> Result<(), AppError> {
    validate_logical_name(&package.manifest.id)
        .map_err(|issue| AppError::validation(vec![issue]))?;
    validate_logical_name(&package.logical_name)
        .map_err(|issue| AppError::validation(vec![issue]))?;
    if package.manifest.version.trim().is_empty()
        || package.manifest.name.trim().is_empty()
        || package.manifest.description.trim().is_empty()
        || package.manifest.supported_platforms.is_empty()
    {
        return Err(AppError::new(
            AppErrorKind::Validation,
            "模板 manifest 缺少必填信息。",
        ));
    }
    let draft_issues = validate_agent_draft(&package.to_draft());
    if !draft_issues.is_empty() {
        return Err(AppError::validation(draft_issues));
    }
    for platform in &package.manifest.supported_platforms {
        if !package.platform_overrides.contains_key(platform) {
            return Err(AppError::new(
                AppErrorKind::Validation,
                format!("模板缺少 {} 平台覆盖。", platform.as_str()),
            ));
        }
    }
    Ok(())
}

fn index_template(
    database: &Database,
    clock: &dyn Clock,
    package: &TemplatePackage,
    bytes: &[u8],
) -> Result<(), AppError> {
    database.index_template(
        &package.manifest.id,
        &package.manifest.version,
        &package.manifest.source,
        &package.manifest.name,
        &hash_bytes(bytes),
        clock.now_ms(),
    )
}
