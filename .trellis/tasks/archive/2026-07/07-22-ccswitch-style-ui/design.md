# Design — CC-Switch 风格 UI 重绘

视觉量化基线与截图分析见 `research/cc-switch-style.md`；需求与决策见 `prd.md`。本文只写技术结构。

## 1. 边界

- **纯前端为主**：IPC 契约（`src/contracts/index.ts`、`src-tauri/src/dto/`、`tests/fixtures/`）零改动，这是硬边界，验收时以 git diff 断言。
- **唯一后端改动**：新增第 7 个内置模板资源文件 + 注册（R5），属数据级，不触 DTO/服务签名。
- TanStack Query/hooks 层（`useInventory`、`useTemplates`、`useTemplate`、`useImportAgent` 等）与 `AgentWorkflow` 状态机（`editorState.ts`）不改语义。

## 2. App 视图状态机（src/app/App.tsx）

```ts
type AppView =
  | { view: "home" }
  | { view: "create"; importedDraft: AgentDraft | null } // null = 从「+」进入（胶囊模式）
  | { view: "settings" };
```

- 侧栏删除；`navigation` 数组、`active` state 删除。
- 顶栏（约 h-16）：`pl-20` 避让红绿灯 → BrandMark + 应用名 → 弹性空白（拖拽叶面）→ `SegmentedControl`（三平台）→ 图标组（刷新 / 主题切换 / 设置齿轮）→ 紫蓝圆形「+」。
- **拖拽区铁律**（commit a20b7d4 教训）：`data-tauri-drag-region` 只贴在无交互子元素的叶面上——顶部 h-7 细条（现有）+ 顶栏内的品牌行与弹性空白段。分段控件、按钮一律不在拖拽面内。
- 平台选中态：`usePersistedPlatform()`（新 hook，`localStorage` key `diy-subagent.platform`，初始值 `codex`）。放 `src/features/agents/hooks/`。平台状态属 App 层，向 home 传参。

## 3. 首页（HomePage，替代 InstalledPage）

- 文件：`src/features/agents/components/HomePage.tsx`（由 `InstalledPage.tsx` 重构改名；`onImported` 回调改为进入 create 视图）。
- 数据流：`useInventory()` → `scan.groups.flatMap(g => g.sources).filter(s => s.platform === selected)`；每个 source 渲染一张卡。跨平台 logicalName 分组与 `hasConflict` 徽标不再在首页表达（安装流程内的冲突处理不变；查看文件/编辑路径仍可见全部信息）。
- 卡片解剖（对照 research 表）：monogram 瓷砖（logicalName 首字符大写，`--surface` 底 + 描边 + 圆角 14px）→ 名称（`text-lg` 粗体、mono）+ `Pill`（parseStatus/ownership）→ 等宽路径副行 → 描述行（可选）→ 右侧操作组：查看文件（`NativeContentDialog` 保留）/ Finder / 导入并编辑。
- 空状态三态（复用 `platformInstallStatuses`，按当前平台取值）：
  - `!platformDetected` → 「未检测到 {platformLabel}」；
  - `platformDetected && !hasSources` → 「已安装 {platformLabel}，暂无 subagent」+ 引导语「点右上角 + 从模板开始」；
  - 有 sources → 卡片列表。
  - 空状态保留品牌线稿插画（`BrandGlyph`，紫蓝）。
- 刷新按钮移入顶栏图标组（`inventory.refetch`——通过 App 传递或把 refetch 挂在 query invalidation 上，实现取 `queryClient.invalidateQueries(queryKeys.inventory)` 即可，避免 prop 钻孔）。

## 4. 新建页（CreatePage，替代 TemplatesPage + TemplateLibrary）

- 文件：`src/features/agents/components/CreatePage.tsx`（`TemplatesPage.tsx` 重构改名，`features/templates/components/TemplateLibrary.tsx` 删除；个人模板保存 hooks 留在 `features/templates`）。
- 结构：页头（圆角方块返回按钮 + 「新建 Subagent」/ 导入时「编辑 {logicalName}」）→ `AgentWorkflow`。
- 胶囊组实现：`AgentWorkflow` 增加可选 prop `presetPicker?: ReactNode`，仅在 `status === "editing"` 时渲染于 `StructuredEditor` 上方（预览/完成步骤自动消失）。胶囊选中状态与模板加载在 CreatePage：
  - `useTemplates()` 列表 → 胶囊组 = 列表顺序，「自定义」（`custom-blank`）由后端列表自然返回并排序在首位（见 §6）；
  - 选中 id → `useTemplate(id)` → `createDraftFromTemplate` → `<AgentWorkflow key={selectedId} initialDraft={draft} …>`，key 换 = 编辑器 remount 重置，无脏确认（对齐 CC-Switch 行为）；
  - 提示行：`💡 {selected.description}`（数据来自 TemplateSummary，无需加载完整包）；
  - `importedDraft !== null` 时不渲染胶囊组（`presetPicker` 不传）。
