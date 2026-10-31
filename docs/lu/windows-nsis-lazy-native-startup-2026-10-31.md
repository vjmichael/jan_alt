# W-NSIS-03 — Fix false Jan worker startup failure in installed Lu

Date: 2026-10-31. Original Windows installer run: https://github.com/vjmichael/jan_alt/actions/runs/41227420821

## Actual observed fault

The real Windows x86-64 NSIS build, binary/engine hashes, cross-commit upgrade and uninstall, and pinned Qwen GGUF download all passed. The installed Lu-Desktop.exe launched in the disposable Windows profile, produced its diagnostic log, and preserved the sentinel Jan profile and jan:// registry handler. The installer smoke then **incorrectly required a directly owned jan-llama-worker.exe at GUI startup** and failed because it found zero. The real native model→tool integration was not reached.

This is an obsolete assertion from Jan's eager worker bootstrap. Lu's native `core::lu_inference` engine is demand-loaded; an empty Jan worker list at ordinary startup is expected for the native-only architecture. Absence of a Jan worker is **not proof of a functioning native GGUF**.

## Targeted correction

- Startup smoke accepts 0 inherited Jan workers by default; callers can explicitly `-RequireLegacyWorker` to test the old Jan router or `-RejectLegacyWorker` to prove native-only startup did not spawn one. Conflicting requirements fail.
- The three-process A/B/A profile smoke no longer equates a directly owned Jan worker with startup readiness. It still requires app-owned logs, a private Lu MCP config, profile isolation, checkpoint persistence, no Jan data modification, and controlled shutdown. It can explicitly reject a legacy worker.
- The revised *artifact-reuse* workflow opts into `-RejectLegacyWorkerStartup`; the independent actual GGUF native-tool job must still verify real model inference and Protobuf dispatch.
- PowerShell parser and verdict-contract regression on Windows is mandatory before running new installed smoke. The original installer artifact is not rebuilt or silently relabeled as alpha.

A legacy `jan-llama-worker.exe` is still **bundled** in this compatibility-preview NSIS: `coworkIndependence=blocked_legacy_worker` and `alphaAccepted=false`, even if no child starts. The staged native-only packaging branch is still unverified. The actual installed model-native-tool gate and clean uninstall require separate fresh evidence.

**Source change does not declare installed test PASS.**
