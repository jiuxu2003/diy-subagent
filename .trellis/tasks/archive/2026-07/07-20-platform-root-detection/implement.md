# Implement: 平台根目录检测

## Checklist

1. [ ] Domain：`AgentPlatform::default_platform_root()` + `PlatformDirectory.platform_detected`（`src-tauri/src/domain/agents/model.rs`）。
2. [ ] Resolver：`describe` 计算 `platform_detected`；补 paths 单测（根目录存在/缺失两种、override 情况）。
3. [ ] DTO：`PlatformDirectoryDto` 加 `platformDetected`（`src-tauri/src/dto/mod.rs`）。
4. [ ] 契约：`src/contracts/index.ts` schema + `tests/fixtures/` fixture + `src/contracts/index.test.ts`。
5. [ ] 前端 InstalledPage：分平台空状态条（组合 inventory + platform directories 查询）。
6. [ ] 前端 SettingsPage：`availabilityLabel` 区分两种 missing 文案。
7. [ ] 必要的 Vitest 用例（前端状态渲染逻辑如有抽出的纯函数则覆盖）。

## Validation

```bash
cd src-tauri && cargo fmt --all -- --check && cargo clippy --workspace --all-targets --all-features -- -D warnings && cargo test --workspace --all-features
pnpm lint && pnpm typecheck && pnpm test
```

手动验证：本机 `~/.claude`（无 agents 子目录）应显示"已安装、暂无 subagent"；`~/.cursor/agents` 空目录同样；临时改名 `~/.codex` 可验证"未检测到"。

## 风险点 / 回滚

- 风险集中在契约链遗漏（DTO/zod/fixture 三处必须同步），contract test 会兜底。
- 单 commit revert 即回滚。
