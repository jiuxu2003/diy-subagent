# 执行计划：GitHub Actions 自动发行与 CI 回归

## 有序清单

1. [ ] `tauri.conf.json`：`bundle.targets` 改为 `["app", "dmg"]`；本地 `pnpm tauri:build` 跑一次确认 dmg 产出（顺带覆盖 AC6 的本地路径验证）。
2. [ ] 新增 `.github/workflows/ci.yml`：双 job（frontend@ubuntu / rust@macos）、`workflow_call` 出口、pnpm + cargo + Playwright 三层缓存、concurrency 取消旧 run、rust job 前置 `mkdir -p dist`（见 design 坑 1）。
3. [ ] 新增 `.github/workflows/release.yml`：`v*` tag 触发 → version-check（内联脚本，见 design 坑 2）→ `uses` ci.yml → tauri-action 构建并挂 draft release（`releaseDraft: true`，body 含放行指引，env 预留签名变量）。
4. [ ] README 增补"下载与安装"段：Release 下载入口 + 未签名 app 首次打开指引。
5. [ ] 本地静态验证：YAML 语法自检（有 actionlint 就跑，没有则靠 `gh api` dry 校验或人工复核）；`pnpm lint` / `pnpm typecheck` / `pnpm test` 全绿确认无意外改动。
6. [ ] 推送分支并开 PR → 观察 ci workflow 实跑（AC1）；重点确认 rust job 的 `mkdir -p dist` 坑是否成立。
7. [ ] 合并 main 后打 `v0.1.0` tag → 验证 draft release + dmg 附件（AC2）；下载 dmg 本机挂载、放行、启动（AC4）。
8. [ ] AC3 验证：打一个与三处版本不一致的临时 tag（如 `v0.0.1-mismatch`），确认 workflow fail 且无 draft 产生，验证后删除该 tag 与失败 run 记录。

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
