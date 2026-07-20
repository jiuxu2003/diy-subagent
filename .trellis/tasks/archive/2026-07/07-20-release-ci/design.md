# 技术设计：GitHub Actions 自动发行与 CI 回归

## 文件结构

```
.github/workflows/ci.yml        # 回归检查，可被 workflow_call 复用
.github/workflows/release.yml   # v* tag 触发的发行流水线
```

不新增仓库脚本文件：版本一致性校验内联在 release.yml 的 step 里（bash + jq + python3 tomllib，runner 自带），避免脚本散落。

## 关键选型

- **构建与发布用官方 `tauri-apps/tauri-action@v0`**（标准化生态复用）：负责调 `tauri build`、收集 bundle、创建 draft release 并上传附件。参数：`tagName: v__VERSION__`、`releaseDraft: true`、`prerelease: false`、`releaseBody` 内置首次打开指引模板。备选方案（手写 `pnpm tauri:build` + `softprops/action-gh-release`）仅在 tauri-action 与 tauri 2.11 出现兼容问题时启用。
- **pnpm**：`pnpm/action-setup`（自动读 `packageManager` 字段定版本）+ `actions/setup-node@v4`（node 24，`cache: pnpm`）；安装用 `pnpm install --frozen-lockfile`。
- **Rust**：`dtolnay/rust-toolchain@stable`（components: rustfmt, clippy）+ `Swatinem/rust-cache@v2`（`workspaces: src-tauri`）。
- **Playwright**：`pnpm exec playwright install chromium --with-deps`；用 `actions/cache` 缓存 `~/.cache/ms-playwright`，key 含 Playwright 版本号。
- **CI 复用**：release.yml 内 `checks` job 用 `uses: ./.github/workflows/ci.yml`（workflow_call），build job `needs: [version-check, checks]`。
- **runner 布局**：前端 job → ubuntu-latest（e2e 不依赖 Rust 后端，Playwright 配置已就绪）；Rust job 与 release 构建 job → macos-latest（当前为 arm64，天然产出 aarch64，无需交叉编译参数）。
- **省资源**：ci.yml 加 `concurrency`（按 ref 分组，`cancel-in-progress: true`）。
- **权限**：release 的 build job 需 `permissions: contents: write`（创建 release）；ci 保持默认只读。

## 已识别的坑（实现时必须处理）

1. **`generate_context!` 编译期需要 `frontendDist` 目录存在**：`tauri.conf.json` 指向 `../dist`，CI 的 Rust job（clippy `--all-targets` / test 会编译 bin）在无前端构建产物时会因目录缺失而编译失败。处理：Rust job 在 cargo 命令前 `mkdir -p dist`（空目录可通过编译，仅嵌入空资产；本地不受影响因为开发者跑过 vite build）。此坑需在 CI 实测确认。
2. **版本一致性校验**：`TAG=${GITHUB_REF_NAME#v}`，对比 `jq -r .version package.json`、`jq -r .version src-tauri/tauri.conf.json`、python3 tomllib 读 `src-tauri/Cargo.toml` 的 `package.version`。任一不等 → `exit 1`，此 job 放最前，失败则不进入构建。
3. **未签名产物的 Gatekeeper 行为**：新 macOS 上右键打开不足以放行，release body 与 README 必须写"系统设置 → 隐私与安全性 → 仍要打开"或 `xattr -dr com.apple.quarantine` 两条路径。
4. **签名接口预留**：build step 的 env 透传 `APPLE_CERTIFICATE`、`APPLE_CERTIFICATE_PASSWORD`、`APPLE_SIGNING_IDENTITY`、`APPLE_ID`、`APPLE_PASSWORD`、`APPLE_TEAM_ID`（secrets 未配置时为空，tauri-action 自动跳过签名/公证），未来配上 secrets 即生效，workflow 零改动。

## 数据流

```
push/PR → ci.yml ── frontend job (ubuntu):  lint → typecheck → vitest → e2e
                └── rust job (macos):       mkdir dist → fmt → clippy → test

push v* tag → release.yml ── version-check (ubuntu)
                          ── checks = workflow_call ci.yml
                          └─ build (macos, needs 前两者):
                               tauri-action → tauri build → dmg → draft release
```

## 兼容性与回滚

- 不改任何应用代码；`tauri.conf.json` 仅 `bundle.targets` 增量加 `"dmg"`，本地 `pnpm tauri:build` 多产出一个 dmg，零破坏。
- 回滚：删除两个 workflow 文件 + `bundle.targets` 改回 `["app"]` 即回到现状；draft release 可直接删除，不影响已有 tag 语义。
