# diy-subagent
design your own subagent(not build-in)

## Download & Install (macOS)

Grab the latest `.dmg` from [GitHub Releases](https://github.com/jiuxu2003/diy-subagent/releases), open it, and drag `DIY Subagent.app` into `Applications`.

Builds are currently **not signed or notarized** (no Apple Developer certificate yet), so Gatekeeper blocks the first launch. Pick either way to allow it:

- Open **System Settings → Privacy & Security**, then click **Open Anyway** at the bottom; or
- run `xattr -dr com.apple.quarantine "/Applications/DIY Subagent.app"` in a terminal.

Apple Silicon (aarch64) only.

## CI / Release

- `ci.yml` runs on pushes / PRs to `main`: frontend lint / typecheck / unit / e2e on Ubuntu, and Rust fmt / clippy / test on macOS.
- `release.yml` runs on `v*` tags: it verifies the tag matches the versions in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`, reruns all CI checks, builds the dmg, and attaches it to a **draft** GitHub release for manual review and publishing.
- Release flow: bump the three version fields → commit → `git tag vX.Y.Z && git push origin vX.Y.Z` → review and publish the draft release.

