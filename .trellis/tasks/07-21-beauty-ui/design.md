# Design — UI 视觉重构与细节修复

方向（已对齐）：**macOS 原生工具风**，强调色 **macOS 系统蓝**。参照 TablePlus / Things 3 / CleanShot X 的精密原生感：窗口即应用、系统字体、发丝线结构、等宽数据、克制用色。

## D1 图标管线（R1）

现状：`src-tauri/icons/icon.png`（512×512）图形为全出血深色圆角矩形，圆角外侧填充不透明白色 `(255,255,255,255)`。

管线（保留现有图形，只修画布）：

1. 用 PIL 一次性处理（命令内联在 implement.md，不落库脚本）：
   - 从四角 flood-fill 清除白色（容差约 12），alpha 边缘再收 1px 消除白色描边残留（fringe）。
   - 将图形以 LANCZOS 缩放到 **约 820px**，居中贴到 1024×1024 全透明画布（图形约占 80%，符合 macOS 图标留白规范）。
   - 输出仓库根 `app-icon.png`（tauri icon 默认输入名，作为图标唯一源，入库）。
2. `pnpm tauri icon app-icon.png` 重生成 `src-tauri/icons/` 全套（png/icns/ico/Square*）。
3. 校验：PIL 探针断言重生成的 `icon.png` 四角 alpha=0 且圆弧边缘无白色像素带；`pnpm tauri:build` 后 Dock/访达目检。

## D2 复制反馈（R2）

`InstallSuccess.tsx` 的 `CopyableLine` 改为有状态组件：

- 状态机 `idle → copied | failed → (2s) → idle`；`await navigator.clipboard.writeText()` 成功进 `copied`，reject 进 `failed`；定时器在卸载与重复点击时清理。
- 视觉：右侧 `Copy` 图标切换为 `Check`（success 色）+「已复制」；失败显示「复制失败」（danger 色）。文本容器带 `role="status"`（aria-live）供读屏。
- 不引入 toast 依赖；状态完全组件内局部（符合 state-management 规范的 ephemeral UI state）。
- 新增单测：user-event 点击 → 断言「已复制」出现且剪贴板内容正确（user-event 自带 clipboard mock）。

## D3 设计 token 重构（globals.css）

**字体**：
- `--font-sans`: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", "PingFang SC", sans-serif`（移除 Inter）。
- `--font-mono` 保持 SF Mono 优先；路径 / 逻辑名 / diff / operation id 一律等宽。

**字号密度**（Tailwind 4 `@theme` 重定义 type scale，全站一次性收紧，不逐类名改）：

| token | 值 | 用途 |
|---|---|---|
| `--text-xs` | 11px/16 | 辅助说明、状态 |
| `--text-sm` | 13px/20 | 正文基准 |
| `--text-base` | 13px/20 | 与 sm 对齐 |
| `--text-lg` | 15px/22 | 组标题 |
| `--text-xl` | 17px/24 | 区域标题 |
| `--text-2xl` | 20px/28 | 页面标题 |
| `--text-3xl` | 24px/32 | 仅成功页兜底 |

**配色**（去蓝调中性灰 + 系统蓝，起始值可在视觉走查中微调但保持 AA 对比）：

| token | light | dark |
|---|---|---|
| `--background` | `#f5f5f7` | `#1e1e20` |
| `--surface` | `#ffffff` | `#28282c` |
| `--sidebar` | `#ececee` | `#242428` |
| `--surface-hover` | `#e8e8ea` | `#323236` |
| `--text` | `#1d1d1f` | `#f5f5f7` |
| `--text-muted` | `#6e6e73` | `#a1a1a6` |
| `--border`（发丝线） | `rgba(0,0,0,0.10)` | `rgba(255,255,255,0.12)` |
| `--accent` | `#007aff` | `#0a84ff` |
| `--accent-strong` | `#0066d6` | `#3395ff` |
| `--accent-soft` | `rgba(0,122,255,0.12)` | `rgba(10,132,255,0.16)` |
| success/warning/danger | macOS 系语义色（文本用途取深阶保证对比） | 同左亮阶 |

**结构**：删除 body 双 radial 渐变；阴影基本归零（结构靠发丝线，仅 Dialog 保留投影）；圆角收敛：控件 `rounded-md`(6px)、分组容器 8px、Dialog 12px；禁用 rounded-2xl/3xl。代码块底色从蓝调 `#111722` 改中性 `#161618`（两主题一致）。不做真 vibrancy/窗口透明（保持确定性，避免 GPU 兼容面）。

## D4 应用外壳（App.tsx + tauri.conf.json）

