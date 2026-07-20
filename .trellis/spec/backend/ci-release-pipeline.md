# CI & Release Pipeline

> Executable contracts for the GitHub Actions regression pipeline and the
> tag-driven macOS release pipeline. Introduced by task `07-20-release-ci`;
> every contract below was verified against live runs (PR check run, `v0.1.0`
> draft release, mismatched-tag rejection).

---

## 1. Scope / Trigger

Read this spec before:

- editing anything under `.github/workflows/`
- bumping the app version or cutting a release
- changing `bundle` settings in `src-tauri/tauri.conf.json`
- running cargo commands in a clean checkout (see Gotcha 1)

---

## 2. Pipeline Signatures

### `.github/workflows/ci.yml`

- Triggers: `push` → `main`, `pull_request` → `main`, `workflow_dispatch`, `workflow_call`.
- Job `frontend` (ubuntu-latest): `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm test:e2e` (Playwright report uploaded on failure).
- Job `rust` (macos-latest, cwd `src-tauri`): `mkdir -p ../dist` → `cargo fmt --all -- --check` → `cargo clippy --workspace --all-targets --all-features -- -D warnings` → `cargo test --workspace --all-features`.
- `release.yml` reuses this workflow via `workflow_call`: keep it callable — never add a required `inputs` field without a default.

### `.github/workflows/release.yml`

- Trigger: push of a tag matching `v*`. Requires `permissions: contents: write`.
- Job chain: `version-check` → `checks` (`uses: ./.github/workflows/ci.yml`) → `build` (`tauri-apps/tauri-action@v0`, `releaseDraft: true`, `prerelease: false`).

---

## 3. Contracts

### Version contract (cross-file, enforced)

`package.json .version` == `src-tauri/tauri.conf.json .version` == `src-tauri/Cargo.toml [package].version` == pushed tag with the `v` prefix stripped. All three files move together in the same commit; the pipeline enforces it, humans do the bump.

### Release artifacts

- `DIY.Subagent_<version>_aarch64.dmg` (primary download) and `DIY.Subagent_aarch64.app.tar.gz` (tauri-action extra), attached to a **draft** release authored by `github-actions[bot]`.
- Publishing is always a manual step after reviewing the draft.
- Bundles are ad-hoc signed (arm64 only) until Apple Developer secrets exist.

### Signing environment (reserved, optional)

`APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` — present as commented-out env lines on the tauri-action step. Enable by configuring the repo secrets and uncommenting; no other change is required.

---

## 4. Validation & Error Matrix

| Condition | Behavior |
|-----------|----------|
| Tag version != any of the three file versions | `version-check` exits 1 within seconds; `checks` and `build` never run; no release object is created |
| Any of the 7 regression checks fails | `build` never runs; no release object is created |
| `dist/` missing when compiling `src-tauri` | Compile error from `generate_context!` (prevented in CI by `mkdir -p ../dist`) |
| Tag pushed to a commit that predates the workflows | No run triggers at all — workflows must exist at the tagged commit |

---

## 5. Gotchas (Wrong vs Correct)

### Gotcha 1: `generate_context!` resolves `frontendDist` at compile time

**Wrong**: run `cargo clippy` / `cargo test` in a clean checkout → compile error because `../dist` does not exist (the macro embeds frontend assets at build time).

**Correct**: ensure the directory exists first — an empty one is enough for check/test workloads: `mkdir -p dist` at repo root (CI does exactly this), or run `pnpm build` for a real bundle.

### Gotcha 2: empty-string signing env can mis-trigger the signing path

**Wrong**: `APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}` while the secret is unset — GitHub exports an **empty string**, which the bundler may treat as "signing configured" and fail the build.

**Correct**: keep the env lines commented out until the secrets actually exist.

### Gotcha 3: concurrency must never cancel tag runs

`ci.yml` uses `cancel-in-progress: ${{ !startsWith(github.ref, 'refs/tags/') }}` so a busy branch can cancel superseded runs, but a release run reusing the workflow is never cancelled. Preserve this guard when touching `concurrency`.

---

## 6. Release Runbook (Base Case)

1. Bump the version in all three files, commit (conventional prefix, Chinese subject).
2. `git tag vX.Y.Z && git push origin vX.Y.Z`.
3. Wait for the `Release` run; review the draft release assets and body.
4. Publish manually.

**Bad case drill (verified)**: pushing a mismatched tag (e.g. `v0.0.1-mismatch`) fails at `version-check` with all three versions printed; clean up with `git push origin :refs/tags/<tag>` and `gh run delete <run-id>`.

---

## 7. Tests Required

- Any `ci.yml` change: a green run on a PR **before** merging (both jobs pass).
- Any `release.yml` change: a full draft-release run on a throwaway or real tag; verify assets appear and the draft stays unpublished. Use a mismatched tag to re-verify `version-check`, then delete the tag and the failed run.
- Known cosmetic warning: v4-generation actions emit a "Node.js 20 deprecated, forced to Node 24" annotation. Harmless; bump action majors deliberately, not to silence the warning blindly.
