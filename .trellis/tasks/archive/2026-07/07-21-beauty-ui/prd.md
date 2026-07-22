# UI 视觉重构与细节修复

## Goal

让 DIY Subagent 从「AI 生成感 Demo」变成成熟的 macOS 生产力工具：

1. 修复 App 图标四角不透明白色导致的「白色方块」观感（R1）。
2. 「如何调用」等复制操作给出明确的复制成功反馈（R2）。
3. 按已对齐的「macOS 原生工具风 + 系统蓝」方向重构全部界面，移除 AI 味视觉与文案模式（R3/R4）。

## Confirmed Facts（代码证据）

### 图标（R1）

- `src-tauri/icons/icon.png` 为 512×512、带 alpha 通道，但四角像素为不透明白 `(255,255,255,255)`（sips + PIL 实测）；`icon.icns` 同源同问题。图形本体是全出血深色圆角矩形，白色填满圆角外侧；macOS 规范要求图形约占画布 80%、四周透明留白。
- `src-tauri/tauri.conf.json:33-39` bundle.icon 引用 32/128/128@2x/icns/ico；`@tauri-apps/cli`（已装）支持 `pnpm tauri icon <1024源图>` 一键重生成全套。

### 复制反馈（R2）

- `src/features/agents/components/InstallSuccess.tsx:102-122` `CopyableLine` 仅调用 `navigator.clipboard.writeText(value)`，成功/失败均无 UI 反馈；package.json 无 toast 类依赖。

### AI 味清单（R3/R4 逐项核销依据）

- `src/app/App.tsx:33` 窗口内假窗口（`m-3 rounded-[28px]` + 大阴影）；`:42` "macOS local studio"；`:71-75` 「原生文件优先」信任卡。
- `src/features/templates/components/TemplateLibrary.tsx:19-22` Sparkles 眉标；`:23-33` 4xl 营销标题与段落；`:35-44` 「离线且确定性 / 不调用 LLM，不启动 Agent CLI」信任卡；`:53-70` 序号方块 + 风险胶囊 + 平台胶囊堆叠。
- `src/features/agents/components/InstalledPage.tsx:67-69` 眉标「磁盘事实来源」；`:73-75` 规格语言段落。
- `src/features/settings/components/SettingsPage.tsx:45-47` 眉标「路径与安全边界」；`:51-54` 解析链术语段落；`:142-151` WritePlan 术语警告卡。
- `src/features/agents/components/StructuredEditor.tsx:96-105` 「定制共享工作契约」；`:378-407` EditorSection = Card+图标方块+标题+描述三件套；`:357-373` 粘性 footer「单次 token」。
- `src/features/agents/components/PreviewReview.tsx:71-77` 「审阅精确原生写入计划」+ token 文案；`:236-243` 「可补偿批次…逐文件重读验证」；`:256-263` StatusLine 瓷砖嵌套 Card。
- `src/features/agents/components/InstallSuccess.tsx:23-37` 巨型成功横幅 + operation ID 展示；嵌套 Card 网格。
- 全局：`src/styles/globals.css:86-97` body 双 radial 渐变；`:6-8` 字体栈 Inter 首位；rounded-xl/2xl/3xl 混用；`components/ui/Badge.tsx` 胶囊泛滥。

### 技术栈与约束

- 样式栈：Tailwind 4（Vite 插件）+ CSS 变量 token（`globals.css` `:root`/`.dark`）+ Radix + CVA；原语 `components/ui/{Button,Card,Badge,FormField}`。
- 主题：`ThemeProvider` 按系统偏好初始化 + 手动切换（行为保持不变）。
- 窗口：标准标题栏，1440×900 默认 / 1120×720 最小；改 Overlay 只涉及 tauri.conf + 前端拖拽区。
- 测试锚点（不得改动或需同步更新）：e2e「DIY Subagent」/ nav「主导航」/ 按钮 模板·已安装·设置；单测 checkbox「Codex」、textbox「模板名称」、按钮「保存个人模板」「在 Finder 中显示恢复目录」。
- Playwright 无 Rust 后端只测非 IPC UI；本任务不改 IPC 负载，契约测试零接触。

## Requirements

- **R1 图标修复**：产出四角透明、图形约占 80% 的 1024 源图（仓库根 `app-icon.png`），`pnpm tauri icon` 重生成全套，Dock/访达无白色方块。
- **R2 复制反馈**：`CopyableLine` 复制成功即时显示「已复制」（约 2s 复位），失败有「复制失败」提示，带 `role="status"`；无新增重型依赖；补组件单测。
- **R3 视觉重构**（方向已定：macOS 原生工具风，2026-07-21 确认；强调色 macOS 系统蓝 `#007AFF`/`#0A84FF`，同日确认）：
  - 窗口即应用：删假窗口与 body 渐变；`titleBarStyle: "Overlay"` + `hiddenTitle`，红绿灯融入通栏侧栏，`data-tauri-drag-region` 拖拽区。
  - 排版：系统字体栈（去 Inter），Tailwind `@theme` 重定义 type scale 至 13px 基准；数据用等宽字体。
  - 结构:发丝线列表/分组表单取代卡片套卡片；圆角收敛 6–12px；中性灰双主题 + 系统蓝单强调色；Badge/Card 原语删除，状态改 StatusDot。
  - 覆盖六屏：模板库 / 结构化编辑 / 预览审阅 / 安装成功 / 已安装 / 设置。
- **R4 文案去术语化**：内部规格术语与营销眉标全部移除或改写（逐条见 design.md D5b 表）；功能语义不变；保留 07-20 任务的平台空状态文案语义。

## Acceptance Criteria

- [ ] 重生成的 `icon.png` 四角 alpha=0（脚本断言）；`pnpm tauri:build` 产物在 Dock 无白色方块。
- [ ] 点击「如何调用」条目后立即可见「已复制」，约 2s 复位；剪贴板内容正确；新单测通过。
- [ ] 六屏无嵌套 Card、无营销眉标/信任卡、无内部术语（按 AI 味清单与 D5b 表逐项核销，grep 验证旧文案清零）。
- [ ] `Badge.tsx`/`Card.tsx` 已删除且 `src/` 零引用（grep 断言）。
- [ ] 交互流程与功能不变：模板 → 编辑 → 预览 → 安装；已安装页导入/Finder/查看文件、设置页选择/恢复目录均正常。
- [ ] light/dark 双主题在新设计下完整可用（手动走查六屏）。
- [ ] Overlay 窗口手动验证：可拖拽、双击顶条缩放、红绿灯不压内容。
- [ ] `pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e` 全绿（保留 e2e 主导航语义）。

## Out of Scope

- 平台聚焦方向修正（用户决策已记录：核心功能已在 Codex 实测可用，后续任务将先集中 Codex 再适配其他平台；**本任务不做任何相关工作与代码实现**）。
- Rust 后端逻辑、IPC 契约、DTO/zod schema、SQLite、事务/写入流程一律不动（`tauri.conf.json` 窗口配置除外）。
- 不新增功能、不改工作流步骤与数据语义；不做窗口透明/vibrancy。
