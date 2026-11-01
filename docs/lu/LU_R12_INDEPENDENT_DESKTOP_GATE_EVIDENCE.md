# Lu R12 — independent Tauri/React desktop build evidence

**Date:** 2026-11-01  
**Status:** Development evaluation; **NOT Alpha 0.1 accepted**

## Source and build work

The independent app is under `lu-desktop/`, not Jan's Tauri/Cowork root. It includes a React 19 UI and a Tauri 2 native host that calls Lu's trusted inference supervisor with host-selected GGUF, MMProj, and image inputs. WebView callers do not supply arbitrary paths or engine executables. The Windows Vulkan engine is SHA-256 pinned. The desktop imports and stores model references locally and writes a limited JSONL chat history; **this is not full ANSF conversation integration**.

In this R12 continuation, frontend error handling now retains the prompt and pinned image selection on failed generation; the host has an explicit `lu_release_image` command so removing a displayed attachment releases the registry slot. React offline bundle passed and the standalone UI check script passed **7/7** validations. The local Windows MSVC Rust build linked a development PE executable. The earlier unified Lu Core test suite passed **326 tests**, 0 failures, 1 ignored real-model tool test. That ignored test previously failed because the Qwen 0.5B model answered directly rather than invoking the authorized tool.

A portable NSIS *evaluation* packaging template and hash-enforcing script built an installable Windows NSIS EXE with Lu Desktop, the Vulkan llama.cpp engine, and three MSVC runtime DLLs. The helper verifies each engine file against its manifest before packaging. The Windows desktop executable was cross-linked through a **check-only placeholder resource compiler**, not a real `llvm-rc` or Windows `rc.exe`. Therefore **the installer cannot be called a release or an accepted alpha**. The NSIS evaluation script lives under `lu-desktop/packaging/`.

## Acceptance gates

| Gate | Result |
|---|---|
| 1. Multimodal source integration and Core tests | Core source/tests passing; installed image answer not verified |
| 2. Windows Vulkan engine | Cross-built and SHA-pinned, actual Windows GPU runtime not tested |
| 3. Independent Tauri/React NSIS desktop | Source compiled and dev-eval installer created; release resources and runtime not verified |
| 4. Physical AMD Vulkan and MMProj vision | Unverified, requires test on physical Windows desktop |
| 5. Persistence/native tools/recovery | Partial; JSONL chat and native cancellation exist but full ANSF/tool acceptance outstanding |
| 6. Installed-app use/reinstall/uninstall | Unverified on Windows |

## Correct next work

Replace the placeholder Windows resource compiler with a genuine Windows-target resource compiler, rebuild a signed or developer-evaluation executable with valid resources, then test the development installer on physical Windows: start, Import GGUF, Load, prompt, Unload, Attach MMProj, select image, answer, cancel, restart, check hardware-offload evidence and uninstall. Do not claim Vulkan offload merely because 99 layers were requested. Connect ANSF and authorized native-tool execution before alpha sign-off.

## Reproducibility

Use `lu-desktop/README.md`, `lu-desktop/scripts/stage-engine.mjs`, and `lu-desktop/packaging/build-dev-evaluation.sh` with explicit environment variables. The packaging script rejects a missing binary, mismatched engine hash or missing `README_NOT_ALPHA`. Never accept a binary built with `LU_TYPECHECK_ONLY=1` as a release artifact.

The exact local artifact digests are in `docs/lu/LU_R12_INDEPENDENT_DESKTOP_GATE_EVIDENCE.json`. Source history is on branch `lu/windows-alpha-r12-independent-desktop-20261101`; GitHub is the repository, not the local build hub.
