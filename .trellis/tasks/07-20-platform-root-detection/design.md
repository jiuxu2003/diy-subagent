# Design: 平台根目录检测

## 方案概述

不改变 agents 子目录作为读写根的既有语义，只在 `PlatformDirectory` 上**新增**一个平台级检测信号，前端据此渲染分平台空状态。

## 数据流与契约

1. **Domain**：`AgentPlatform` 新增 `default_platform_root(self) -> &'static str`（`.claude` / `.codex` / `.cursor`，即 `default_relative_root` 的父目录）。`PlatformDirectory`（`domain/agents` 模型）新增 `platform_detected: bool`。
2. **Resolver**：`PlatformPathResolver::describe`（`src-tauri/src/infrastructure/paths.rs`）计算 `platform_detected = home_dir.join(default_platform_root).is_dir()`。用户 override 时同样按默认平台根目录判定（override 只改 agents 写入位置，不改"平台是否安装"的语义）。
3. **DTO/IPC**：`src-tauri/src/dto/mod.rs` 的 `PlatformDirectoryDto` 加 `platformDetected`；`src/contracts/index.ts` 的 `platformDirectorySchema` 同步加 `z.boolean()`；更新 `tests/fixtures/` 中相关 fixture，契约测试双向锁定。
4. **前端**：
   - `useInventory` 已有数据 + `usePlatformDirectories`（settings 查询）组合，在 `InstalledPage` 顶部渲染每个平台的状态条：有 agent 文件 → 不渲染状态条（列表本身已说明）；`platformDetected && 无文件` → "已安装 <平台>，暂无 subagent"；`!platformDetected` → "未检测到 <平台>"。
   - `SettingsPage` 的 `availabilityLabel`：`missing` 且 `platformDetected` → "agents 目录未创建（安装时自动创建）"；`missing` 且未检测 → "未检测到该平台"。

## 兼容性

- 新增字段为纯增量，`serde` 序列化端始终输出该字段，zod 端 required 即可（前后端同版本发布，无跨版本消费者）。
- 扫描、preview/commit、watcher 均不改行为；`Missing` availability 语义保留。

## 权衡

- 不做 PATH 探测 CLI：根目录存在性已足够覆盖"装过就有目录"的现实，且零权限风险、零新依赖。
- 状态条放 InstalledPage 顶部而非改分组结构：现有按 logicalName 分组保持不变，破坏面最小。

## 回滚

单 commit 纯增量改动，revert 即回滚；无数据迁移。
