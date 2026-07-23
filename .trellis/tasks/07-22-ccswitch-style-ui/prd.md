# CC-Switch 风格 UI 重绘

## Goal

把 DIY Subagent 的 UI 从「macOS 发丝线原生风」（07-21-beauty-ui 产物）整体切换到 CC-Switch（farion1231/cc-switch）的风格：去侧栏、顶栏驱动、单列大圆角卡片、宽松呼吸感。不只是换皮——信息架构一并对齐：首页从「模板库」变为「当前平台的已安装 agent 列表」，模板并入新建流程。

## Background

- CC-Switch 风格解剖与量化基线见 `research/cc-switch-style.md`（截图实测）；其技术栈与本项目同源（Tauri 2 + React + Tailwind + TanStack Query），视觉语言可直接平移。
- 两应用 IA 天然同构：CC-Switch「应用切换 → 供应商卡片 → +新增/⚙设置」↔ 本项目「平台切换 → agent 卡片 → +新建/⚙设置」；其「预设供应商胶囊」对应本项目「模板选择」。
- 品味基线修订：07-21 反对的是嵌套卡片、营销眉标、内部术语；CC-Switch 卡片是扁平数据行、零术语，不构成回退。「内部术语（WritePlan/token/可补偿批次等）不进 UI」结论继续生效。
- 平台方向约束：Codex 优先打磨，不删除、不降级其他平台代码（memory: diy-subagent-direction）。
- 依赖复用：07-20-platform-root-detection 已落地 `platformDetected`（根目录判定，`src/features/agents/lib/platformStatus.ts`）与平台空状态文案，本次直接复用其数据与文案语义，仅重排视觉。

## Decisions

- **D1 改版范围 = 整体采用（2026-07-22 用户确认）**：去侧栏；顶栏 = 品牌名 + 平台分段切换器（Claude Code/Codex/Cursor）+ 主题切换 + 齿轮设置 + 紫蓝圆形「+」；首页 = 当前平台已安装 agent 卡片列表；模板选择并入「+」新建流程；设置改为返回箭头式子页。
- **D2 新建流程 = 单页胶囊预设（2026-07-22 用户确认）**：「+」直达新建页，顶部「预设模板」胶囊组（自定义 + 内置 + 个人模板），点选胶囊即以该模板重置下方结构化表单，选中模板描述显示在胶囊组下方提示行；后续仍为 预览安装页 → 完成页。独立模板库页删除。
- **D3 强调色 = 系统蓝 + 紫蓝「+」（2026-07-22 用户确认）**：功能主色维持系统蓝 #007AFF/#0A84FF；「+」圆钮与品牌标识用 `--brand` 紫蓝 #6c74f6；不引入 CC-Switch 的橙色。
- **D4 平台切换器行为（依据 memory「Codex 优先」推定，终审可否决）**：三平台常驻不隐藏；首次启动默认选中 Codex，之后记住上次选择（webview localStorage，不新增 IPC）；未检测平台可切入，显示「未检测到 <平台>」，检测到但无 agent 显示「已安装 <平台>，暂无 subagent」（沿用 07-20 文案）。
- **D5 交付方式 = 单任务一次交付（2026-07-22 用户确认）**：六屏（外壳/首页/新建/预览/完成/设置）一个任务内完成，实施清单内部分阶段，一次提交验收。上一轮 beauty-ui 同规模单任务有先例。

## Requirements

### R1 外壳与首页

- `src/app/App.tsx` 去侧栏，改为顶栏布局；视图状态机：`home` / `create`（携初始草稿与来源）/ `settings`。
- Overlay 标题栏保留；拖拽区必须沿用「纯叶面、无交互子元素」原则（回归风险见 commit a20b7d4），顶栏交互元素之间的空白与顶部细条作拖拽叶面；品牌区避让红绿灯。
- 首页渲染当前平台的 agent 卡片（数据仍来自 `useInventory` + `useInventoryEvents`，按 `source.platform` 过滤展平，不再按 logicalName 分组展示）：monogram 图标瓷砖、粗体名称、等宽路径副行、状态胶囊（可导入/只读/解析失败/已导入）、右侧操作（查看文件 / Finder / 导入并编辑，行为不变）。
- 平台分段切换器与空状态按 D4；「刷新」入口保留（顶栏图标组）。

### R2 新建流程（单页胶囊 + 预览 + 完成）

