# Lu Windows physical acceptance: GGUF import, model catalog and OpenSSL runtime failure

**Observed:** 2026-10-31 evening Arizona (screenshots labelled 2026-11-01 UTC)  
**Operator test:** Windows 10 Home x86-64, AMD Ryzen 5 5500, Radeon AI Pro R9700 (reported by Lu System Monitor). This is **not** the prior GitHub Windows Server 2025 acceptance environment.  
**Installer tested:** successful native-only run [41261058985](https://github.com/vjmichael/jan_alt/actions/runs/41261058985), source `dc8ac3b5c0dbbbe30db22ab3f2bf98e77dffc23a`, installed NSIS SHA-256 `5a3ace441b3dc89bdde7c5dc20a338de151741c023627b665a8c1d5420743d4a`.  
**Repair branch (not shipped):** `work/lu-win-physical-gguf-registration-20261031`.  
**Release disposition:** **WINDOWS PHYSICAL ALPHA NOT ACCEPTED**. A headless/runner GUI success is not a Windows 10 install-and-load pass.

## Observed facts from operator screenshots

1. Lu launched and displayed the chat UI; native picker initially showed **No admitted GGUF** and explained that it only enumerated `%APPDATA%/Lu/data/lu-models`.
2. `Settings > Llama.cpp > Import Model` reported `Failed to read model metadata: Unknown error` for multiple GGUF files, including Qwen3.8-27B, Qwen3.6-35B and Bonsai-27B. Associated `mmproj-*.gguf` files also gave `MMProj Validation Error`.
3. Directly placing a Bonsai text model in Lu's `lu-models` directory and using the native selector made the model appear (no metadata-import proof). The user then selected **Load**. The Windows loader displayed `llama-server.exe - System Error`: `libssl-3-x64.dll was not found`.
4. The Settings assistant chooser still offered **Jan**; the separate System Monitor title still read **System Monitor - Jan**. These are outstanding UI/branding inheritance issues, not proof the missing OpenSSL dependency originated in Jan.
5. The monitor reported an R9700 Vulkan device, but the native GGUF backend in the tested installer is expressly **CPU-only** (hard-coded `--n-gpu-layers 0`). A separate Settings GPU widget reported `Failed to load llamacpp backend`; this is the inherited plugin, not proof the native Lu supervisor failed GPU discovery.
6. The prompt remained unsent in the screenshot. **No physical-machine Bonsai inference success, multimodal projection, or GGUF tool turn is proven.**

## Source-verified diagnosis

- Native-only builds deliberately omit `tauri_plugin_llamacpp::init()` under `lu-distribution`, but `ImportLlamacppModelDialog` still calls `@janhq/tauri-plugin-llamacpp-api` and the old provider service for metadata. Hence the generic errors are a known unsupported path, **not reliable evidence the selected GGUF files are corrupt**.
- `LuInferenceDesktopState::initialize` only scanned the host-created `lu-models` folder, and returned **no supervisor at all** when empty. The chat's Refresh button only queried that already-initialized state. An external model could not be enrolled in the live catalog, and copying a file into the directory required a process restart.
- The pinned CPU llama.cpp source `7fe450e19305b828c199d602c23a8337aaa1f03b` defines `LLAMA_OPENSSL` **ON by default** in its CMakeLists; its `vendor/cpp-httplib` optionally links `OpenSSL::SSL` and `OpenSSL::Crypto`. Lu's staging script previously set no `LLAMA_OPENSSL=OFF` and copied only DLLs adjacent to the compiled `llama-server.exe`. The successful runner's package log recorded one engine component, consistent with an OpenSSL DLL being resolved from its host PATH but not bundled. The user's missing `libssl-3-x64.dll` popup independently confirms a real install-side dependency failure.
- OpenSSL is not required for Lu's current local authenticated `127.0.0.1` HTTP inference transport. The appropriate targeted fix is to **build without optional OpenSSL and reject direct or delay-loaded OpenSSL DLL dependencies**; do not tell the operator to download DLLs from untrusted websites.

## Staged repair (isolated branch; unaccepted until independently tested)

1. `inference_supervisor.rs`: allow an explicit initially empty host catalog and register separately admitted models; preserve the old constructor's fail-closed empty rejection for other callers. Add regression tests for unknown IDs, duplicate IDs and load/unload.
2. `lu_inference.rs`: add native OS picker `lu_inference_register_model` restricted to the trusted main window, admit the selected original GGUF only after existing canonical path and bounded header validation, persist a capped private user-selected model list, and re-validate external references at startup. No WebView/DLC/model string can choose the filesystem path in this command. MMProj files are not text model entries.
3. `LuNativeModelPicker` and `luInference.ts`: offer **Add existing GGUF**, update the live catalog after native registration and explicitly disclose CPU/text-only limitations. No hidden Jan fallback and no multi-gigabyte copy.
4. `ImportLlamacppModelDialog`: in Lu-branded builds, replace the inherited Jan metadata-import flow with the Lu native OS picker and text-only limitation. The original Jan dialog remains in non-Lu builds.
5. `package-lu-inference-engine.ps1`: pass `-DLLAMA_OPENSSL=OFF`, verify CMakeCache, and invoke a bounded static PE import checker before staging. `check-windows-engine-imports.mjs` detects direct and delay-loaded `libssl*`/`libcrypto*` DLLs even if the CI runner provides them globally. Regression tests include deliberate missing-DLL fixtures.
6. Native protocol authorizations, model-selected native tools, repair retry logic, and original Windows alpha branch are **not changed**.

## Required verification before promotion / new installer

- **Source:** Windows Rust 1.98 `lu-core` regression tests and Lu desktop `cargo check --features lu-distribution --lib`; frontend build; Node synthetic direct/delay PE import tests; PowerShell script syntax.
- **Packaging:** produce a new pinned CPU engine and independently inspect its real PE direct/delay imports; its complete signed/hash-pinned package must have **no OpenSSL load requirement**. A successful CI host launch alone does not satisfy this.
- **Windows 10:** clean install without globally installed OpenSSL, native picker choose existing GGUF **outside** AppData, immediate catalog/Load, actual CPU inference, conversation persistence, normal exit/restart. Test a small text GGUF first; then Bonsai-27B and Qwen architecture support one at a time. Record exact incompatibility or resource failure without guessing.
- **Windows 11:** repeat GUI real-GGUF+tool+visible cold restore, no Jan/Cowork runtime and no unauthorized tool.
- **Multimodal and performance:** MMProj pairing and CPU/Vulkan/GPU offload are **separate future feature work**, not proven by this repair. Do not claim Qwen3.8 multimodal support or 27B acceptable latency from a 0.5B CPU smoke.
- **Security:** test symlink/reparse path rejection, edited/deleted registered file, corrupted/oversized JSON registry, duplicate selections, selection canceled, no model-supplied paths, no worker starts during failed admission; user profile upgrade/uninstall remains safe.
- **Branding:** rename residual Jan assistant and System Monitor window via separate approved UI inventory, retaining Apache-2.0 provenance in code and notices.

**Engineering conclusion:** Existing runner G1–G4 success is valid for its specific package/model/OS but **does not close the real Windows 10 operator acceptance gate**. The repair remains a branch until new source evidence and physical execution are complete. GitHub is the source/evidence repository; it is not a substitute for real local development or user-device validation.