- 视觉：胶囊 rounded-full、选中实色（系统蓝底白字）；表单区标签在上、输入框 rounded-xl；粘性底部操作对（取消=返回 / 继续→预览）。`StructuredEditor` 内部分区由「Card+图标+描述三件套」改为「小节标题 + 发丝线」的宽松表单节。

## 5. 预览 / 完成 / 设置

- `PreviewReview`、`InstallSuccess`：流程与数据不变；容器换为大圆角卡 + 新按钮层级；diff/代码块底色跟随主题（既有约定）。
- `SettingsPage`：包一层返回箭头页头（App 的 settings 视图负责返回 home）；目录行改卡片式行（瓷砖 + Pill + 操作按钮），`availabilityLabel` 文案不动。

## 6. 后端：自定义空白模板

- 新文件 `src-tauri/resources/templates/custom-blank.json`：manifest id `custom-blank`、name「自定义」、description「从空白开始定制一个 subagent」、supportedPlatforms 三平台、risk low；`logicalName` 给占位（如 `my-agent`）、指令小节给最小可编辑骨架（空串若过不了模板解析校验，则用单句占位——以 `cargo test` 实际约束为准）。
- 注册：`BUILTIN_TEMPLATES` 数组加一行（`src-tauri/src/infrastructure/templates/mod.rs:18`），**排在首位**使前端胶囊组自然以「自定义」开头（若列表顺序由其他逻辑决定，则前端按 id 置顶，二选一，以代码实际为准）。
- 测试：`all_six_n_templates_render_deterministically_for_every_platform` 等按第 7 个模板扩展；模板数量断言若存在需同步。

## 7. Token 与原语（src/styles/globals.css、components/ui）

- token 变更：`--shadow-card` 升级为多层软阴影（light/dark 各配）；新增 `--shadow-card-hover`；背景/表面/文字/语义色沿用现值（D3：不引入橙色）。
- 圆角约定（类名直接用 Tailwind，不新增 token）：卡 `rounded-2xl`(16px)、输入/按钮 `rounded-xl`(12px)、瓷砖 `rounded-[14px]`、胶囊 `rounded-full`。
- 新原语：
  - `Pill.tsx`：`tone: success|warning|danger|accent|neutral`，软底色 + 深色字 + rounded-full，替换全部 5 处 `StatusDot` 用点后删除 `StatusDot.tsx`；
  - `SegmentedControl.tsx`：Radix 无对应原语，用 `role="tablist"` + roving focus 或简化为按钮组 + `aria-pressed`（取简单方案：按钮组，选中段白底阴影浮起）；
  - `Button.tsx`：加 `size="iconRound"`（圆形、约 40px）与 `variant="brand"`（紫蓝实底）供「+」使用。

## 8. 兼容与回滚

- 功能语义零变化：安装两阶段、导入 expectedRevision、个人模板保存、inventory watcher 事件、设置目录选择/恢复全部原样。
- 用户可见的行为变化仅两条：首页含义变化（模板库 → 已安装）、模板浏览入口移至「+」内——均为本次需求本身。
- 回滚：整任务单分支单提交序列，`git revert` 干净回退；无迁移、无持久化 schema 变化（localStorage key 残留无害）。

## 9. 测试策略

- 单测（vitest/jsdom）：胶囊点选→表单填充（mock appIpc 两模板）、首页平台过滤+三态空状态、Pill/SegmentedControl 渲染、既有三个组件测试锚点更新。
- e2e（无 IPC）：新外壳断言（品牌名、tablist/按钮组、「+」、设置齿轮可见）；导航到设置子页并返回。
- Rust：模板注册/解析/确定性渲染扩展至 7 模板。
- 手动（`pnpm tauri:dev`）：AC1 拖拽三查（拖动/双击/红绿灯）、AC4 Codex 全流程落盘、AC5 双主题六屏走查。
