# PRD: 更换应用 Logo

## Goal

替换 DIY Subagent 桌面应用的图标。当前 logo（紫蓝渐变 + 三个机器人脸树状结构）细节太碎、缩小后模糊，用户不满意。

## Background

- 图标源文件位于 `src-tauri/icons/`，含 `icon.icns`（macOS）、`icon.ico`（Windows）、多尺寸 PNG 及 `android/`、`ios/` 目录。
- `src-tauri/tauri.conf.json:33-38` 引用 `icons/32x32.png`、`128x128.png`、`128x128@2x.png`、`icon.icns`、`icon.ico`。
- `pnpm tauri icon <source>` 可从单张 1024x1024 源图批量生成全部平台图标。
- App 品牌色（`src/styles/globals.css`）：主色靛蓝 `#5b65f5`，暗色模式 `#7880ff`/`#9298ff`，暗色背景 `#11151d`。

## Requirements

1. 设计新 logo 源图（SVG → 1024x1024 PNG）：
   - 风格：抽象几何节点图——一个实心主节点向下细线连接三个空心子节点，保留"主 agent 派生 subagent"语义（用户已确认）。
   - 配色：深蓝黑底（约 `#11151d`），节点与连线用品牌靛蓝渐变 `#5b65f5 → #9298ff`（用户已确认）。
   - macOS 圆角方形（squircle）底板，缩小到 32px 仍可辨识。
2. 用 `pnpm tauri icon` 重新生成 `src-tauri/icons/` 全套图标。

## Acceptance Criteria

- [ ] 新源图生成全套平台图标，`tauri.conf.json` 引用的 5 个文件全部更新。
- [ ] `pnpm tauri:dev` 启动后 Dock/窗口图标显示为新 logo。
- [ ] 32x32 尺寸下节点结构仍清晰可辨。

## Out of Scope

- 前端界面内的品牌图形（`public/` 下资源）不在本次范围，除非发现引用旧 logo。
- 不改 App 名称、品牌色。