- `tauri.conf.json` window 增加 `"titleBarStyle": "Overlay"`, `"hiddenTitle": true`。回滚点：删这两行即回到标准标题栏，其余样式无依赖。
- 外壳改全视口 `grid-cols-[220px_1fr]`，删除 `m-3 rounded-[28px]` 假窗口与窗口阴影。
- 拖拽区：全宽固定顶条 `h-7` + 侧栏顶部空白块，均加 `data-tauri-drag-region`；交互元素全部位于其下方（Playwright 纯 web 环境该属性惰性无害）。
- 侧栏：通栏全高；顶部预留 44px 给红绿灯；品牌行仅「DIY Subagent」13px semibold（删 Bot 图标方块与 "macOS local studio"）；导航保持 aria-label「主导航」与 模板/已安装/设置 三按钮（e2e 锚点），13px，选中态 = `--accent-soft` 填充 + accent 文字（Notes/Mail 式）；底部仅保留主题切换（小 ghost 图标按钮），删「原生文件优先」信任卡。
- 主区：`overflow-auto`，内容内边距 24–28px，各页自身 max-width 不变收窄。

## D5 六屏重构（R3）

通用模式：页头 = 20px semibold 标题 + 右侧动作；「眉标 + 大标题 + 段落」三件套全部移除；卡片栅格 → 发丝线分隔的列表行 / 分组表单；Badge 胶囊 → `StatusDot`（色点 + 11px 文字）或纯 muted 文本。

1. **TemplateLibrary**：页头「模板」+ 右侧 muted 数量。模板 = 列表行（名称 13px semibold + 风险状态点 + 描述 muted + 平台纯文本「Claude · Codex」+ 右侧「定制」小按钮），整行可点。删 Sparkles 眉标、4xl 口号、营销段、信任卡、序号方块、hover 位移。
2. **StructuredEditor**：页头 = 返回 ghost 按钮 +「编辑 {logicalName}」（名称等宽）。EditorSection 改平面分组：13px semibold 组标题 + 发丝线，图标方块删除，描述精简为至多一行或删除。字段双列网格保留。平台目标 = 发丝线分组行（checkbox 可访问名保持 platformLabel 原文，单测锚点「Codex」），高级字段在行内展开。「保存为个人模板」保持组形态（「模板名称」「保存个人模板」为单测锚点）。粘性 footer 改平面工具条（上发丝线，无浮卡）：左「已选 N 个平台」，右主按钮。
3. **PreviewReview**：页头「确认安装」+ 一行 muted 说明；有效期卡片 → 行内 muted 文本「预览有效至 HH:MM · 重启后失效」。平台 Tabs 改原生分段控件样式。左栏状态瓷砖 → 定义列表行（label muted / value 常规，双列）。代码面板标题「生成文件」「差异」。底部平面工具条 + 主按钮。「在 Finder 中显示恢复目录」按钮文案不动（单测锚点）。
4. **InstallSuccess**：巨型横幅 → 紧凑页头（小对勾 +「{name} 已安装」20px + muted 等宽小字「操作记录 {operationId}」）。目标 = 列表行（平台名 + 等宽路径 + 状态点文字）。「如何调用」（含 D2）与「验证任务」改上下两个平面分组，删嵌套着色盒。
5. **InstalledPage**：页头「已安装」+「刷新」ghost 按钮。删眉标与规格段落，换一行 muted「读取各平台用户级目录中的 subagent 文件」。分组卡 → 逻辑名分区 + 来源行；解析状态 / 冲突 / 已导入全部转状态点文字；操作按钮保留（「查看文件」「Finder」「导入并编辑」）。**07-20 任务的平台空状态语义（已安装 X 暂无 subagent / 未检测到 X）保留文案，仅重样式为紧凑行**。原生文件 Dialog 圆角 12px、中性配色。
6. **SettingsPage**：页头「设置」+ 一行 muted「subagent 安装到以下目录，可为每个平台自定义」。平台目录 = 分组列表行（平台名 + 状态文字内联，等宽路径次行，右侧「选择目录」「恢复默认」小按钮）；`availabilityLabel` 现有文案保留。WritePlan 警告卡 → 脚注一行「缺失的目录会在安装时自动创建」。

## D5b 文案改写表（R4，逐条核销）

