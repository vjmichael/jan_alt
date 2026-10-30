# Lu — local regression checks without GitHub Actions

**October 30, 2026. Engineering runner only; not an end-user CLI or an Alpha acceptance substitute.**

This is an intentionally offline Windows PowerShell 7 runner for the next Lu Windows x86-64 engineering cycle. It supplements—not replaces—real installed Lu/W01, worker isolation, profile isolation or two-process WebView2 tests.

## Run on a Windows Lu source checkout

Prerequisites: PowerShell 7, already installed Rust/Cargo toolchain with the required `rustfmt` / (Full mode) `clippy` components, and previously cached Cargo dependencies. The script **does not install dependencies, fetch models, call GitHub APIs, start CI or download anything**. If a dependency is unavailable offline, it fails and reports that local setup is incomplete.

```powershell
pwsh -NoProfile -File .\scripts\test-lu-core-offline.ps1 -Profile Quick
```

Quick runs the `lu-core` `cargo fmt --check` and tests for the native JSON boundary, native agent tool turn, supervised GGUF/tool-loop fixture, and the persistent llama backend's unit suite.

```powershell
pwsh -NoProfile -File .\scripts\test-lu-core-offline.ps1 -Profile Full
```

Full runs format, all Rust targets, and strict Clippy. The script runs with `CARGO_NET_OFFLINE=true` and `cargo --offline`, and disables rustup auto-install. All Cargo build products, test TEMP/TMP scratch files, and the test-only `JAN_E2E_HOME` profile are directed under `src-tauri/lu-core/target/lu-offline-checks/` inside the checkout. It neither uses nor deletes the operator's normal Lu/Jan profile, and restores process environment variables afterward. The directory is Git-ignored. It will remain on disk to retain incremental build artifacts; delete it manually *only when no tests are running and only if you want to free space*.

Result marker: `LU_LOCAL_OFFLINE_CHECK_PASS profile=Quick|Full network=disabled actions=unused acceptance=not_claimed`, printed only if all selected steps succeed.

## Test provenance

- This runner is committed on `tools/lu-local-offline-checks-20261030`, stacked after PR #93's source-validated `dd815b8c`.
- The script's source/command safety can be inspected without GitHub Actions. **It has not yet been executed under PowerShell**, since this environment has neither PowerShell nor Rust installed. It is not acceptable to report a pass from a static inspection.
- PR #93's existing GitHub runs 41070628837 (Core), 41070628752 (Phase4F), 41070628680 (native loop) passed on its own exact head. The new local script has no retroactive tests.
- Source candidate `fix/lu-chatml-stop-20261030` introduces a separate completion-boundary test; it must be merged into a local branch/check-out before the `persistent_llama_backend` test can verify that change. An offline test from this runner's base branch alone cannot claim the stop candidate passed.

## Boundaries still requiring real Windows evidence

W01 requires a real small-model native GGUF reply, durable assistant JSONL readback and React commit, followed by a separate Lu process restoring the exact assistant without regeneration. Other installed W02–W06, AX and DX acceptance gates require their own actual measurements. Never use local synthetic tests as a substitute for W01 or installer Alpha acceptance.

Do not run the existing workflow trigger branches or open new PRs merely to check the runner while GitHub's included Actions budget is exhausted.
