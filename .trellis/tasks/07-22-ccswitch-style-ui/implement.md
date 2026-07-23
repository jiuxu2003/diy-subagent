# Implement — CC-Switch 风格 UI 重绘

按序执行；每阶段结束跑该阶段验证命令，全部完成后跑完整门禁。上下文顺序：`implement.jsonl` → `prd.md` → `design.md` → 本文件。

## 阶段 0：基线

- [ ] 从 main 拉工作分支（建议 `feat/ccswitch-ui`）。
- [ ] 记录契约零改动断言基线：`git diff --stat main -- src/contracts src-tauri/src/dto tests/fixtures` 应始终为空。

## 阶段 1：后端空白模板（先行，前端胶囊依赖它）

- [ ] 新增 `src-tauri/resources/templates/custom-blank.json`（design §6；字段约束以模板解析器实际校验为准）。
- [ ] `BUILTIN_TEMPLATES`（`src-tauri/src/infrastructure/templates/mod.rs:18`）注册并置首位；同步模板数量/确定性渲染相关测试。
- [ ] 验证：`cd src-tauri && cargo fmt --all -- --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features`。

## 阶段 2：token 与原语

- [ ] `globals.css`：升级 `--shadow-card`、新增 `--shadow-card-hover`（light/dark）。
- [ ] 新增 `components/ui/Pill.tsx`、`components/ui/SegmentedControl.tsx`；`Button.tsx` 加 `iconRound` 尺寸与 `brand` 变体；各带单测。
- [ ] 验证：`pnpm vitest run src/components`（新原语测试绿）。

## 阶段 3：外壳与视图状态机

- [ ] `App.tsx`：删侧栏，建顶栏 + `AppView` 状态机（design §2）；拖拽区仅纯叶面（顶条 + 品牌行 + 弹性空白），交互元素全部在拖拽面外。
- [ ] 新增 `usePersistedPlatform`（localStorage `diy-subagent.platform`，默认 `codex`）。
- [ ] 刷新按钮入顶栏图标组（`invalidateQueries(queryKeys.inventory)`）；主题切换钮迁入顶栏。
- [ ] 验证：`pnpm dev` 手查拖拽/双击/红绿灯；`pnpm typecheck`。

## 阶段 4：首页

- [ ] `InstalledPage.tsx` → `HomePage.tsx`：按平台过滤展平卡片、monogram 瓷砖、Pill 状态、右侧操作组、三态空状态（design §3）；`NativeContentDialog` 样式微调保留。
- [ ] 单测：平台过滤、三态空状态、导入回调进入 create 视图。

## 阶段 5：新建流程

- [ ] `TemplatesPage.tsx` → `CreatePage.tsx`：返回箭头页头、胶囊组（选中态、描述提示行、`key` remount 重置）、导入模式隐藏胶囊（design §4）。
- [ ] `AgentWorkflow.tsx` 加 `presetPicker?: ReactNode`（仅 editing 渲染）。
- [ ] `StructuredEditor.tsx` 视觉重排：小节标题+发丝线表单节、rounded-xl 输入、粘性底部操作对；既有测试锚点（checkbox「Codex」、textbox「模板名称」、按钮「保存个人模板」）保持或同步。
- [ ] 删除 `TemplateLibrary.tsx`；`features/templates` 仅保留 hooks。
- [ ] 单测：胶囊点选填充、导入模式无胶囊。

## 阶段 6：预览 / 完成 / 设置

- [ ] `PreviewReview.tsx`、`InstallSuccess.tsx` 换新容器与按钮层级（流程零变化）。
- [ ] `SettingsPage.tsx` 套返回箭头子页、卡片式目录行（文案不动）。

## 阶段 7：清理与全量门禁

- [ ] 全局替换后删除 `StatusDot.tsx`；grep 断言 `StatusDot|TemplateLibrary` 在 `src/` 零引用。
- [ ] 重写 `tests/e2e/app-shell.spec.ts`（新外壳断言 + 设置子页往返）。
- [ ] 契约零改动断言（阶段 0 命令输出为空）。
- [ ] 全量验证：
  - `pnpm lint && pnpm typecheck && pnpm test`
  - `pnpm test:e2e`
  - `cd src-tauri && cargo fmt --all -- --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features`
- [ ] 手动走查（`pnpm tauri:dev`）：AC1 拖拽三查；AC2 平台切换/记忆/空状态；AC3 卡片三操作；AC4 Codex 全流程落盘；AC5 双主题六屏。

## 风险点与回滚

- **最高风险：App.tsx 拖拽区**——历史上交互元素被拖拽区吞点击（a20b7d4）；任何顶栏改动后必须手动复查所有按钮可点。
- **次风险：StructuredEditor.tsx**（最大组件）——只动布局层，不碰 `onDraftChange` 数据流；改前后跑其单测。
- **模板解析约束未知**：custom-blank.json 若被解析器拒绝（空字段校验），以最小占位文本满足约束，禁止放松后端校验。
- 回滚点：每阶段一提交，出问题 revert 到上一阶段；契约与 Rust 服务零改动保证回滚无残留。
