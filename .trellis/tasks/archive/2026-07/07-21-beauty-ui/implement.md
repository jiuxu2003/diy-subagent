# Implement — UI 视觉重构与细节修复

分 6 步执行，每步独立提交（conventional commit + 中文主题），可按步回滚。设计细节见 design.md（D1–D7），文案逐条对照 D5b 表核销。

## S1 图标重制（R1 / D1）

1. PIL 内联脚本：flood-fill 清角白 + alpha 收边 1px + 缩放 820px 居中贴 1024 透明画布 → 输出仓库根 `app-icon.png`（入库）。
2. `pnpm tauri icon app-icon.png` 重生成 `src-tauri/icons/`。
3. 校验：

```bash
python3 -c "
from PIL import Image
im = Image.open('src-tauri/icons/icon.png').convert('RGBA')
w, h = im.size
corners = [im.getpixel(p) for p in [(0,0),(w-1,0),(0,h-1),(w-1,h-1)]]
assert all(c[3] == 0 for c in corners), corners
print('corners transparent OK', im.size)
"
```

提交 1：`fix: 重制应用图标为透明留白画布`

## S2 复制反馈（R2 / D2）

1. 重写 `InstallSuccess.tsx` 的 `CopyableLine`：`idle|copied|failed` 状态 + 2s 复位 + 定时器清理 + `role="status"`。
2. 新增单测（`InstallSuccess.test.tsx`）：点击后断言「已复制」出现、剪贴板内容正确。
3. 校验：`pnpm vitest run src/features/agents/components/InstallSuccess.test.tsx`

提交 2：`feat: 复制调用命令后展示已复制反馈`

## S3 Token + 外壳（D3 / D4）——风险最高步

1. `src/styles/globals.css`：字体栈去 Inter、`@theme` 重定义 type scale、中性灰 + 系统蓝双主题 token、删渐变、收圆角与阴影。
2. `src-tauri/tauri.conf.json`：window 加 `titleBarStyle: "Overlay"` + `hiddenTitle: true`。
3. `src/app/App.tsx`：全视口外壳、拖拽顶条（`data-tauri-drag-region`）、通栏侧栏（44px 红绿灯预留、品牌行、主导航、底部主题切换）、删信任卡与假窗口。
4. 校验：`pnpm typecheck && pnpm test:e2e`（主导航锚点不破）+ `pnpm tauri:dev` 手动验证：窗口可拖拽、双击顶条缩放、红绿灯不与内容重叠、light/dark 双主题。

提交 3：`feat: 重构设计 token 与 macOS 原生外壳`
回滚点：还原 tauri.conf 两行即可退回标准标题栏。

## S4 UI 原语（D6）

1. 重设 `Button.tsx`、`FormField.tsx` 尺寸/圆角/焦点环；新增 `StatusDot.tsx`。
2. 此步不删 Badge/Card（屏幕迁移完成前保持可编译）。
3. 校验：`pnpm typecheck && pnpm test`

提交 4：`feat: 重设 UI 原语并新增状态点组件`

## S5 六屏重构 + 文案（D5 / D5b）

顺序：TemplateLibrary → StructuredEditor → PreviewReview → InstallSuccess → InstalledPage（保留 07-20 空状态语义）→ SettingsPage → 最后删除 `Badge.tsx`/`Card.tsx`。

- 每屏对照 D5 结构 + D5b 文案表执行；测试锚点字符串（D5b 末尾清单)不得改动。
- 收尾断言：`grep -rn "components/ui/Badge\|components/ui/Card" src/ 应为空`；`grep` 核销 D5b 表中旧文案全部消失。
- 校验：`pnpm lint && pnpm typecheck && pnpm test`

提交 5：`feat: 按原生工具风重构六个界面与用户文案`（体量过大时可按屏拆分提交）

## S6 全量校验（Phase 2.2 末轮全量）

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm test:e2e
```

- `pnpm tauri:dev`：六屏 × light/dark 走查（对照 prd 验收标准逐条勾）。
- `pnpm tauri:build`：Dock/访达确认图标无白色方块。
- Rust 侧零改动（仅 tauri.conf.json 配置），无需 cargo 门槛；如 CI 要求则顺跑 `cargo fmt --all -- --check`。

## Phase 3 收尾

- `trellis-update-spec`:若组件规范有新约定（StatusDot 取代 Badge、发丝线结构、系统蓝 token），写入 `.trellis/spec/frontend/component-guidelines.md`。
- 提交遗留变更 → `/trellis:finish-work`。

## 风险文件

- `src/styles/globals.css`（type scale 全局爆破半径）
- `src/app/App.tsx`、`src-tauri/tauri.conf.json`（窗口行为）
- `src/features/agents/components/InstalledPage.tsx`（勿回退 07-20 的空状态逻辑 `platformStatus.ts`）
