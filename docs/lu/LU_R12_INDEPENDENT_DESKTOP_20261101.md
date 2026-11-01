# Lu R12 — Independent Tauri/React Desktop Source Candidate

Date: 2026-11-01
Status: **SOURCE INTEGRATION COMPLETE FOR R12; ALPHA INSTALLER NO-GO**.

## Accomplished locally

- Created `lu-desktop/`, a separate Tauri 2 / React 19 app root independent of Jan's frontend/routes/inference commands.
- Native host owns all file-picker commands and returns only opaque model and image IDs.
- Integrated `TrustedInferenceSupervisor<PersistentLlamaBackend>` with native import, MMProj pairing, load/unload, streaming text, cancellation, host-image admission, and basic bounded JSONL chat history.
- React frontend built entirely offline using already supplied Yarn cache packages: `react@19.0.0`, `react-dom@19.0.0`, `scheduler@0.25.0`, `@tauri-apps/api@2.11.1` and esbuild x64 0.25.9.
- Windows engine staging verifies fixed SHA-256 and exact bytes for `llama-server.exe` + three MSVC CRT DLLs; does not search for or download new packages.
- `cargo check --offline --target x86_64-pc-windows-msvc`: PASS on the reconciled R10/R11 local Core; `cargo check --tests` also PASS; `cargo fmt --all --check`: PASS.
- Windows resource compilation was unavailable because bundled Linux LLVM lacks `llvm-rc`; the cross-target **type-check only** used an explicitly labelled placeholder `.res`, which is never acceptable for a linked executable or release. This is NOT proof of a working Windows desktop binary.

## Integration preservation

The GitHub R11 audit branch retained the R9 core; the R10/R11 reconciled core lived only in the local evidence snapshot. R12 stages the specific needed Lu Core source updates (image transport, supervisor, model import, model-turn journal, pinned llama backend and tests) alongside the standalone desktop root. No Jan Tauri application or Cowork execution code is included in `lu-desktop/`, and Cognitum is not built into its runtime.

## Alpha gates

1. Multimodal: source integration has passed local Core ordinary tests, but physical image Q&A remains open.
2. Windows Vulkan: pinned Windows engine cross-build and digest checks exist; physical GPU offload open.
3. Independent NSIS desktop: new Tauri/React source compiles to Windows target; **a real linked Windows Lu.exe and NSIS application installer are not yet built**.
4. Windows AMD real multimodal: open.
5. ANSF persistence / native tool-loop / process cleanup: partially implemented in Core, but app uses JSONL fallback; real 0.5B GGUF native tool test failed (no tool call).
6. Installed-app acceptance: open.

## Critical next actions

- Complete real Windows resource compilation/link with an actual `llvm-rc` or equivalent; never use R12 typecheck placeholder for shipping.
- Build and package the independent Lu Desktop exe with its pinned llama-server + DLLs and ensure Tauri resolves all resource paths.
- Complete first-party ANSF conversation persistence and native tool-loop routing in the desktop.
- Run physical Windows installer, Vulkan GPU + GGUF/MMProj image test, tool/cancellation and restart/uninstall acceptance. Windows user's hardware execution cannot be performed by this Linux container.

## Reproducibility

- `cd lu-desktop && npm run build`
- `LU_ENGINE_PACKAGE_DIR=/existing/pinned/lu-inference npm run stage-engine`
- Check `lu-desktop/README.md`; standard Cargo/Tauri build must use a genuine Windows resource compiler. Never treat the local typecheck logs as Win32 runtime proof.

No additional SDK or other user downloads were requested during this R12 source work.
