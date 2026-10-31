# W-NSIS-02: Preserve installer verdict when real-model tool capability fails

2026-10-31. Baseline 2624578942d4c8cccb1a84ae77b3d00aee9310b3; **standalone future smoke verification only**.

The current full Windows installer workflow 41227420821 runs the real model-generated Protobuf file-tool gate *inside* the installed smoke before uninstall. If a 0.5B model's JSON request is invalid, the old script stopped before profile restart and uninstall, conflating an AI-capability failure with Windows package correctness.

This patch separates the provisional outcomes `installedPackage`, `nativeModelTool`, `profileRestart`, `uninstall`, and `coworkIndependence` in a content-free JSON receipt. Failed model/tool or profile probes remain fatal **after** the installer is uninstalled; no failed or unexecuted model gate can become PASS. The receipt is not independent release attestation and never certifies alpha. Existing preinstallation or uninstall failures continue to fail closed.

A lightweight local Node validator/test suite passed 9/9 cases. The updated PowerShell and Windows NSIS lifecycle remain **unverified** until run on the actual installed package. The existing expensive pinned installer run is unchanged; later reuse workflows should download its SHA-256-pinned artifact and use this script without rebuilding.

A known separate blocker remains: legacy `jan-llama-worker.exe` and inherited bootstrap functionality are still bundled and are explicitly marked `blocked_legacy_worker`. GitHub is the repository/evidence archive, not Lu's local development host.

## Independent Windows syntax/receipt verification — PASS

Workflow: https://github.com/vjmichael/jan_alt/actions/runs/41231040081
Tested source: `f74815da12dd22892ac3a8b36f8779607435d8cb`.

- Node smoke-verdict contract: **9/9 local tests passed** and Windows Actions test step passed.
- Actual `scripts/smoke-lu-windows-x64.ps1` PowerShell parser on a Windows 2025 runner: **passed**.
- PowerShell-created fixture with `nativeModelTool=FAIL` and `uninstall=PASS` was accepted as a **provisional, non-alpha** receipt: **passed**.
- This cheap workflow does not install a product, execute a model, or verify the 2026-10-31 full NSIS build; those gates remain pending, and the staged modifications are not yet on the pinned installer branch.

## Split artifact-reuse acceptance: installer vs real model tool

The prepared Windows workflow runs two independent jobs against NSIS run 41227420821, source 513969a77e1205cedb3b6ae7bb5d389acda94b60, using identical immutable artifact bytes. First: installed GUI startup, profile restarts, and uninstall with no model. Second: pinned real Qwen2.5 0.5B GGUF, installed Lu-owned llama-server, native conversation-authorized Protobuf file-tool call, final model continuation, and uninstall. The second job compiles only Lu-core's test harness, not the full Tauri/NSIS application. Neither job accepts synthetic tool JSON, and neither declares Cowork independence or alpha. The source preparation has not executed either installed test; launch only after a verified NSIS artifact is uploaded.