- 「+」→ 新建页（返回箭头模式）：预设胶囊组数据来自 `useTemplates`，首位固定「自定义」（见 R5），进入页面默认选中「自定义」；点选胶囊 → `useTemplate(id)` → `createDraftFromTemplate` 重置编辑器（remount，不做脏数据确认）。
- 「导入并编辑」进入同一编辑页但隐藏胶囊组，防止一键覆盖导入内容；导入路径行为与 `expectedRevision` 语义不变。
- 编辑表单、预览审阅、安装完成三屏按新视觉语言重绘；两阶段 preview/commit 流程、`AgentWorkflow` 状态机、保存个人模板行为全部不变。
- 胶囊不区分内置/个人模板来源（TemplateSummary 无 source 字段，不为装饰性需求扩契约）。

### R3 视觉语言 token

- `src/styles/globals.css`：圆角体系（卡 16px / 输入 12px / 胶囊 full）、多层软阴影 token、间距放宽；字体仍系统栈 14px 基准、标题层级放大；等宽仍 IBM Plex Mono；浅/深双主题全覆盖。
- 新增 `Pill`（软底色状态胶囊）与 `SegmentedControl` 原语，`StatusDot` 全部替换后删除；`Button` 增加圆形 icon 尺寸支持「+」。

### R4 设置子页

- 齿轮进入、返回箭头返回；平台目录状态/选择目录/恢复默认与 `availabilityLabel` 文案语义（区分「未检测到该平台」与「agents 目录未创建」）不变，仅视觉重排为卡片风。

### R5 自定义空白模板（数据级后端改动，无契约变更）

- `src-tauri/resources/templates/` 新增空白模板 JSON（id 形如 `custom-blank`，name「自定义」），注册进 `src-tauri/src/infrastructure/templates/mod.rs:18` 的 `BUILTIN_TEMPLATES`；provenance 走既有 `builtinTemplate`，DTO/zod/fixtures 零改动。
- 相关 Rust 模板测试（含全平台确定性渲染测试）同步覆盖第 7 个模板。

### R6 测试与锚点更新

- `tests/e2e/app-shell.spec.ts` 重写：断言新外壳（品牌名、平台分段切换器、「+」、设置入口）。
- 受影响单测同步（`StructuredEditor.test` / `PreviewReview.test` / `InstallSuccess.test`）；新增：模板胶囊点选填充、首页平台过滤与空状态。
- 删除 `TemplateLibrary.tsx` 及模板库页面入口；`TemplatesPage.tsx` 职责重构为新建页容器。

## Acceptance Criteria

- [ ] AC1 外壳：无侧栏；顶栏含品牌名、三平台分段切换器、主题切换、设置齿轮、紫蓝圆形「+」；窗口可拖拽、双击顶条缩放、红绿灯不压内容（手动验证）。
- [ ] AC2 首页：首启默认选中 Codex；切换平台各自渲染卡片；未检测平台显示「未检测到 <平台>」；已检测无 agent 显示「已安装 <平台>，暂无 subagent」；重启后记住上次选中平台；inventory 事件仍实时刷新。
- [ ] AC3 卡片操作：查看文件 / Finder / 导入并编辑全部可用；导入进入编辑页且无预设胶囊组。
- [ ] AC4 新建：「+」进入单页，胶囊组 =「自定义」+ 6 内置 + 个人模板；点选胶囊表单被该模板填充、提示行显示其描述；自定义为默认选中；编辑 → 预览 → 安装成功全流程走通（Codex 目录实测落盘）。
- [ ] AC5 视觉：六屏统一新语言，浅/深双主题手动走查通过；旧内部术语 grep 仍为零。
- [ ] AC6 质量门：`pnpm lint` / `pnpm typecheck` / `pnpm test` / `pnpm test:e2e` 全绿；`cargo fmt --check` / `clippy -D warnings` / `cargo test` 全绿；`src/contracts/`、`src-tauri/src/dto/`、`tests/fixtures/` 无 diff（契约零改动断言）。
- [ ] AC7 清理：`StatusDot.tsx`、`TemplateLibrary.tsx` 已删除且 `src/` 零引用。

## Out of Scope

- 拖拽排序（agent 列表无排序语义）、用量/费用统计卡（无数据源）。
- IPC 契约 / DTO / zod / fixtures 变更；TemplateSummary 增加 source 字段。
- 窗口尺寸、透明/vibrancy 效果调整；平台聚焦相关的功能性工作。
- prompts/ 与 docs/ 目录不写入。

## Open Questions

- 无阻塞项。D4 为推定决策，终审时可否决。
