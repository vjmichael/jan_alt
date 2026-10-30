# LU-ENG-001 — Windows 11 Enterprise x64 packaged inference worker exits 0xC0000135

Date: 2026-10-29
Evidence: user screenshots from **installed Lu 0.8.5 x64 Vulkan development preview** in disposable Oracle VirtualBox Windows 11 Enterprise. The installer artifact was built from commit `d6edb050d797e0d492223db6da8f335dd7c37ce1`.
Test: AMD Ryzen 5 5500 virtual CPU, 4 vCPU, 8.71 GiB installed RAM, no dedicated GPU, AVX2 present.
GGUF: official Qwen2.5-0.5B-Instruct `qwen2.5-0.5b-instruct-q2_k.gguf`.

## Observation

- The Lu NSIS installer ran and the desktop/onboarding/Settings rendered.
- Settings -> Hardware displayed `Failed to load llamacpp backend` when probing GPUs, and indicated CPU execution.
- Importing the small GGUF succeeded and showed the model under local Llama.cpp with a Start button.
- Clicking Start or attempting a chat response did **not** start the model. Lu displayed:
  `Failed to create model: Failed to start model: jan-llama-worker did not come up: exited before serving (exit code 0xC0000135)`.

Microsoft defines `0xC0000135` as `STATUS_DLL_NOT_FOUND`. This indicates that Windows could not locate a required DLL or transitive dependency during worker process initialization. It does not yet identify the DLL and does not establish a corrupted GGUF, Vulkan-only failure, inadequate RAM, or specific VC++ runtime version.

## Code-level findings

- The original installer smoke in `scripts/smoke-lu-windows-x64.ps1` only checked that installed `jan-llama-worker.exe` and other binaries existed and were AMD64 PE binaries, then uninstalled. It did not launch the worker.
- The subsequent `lu/windows-x64-preview-build` branch has an installed real-worker probe in `scripts/check-lu-windows-engine-worker.ps1`, and its NSIS workflow calls it with `-ProbeWorker`. However the probe inherited the full Windows CI PATH, including development-tool folders. LLVM, Vulkan and compiler toolchains on the runner may supply libraries absent in a clean Windows VM.
- The ggml stage includes a known prior Windows `libomp.dll` omission workaround (`GGML_OPENMP=OFF`); this does **not** prove libomp is responsible for this exact failure.

## Remediation in this isolated PR

- Run the installed worker in its own directory with a restricted DLL search PATH consisting only of installed worker directory and Windows system directories.
- Remove build-machine GGML/Vulkan/CUDA path overrides from the child probe environment.
- On early exit before the handshake, report full Windows exit code and explicitly distinguish `0xC0000135` from generic worker startup failures.
- Do not alter the app's inference backend or claim to have identified the exact DLL. Do not add arbitrary downloaded DLLs to the installer.

## Acceptance gates

- [x] Repro captured on installed Windows 11 x64 VM (failed worker and model).
- [x] CI probe hardening committed to an isolated branch.
- [ ] Quick PowerShell syntax/safety gate passes on exact SHA.
- [ ] Real installed worker probe passes on an exact build with clean runtime PATH and produces handshake + authenticated loopback response.
- [ ] Fresh disposable Win11 VM with no GPU loads the same small GGUF and generates a persisted assistant reply.
- [ ] Repeat with a second chat message and restart to verify recovery.
- [ ] Confirm DLL identity (using Dependency inspection / OS loader diagnostics) before changing engine bundling or VC++ prerequisite behavior.
- [ ] Reconcile with AX/DX integration and retain Jan Apache-2.0 notices.

The user VM is not accessible to the connector. This branch only changes CI probe behavior and evidence quality; **root cause and working patch for installed engine remain unverified**. Do not touch protected main, the user's physical Windows profile, or Cognitum.
