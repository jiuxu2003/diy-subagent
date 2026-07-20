# 执行计划：GitHub Actions 自动发行与 CI 回归

## 有序清单

1. [x] `tauri.conf.json`：`bundle.targets` 改为 `["app", "dmg"]`；本地 `pnpm tauri:build` 跑一次确认 dmg 产出（顺带覆盖 AC6 的本地路径验证）。→ 已产出 `DIY Subagent_0.1.0_aarch64.dmg`（3.0M）
2. [x] 新增 `.github/workflows/ci.yml`：双 job（frontend@ubuntu / rust@macos）、`workflow_call` 出口、pnpm + cargo + Playwright 三层缓存、concurrency 取消旧 run、rust job 前置 `mkdir -p dist`（见 design 坑 1）。
3. [x] 新增 `.github/workflows/release.yml`：`v*` tag 触发 → version-check（内联脚本，见 design 坑 2）→ `uses` ci.yml → tauri-action 构建并挂 draft release（`releaseDraft: true`，body 含放行指引；签名 env 以注释块预留，避免空 secrets 误触发签名流程）。
4. [x] README 增补"下载与安装"段：Release 下载入口 + 未签名 app 首次打开指引。
5. [x] 本地静态验证：PyYAML 语法校验通过；`pnpm lint` / `pnpm test` 全绿（`tsc -b` 已随本地 tauri build 一并通过）。
6. [x] 推送分支（PR #2 已存在，推送自动更新）→ ci workflow 实跑通过（AC1）：Frontend 1m02s / Rust 2m33s，`mkdir -p dist` 坑方案在 CI 实测成立。
7. [x] 合并 main 后打 `v0.1.0` tag → draft release 由 bot 创建，附件含 `DIY.Subagent_0.1.0_aarch64.dmg` 与 `app.tar.gz`（AC2）；dmg 下载后挂载成功、app 从卷内正常启动（进程实测存在）后退出（AC4）。产物为 arm64 ad-hoc 签名，符合 D1。
8. [x] AC3 验证：`v0.0.1-mismatch` tag 在 version-check 一步 6 秒内失败（错误信息含三处版本号），下游 job 未执行、无 draft 产生；测试 tag 与失败 run 记录已删除。

## 验证命令

```bash
pnpm lint && pnpm typecheck && pnpm test          # 本地前端回归
cd src-tauri && cargo fmt --all -- --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features
pnpm tauri:build                                   # 本地确认 dmg 产出
gh run list --workflow=ci.yml                      # 观察 CI 实跑
gh release list                                    # 确认 draft release
```

## 风险与回滚点

- **风险 1**：CI 上 `generate_context!` 对空 `dist` 目录的行为未实测（design 坑 1）。若空目录不够，降级方案是 rust job 也装 pnpm/node 并先跑 `pnpm build`（多约 1 分钟）。
- **风险 2**：tauri-action 与 tauri 2.11 的参数兼容性。若不兼容，回退到手写 `pnpm tauri:build` + `softprops/action-gh-release` 上传 `src-tauri/target/release/bundle/dmg/*.dmg`。
- **风险 3**：Playwright 首跑浏览器下载耗时；缓存生效后收敛。macos runner 排队时间不可控，属体验问题不阻塞。
- **回滚点**：步骤 1-4 全部是增量文件/单行配置，`git revert` 或删文件即回滚；无数据迁移、无应用代码改动。

## start 前检查

- prd / design / implement 三件已齐；本任务走 inline 工作流，跳过 implement.jsonl / check.jsonl 门槛。
- 等待用户审阅并批准后执行 `python3 ./.trellis/scripts/task.py start`。
