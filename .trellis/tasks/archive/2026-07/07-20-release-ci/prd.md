# GitHub Actions 自动发行与 CI 回归测试

## Goal

为 diy-subagent 建立两条 GitHub Actions 流水线，替代手工构建与上传：

1. **CI 回归**（`ci.yml`）：push / PR 时自动跑全部既有检查，守住回归。
2. **自动发行**（`release.yml`）：推送 `v*` tag 触发，构建未签名 macOS dmg 并挂到 draft release。

## Background（仓库勘察证据）

- **构建可行性已验证**：本地 `tauri build` 已成功产出 `src-tauri/target/release/bundle/macos/DIY Subagent.app`；`tauri.conf.json` 的 `identifier` 为正式值 `com.jiuxu.diysubagent`（非默认占位），`version 0.1.0`。
- **CI 现状为零**：无 `.github/` 目录、无 git tag。远端 `jiuxu2003/diy-subagent` 为 **PUBLIC** → GitHub 标准托管 runner（含 macOS）免费不限量；若未来转私有，macOS 分钟按 10 倍计费，届时需降级 CI 方案。
- **检查命令全部现成**：
  - 前端：`pnpm lint`（`--max-warnings=0`）、`pnpm typecheck`、`pnpm test`（Vitest）、`pnpm test:e2e`（Playwright；配置已内置 CI 分支逻辑：`forbidOnly`、retries=2、自起 `pnpm dev`、仅 chromium；**不依赖 Rust 后端**）。
  - Rust（`src-tauri/`）：`cargo fmt --all -- --check`、`cargo clippy --workspace --all-targets --all-features -- -D warnings`、`cargo test --workspace --all-features`。
- **工具链锚点**：`packageManager: pnpm@11.15.0`；本地 node 24 / rustc 1.97.1；`rust-version = "1.77.2"`；tauri 2.11.5；release profile 已做体积优化（lto / strip / opt-level "s"）。
- **版本号散落三处**：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`（当前均为 0.1.0）。
- `bundle.targets` 目前仅 `["app"]`（无 dmg）；未配置代码签名（产物为 ad-hoc 签名）；未安装 tauri-plugin-updater。

## Requirements

### R1 CI 回归 workflow（`.github/workflows/ci.yml`）

- 触发：push 到 `main`、面向 `main` 的 PR、手动 `workflow_dispatch`；并暴露 `workflow_call` 供 release 复用。
- 双 job 并行：
  - 前端四件套（lint / typecheck / Vitest / Playwright e2e）跑 `ubuntu-latest`；
  - Rust 三件套（fmt / clippy / test）跑 `macos-latest`。
- 配缓存：pnpm store、cargo（rust-cache）、Playwright chromium。

### R2 发行 workflow（`.github/workflows/release.yml`）

- 触发：推送 `v*` tag。
- 流程：版本一致性校验（tag 必须等于三处版本号，不一致直接 fail、不产生 release）→ 复用 R1 全部检查 → 构建 aarch64（Apple Silicon）产物 → 挂 **draft release**。
- 产物：**未签名（ad-hoc）dmg**；签名相关 secrets / env 留成可选接口，未来拿到 Apple Developer 证书零重构接入。
- draft release 由人工检查产物、补 release notes 后手动发布；release body 默认模板含首次打开指引。

### R3 打包配置

- `tauri.conf.json` 的 `bundle.targets` 从 `["app"]` 改为 `["app", "dmg"]`。

### R4 文档

- README 增补下载入口与未签名 app 首次打开指引（系统设置"仍要打开"或 `xattr -dr com.apple.quarantine`）。

## Acceptance Criteria

- [ ] AC1 push 到 main 或开 PR 后，ci workflow 自动运行，七项检查全部通过。
- [ ] AC2 推送 `v*` tag 后，release workflow 产出 draft release，附件含 aarch64 dmg。
- [ ] AC3 tag 与任一处版本号不一致时，release workflow 失败且不产生 draft release。
- [ ] AC4 下载 draft release 的 dmg 可挂载安装，按指引放行 Gatekeeper 后 app 正常启动。
- [ ] AC5 README 包含下载与首次打开指引。
- [ ] AC6 本地开发路径零破坏：`pnpm tauri:build` 仍可用（新增 dmg 产物为增量变化），其余命令行为不变。

## Out of Scope

- Apple 签名与公证的实际接入（无付费账号；仅预留接口）
- 自动更新（tauri-plugin-updater 及其密钥体系）
- Windows / Linux 发行、Mac App Store 上架
- universal 双架构（仅出 aarch64）
- 版本号自动 bump（保持手动改三处 + 打 tag）
