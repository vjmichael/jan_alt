# Lu Windows development installer

> **Historical development-preview instructions, not revised Alpha release
> acceptance (2026-10-29).** The new Alpha will contain **no Cowork or
> non-inheritable Jan features**, no Jan fallback, and must include
> end-to-end fault-localizing diagnostics. The old unsigned preview's
> Jan-derived worker, CLI paths and optional performance comparisons are
> development context only, **not** accepted dependencies or testing
> features for the new Cowork-free Alpha. Do not treat any existing
> installer artifact or W03/W06 pass as release eligibility. See the
> [revised Alpha decision](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md)
> and [DX specification](lu-alpha-diagnostics-fault-localization-2026-10-29.md).


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


## First launch and AMD GPU smoke test (Windows, no command line)

This test needs an actual Windows computer with the target GPU. **CI cannot substitute for it.** Use the built-in Lu UI; no repository checkout, Rust compiler or PowerShell script is needed. Preserve the original Jan app and its profile as a baseline.

1. **Install separately.** Close Jan before setup, download the artifact from the successful Actions run, extract the ZIP, verify the checksum if possible, and run the Lu `.exe`. Unsigned-development Windows warnings are possible; do not disable security protections to get around them. Confirm the app is named **Lu**, not Jan, and that launching Lu does not uninstall or overwrite Jan.
2. **Cold startup.** Launch Lu, note whether the window and settings load without an error or blank screen. Close and reopen once. If it fails, record the exact message or a screenshot.
3. **Device enumeration.** Open **Settings → Hardware**. Check whether your physical AMD Radeon GPU is listed and whether a **Vulkan** backend is offered. Record the exact GPU name, backend tag, VRAM/free-memory values and any error banner. If the list is empty, report that fact; do not infer a broken driver solely from an empty list.
4. **Controlled inference.** With a compatible *small* GGUF model available (or downloaded within Lu), activate/select the Vulkan GPU if available. Start a new local conversation and submit a short prompt (e.g. `Reply with exactly: LU-GPU-OK`). Verify that text actually streams. Repeat the same prompt once. Record the model/quantization, backend selection, observed latency/throughput if exposed, and any model-load errors.
5. **Recovery.** Stop generation, close Lu normally, restart Lu and generate again using the same model. Check for an orphaned engine, stuck model or lost session state. If an error occurs, stop and collect the screenshot/error before retrying.
6. **Optional CPU comparison.** If the Hardware screen safely allows disabling GPU offload, repeat the same short prompt on CPU and note the difference. This is a basic comparison, **not** a full reproducible benchmark. Avoid modifying low-level drivers or editing files to force a backend.

**Success criteria:** Lu installs beside Jan, opens twice, enumerates expected devices, loads a model, generates twice on the selected inference backend, and can restart and generate again. Mark each step **pass / fail / not available**, with actual evidence. A GPU listed in Settings proves **enumeration only**, not successful GPU model execution. A Vulkan-capable binary is **not** proof of ROCm support or automatic GPU selection. Task Manager GPU usage/VRAM activity is additional supporting evidence, not sufficient proof by itself.

**Useful evidence to share:** a screenshot of Lu's **Settings → Hardware**, the model name and quantization, a screenshot of the successful response or the full error, and whether restart/retry worked. Keep private model paths, credentials, local tokens and personal conversations out of screenshots and logs.

**Current limits:** This unsigned Vulkan preview is not yet a signed production release; separate ROCm/CUDA builds, verified automatic backend choice, thread-count autotuning, multi-model resource contention and Windows+Ubuntu smoke matrices remain future work. Never describe a hardware test as passed based on CI compilation or device enumeration alone.
