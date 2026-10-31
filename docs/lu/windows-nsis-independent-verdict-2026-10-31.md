# W-NSIS-02: Preserve installer verdict when real-model tool capability fails

2026-10-31. Baseline 2624578942d4c8cccb1a84ae77b3d00aee9310b3; **standalone future smoke verification only**.

The current full Windows installer workflow 41227420821 runs the real model-generated Protobuf file-tool gate *inside* the installed smoke before uninstall. If a 0.5B model's JSON request is invalid, the old script stopped before profile restart and uninstall, conflating an AI-capability failure with Windows package correctness.

This patch separates the provisional outcomes `installedPackage`, `nativeModelTool`, `profileRestart`, `uninstall`, and `coworkIndependence` in a content-free JSON receipt. Failed model/tool or profile probes remain fatal **after** the installer is uninstalled; no failed or unexecuted model gate can become PASS. The receipt is not independent release attestation and never certifies alpha. Existing preinstallation or uninstall failures continue to fail closed.

A lightweight local Node validator/test suite passed 9/9 cases. The updated PowerShell and Windows NSIS lifecycle remain **unverified** until run on the actual installed package. The existing expensive pinned installer run is unchanged; later reuse workflows should download its SHA-256-pinned artifact and use this script without rebuilding.

A known separate blocker remains: legacy `jan-llama-worker.exe` and inherited bootstrap functionality are still bundled and are explicitly marked `blocked_legacy_worker`. GitHub is the repository/evidence archive, not Lu's local development host.