| 位置 | 现文案 | 处理 |
|---|---|---|
| App 侧栏 | macOS local studio / 原生文件优先卡 | 删除 |
| 模板页 | 内置精选模板 / 从一个真正有边界的专家开始 + 段落 / 离线且确定性·不调用 LLM 不启动 Agent CLI | 删除 |
| 模板卡 | 默认只读 / 可执行修复 | 只读 / 可写 |
| 已安装页 | 磁盘事实来源 / 「不会把扫描动作当成接管」段 | 删除，换一行说明 |
| 已安装行 | 可安全导入 / 只读保留 / 已显式导入 / 同平台冲突 / N 个原生来源 / 原生文件 | 可导入 / 只读 / 已导入 / 名称冲突 / N 个平台 / 查看文件 |
| 设置页 | 路径与安全边界 / 解析链段落 / WritePlan 警告卡 | 删除，换一行说明 + 脚注 |
| 设置行 | 用户覆盖 | 自定义 |
| 编辑器 | 定制共享工作契约 / 「产品语义」段 / 各 Section 描述 | 编辑 {name} / 删或减为一行 |
| 编辑器 footer | 「单次 token」句 / 生成三平台原生预览 | 删除 / 生成预览 |
| 编辑器 | 导入首版仅写回原平台（胶囊） | muted 文本「仅可写回来源平台」 |
| 预览页 | 审阅精确原生写入计划 / token 句 / 可补偿批次…重读验证 / 确认整批安装 / 正在备份、写入并验证… / revision | 确认安装 / 「内容修改后需重新生成预览」 / 「写入前自动备份，失败自动回滚」 / 确认安装 / 正在安装… / 版本 |
| 成功页 | 已完成整批安装 / operation ID / 已备份并验证 / 自动委派取决于 description：… | 已安装 / 操作记录（muted 小字） / 已替换（有备份）·已写入 / 改一句自然话 |

**不可动的测试锚点**：「DIY Subagent」「主导航」「模板/已安装/设置」「Codex」（platformLabel）「模板名称」「保存个人模板」「在 Finder 中显示恢复目录」。

## D6 UI 原语

- `Button`：radius 6px；尺寸 sm h-7/12px、md h-8/13px、lg h-9/13px；primary=accent 实底、secondary=发丝线中性、ghost 不变、danger 保留；focus ring 系统蓝。
- `FormField`：控件 13px、`py-1.5`、radius 6px、focus 边框 + 环用 accent；`FieldShell` label 12px medium。
- 新增 `components/ui/StatusDot.tsx`：`(tone, children)` → 6px 色点 + 11px 文本，取代 Badge 的全部状态语义。
- **删除 `Badge.tsx` 与 `Card.tsx`**（迁移完成后 grep 断言零引用，防止回潮）；确需边界容器处用局部 div + 发丝线类。
- 原生 checkbox/select 靠 `accent-color` 自动获得系统蓝。

## D7 兼容 / 风险 / 回滚

- **零后端**：不触碰 Rust、IPC、DTO/zod、fixtures；`platformStatus.ts` 等逻辑层不动。
- **type scale 重定义是全局爆破半径**：S3 落地后必须整站视觉走查（light/dark）。
- **Overlay 标题栏风险**：拖拽区缺失 → 窗口拖不动；红绿灯与侧栏内容重叠 → 顶部 44px 预留。`pnpm tauri:dev` 手动验证拖拽/双击缩放/全屏。回滚 = 还原 tauri.conf 两行。
- 每个实现步骤独立提交，可按步回滚（见 implement.md）。
- 图标重生成会覆盖 Square*/StoreLogo（同源图形，预期内）。

## D8 后续修订（用户实测 + Open Design 两轮评审，2026-07-21）

用户真机反馈与 OD 逐轮对齐产生的增量决议，均已实现：

- **拖拽区扩展**：D4 的两处拖拽区不够——整条侧栏（aside + 各非交互容器）都挂 `data-tauri-drag-region`（Tauri 只查 mousedown target 不上溯，故子容器需各自挂）。
- **下拉框**：原生 select 弹层丑，换 `@radix-ui/react-select`（2.3.4）自绘：trigger 同输入框规格，popper 浮层 rounded-lg + shadow-2xl + 选中打勾；「继承」经 `"inherit"` 哨兵转换，draft 数据形状零变化。
- **字阶升档**（R1 结论 13px 偏小 → R2 选 14px 折中档）：xs 12/17 · sm/base 14/21 · lg 16/23 · xl 18/25 · 2xl 21/28 · 3xl 25/32；Button 尺寸升半档（sm h-7.5 / md h-8.5 / lg h-9.5 / icon size-7.5）。
- **等宽字体**：IBM Plex Mono（@fontsource 5.3.0，main.tsx 导入 400/500，离线打包），`--font-mono` 首位；UI sans 栈不动。
- **品牌层**：`--brand` `#6c74f6`/`#7a82ff`，仅三个身份位——侧栏 BrandMark、已安装页空态线稿插画（+副行文案）、成功页对勾方块；克制条款：永不用于按钮/选中/焦点/状态，无渐变无铺色。
- **代码块随主题**：`--code-bg`/`--code-text`（浅 #f6f6f8/#403f53、深 #161618/#e5e5e5）；差异面板 `+`/`-` 行染语义 soft 底（DiffLines 纯函数行渲染，不做语法高亮）。
- **R1 其余锁定项**：蓝色密度不变、侧栏选中态保持 accent-soft 蓝底蓝字。
