# Lu Windows development installer

This is an **unsigned development preview** built from the `lu/core-contracts-native-registry` branch. It is not a production release or the official Jan installer.

## Download

Open the [Lu Windows Installer GitHub Actions runs](https://github.com/vjmichael/jan_alt/actions/workflows/lu-windows-installer.yml) and select a **successful** run. In **Artifacts**, download `Lu-Windows-x64-Vulkan-Development-Installer`. Extract the ZIP and run the NSIS `.exe` installer. The Actions artifacts may require GitHub sign-in and expire after 14 days.

The installer is only available if the workflow **finishes successfully**, including the pinned llama.cpp worker and bundled runtime DLLs. A passing Rust `cargo check` alone does not produce an installer.

Verify `lu-installer-sha256.txt` against the extracted EXE with PowerShell's `Get-FileHash -Algorithm SHA256`. This detects accidental changes but is **not a substitute for publisher code signing**. Windows SmartScreen can warn about unsigned previews. Do not disable security protections or grant unexpected elevation to bypass a warning.

## Isolation from official Jan

Lu uses a separate Tauri application identifier (`ai.lu.preview`), executable (`Lu-Desktop.exe`), product name (`Lu`) and per-user data directory (`%APPDATA%\\Lu` on Windows). Its preview-specific `lu-distribution` feature prevents migration of official Jan settings. Official Jan should remain at `%APPDATA%\\Jan`.

The prototype disables Jan's automatic updater endpoints and does not require, share, or migrate an existing Jan profile. Development previews keep the current Jan-derived icon while the Lu artwork is not finalized.

## Contents and limitations

The workflow builds and includes the pinned `jan-llama-worker.exe` Vulkan-capable backend plus DLLs, Bun and UV sidecars, web UI, and Lu's opt-in native core. CPU fallback is managed by the engine, not proved by packaging. **An installer build passing does not prove Vulkan/ROCm/CUDA initialization or a model-load smoke test.** This preview bundles Vulkan (not the separate ROCm/CUDA backends), and Lu's benchmark-driven backend switching and CPU autotuning remain unintegrated.

This installer is for local experimentation. Check the [Lu draft PR](https://github.com/vjmichael/jan_alt/pull/1) for known security, memory-worker, and inference-readiness gaps. Do not use sensitive production data during preview testing.

## Build design

`.github/workflows/lu-windows-installer.yml` builds the actual Windows x64 NSIS artifact on a Windows runner. `src-tauri/tauri.lu.conf.json` contains the Lu-specific bundle configuration, and `scripts/prepare-lu-distribution.mjs` changes only the workflow's checked-out Rust binary target name. Official Jan files remain unchanged in the repository, and the PR stays unmerged.
