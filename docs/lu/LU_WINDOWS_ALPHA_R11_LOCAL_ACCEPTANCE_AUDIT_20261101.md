# Lu Windows Alpha R11 — Local gate closure audit

**Date:** 2026-11-01  
**Release decision:** **NO-GO** — no complete Lu Desktop Alpha installer has passed Windows AMD GPU and GUI acceptance.

## Inputs and provenance

Continued the recovered `/mnt/data/lu/alpha-work` R10 local integration, using previously supplied SDK, MSVC, LLVM, Vulkan SDK, llama.cpp source and offline Rust crate cache. No dependency download or package rediscovery was needed. The R10 source includes R4 multimodal HTTP/saved-image logic, PR #106 explicit MMProj binding, R8 canonical projector identities, R9 typed image references, and Windows Job Object FFI in a separate crate. This is a local source candidate; it has **not been established as merged into main GitHub** or as a complete Tauri desktop build.

## Rechecked evidence

- `cargo test --offline --all-targets` on the unified local `lu-core` source: **326 passed, 0 failed, 1 ignored** in 64 suites. The ignored test is the separate real-GGUF native-tool acceptance test, run manually afterward.
- `cargo check --offline --target x86_64-pc-windows-msvc` for Lu Core with warnings denied: **PASS**.
- Vulkan-capable pinned llama.cpp Windows cross-build: **`llama-server.exe` exists**, 55,099,904 bytes, `PE32+ AMD64`; source revision `7fe450e19305b828c199d602c23a8337aaa1f03b`. Packaged `llama-server.exe`, `msvcp140.dll`, `vcruntime140.dll` and `vcruntime140_1.dll` all match exact-size SHA-256 entries in `package-windows-vulkan/lu-inference/manifest.json`.
- `vulkan-1.dll` is an OS/runtime-provided dependency, not an included redistributed Windows Vulkan loader. The Windows Vulkan import library was assembled from Linux Vulkan-loader symbols; actual Windows Vulkan ABI/runtime verification is still required.
- Local Linux real GGUF `llama-server` passed the earlier text/streaming tests through Lu's persistent worker and inference supervisor; those tests did **not** establish AMD GPU offload or MMProj image understanding.
- NSIS generated `Lu_Windows_Vulkan_Engine_Core_Evaluation_NOT_ALPHA.exe`, SHA-256 `3548d854c7f7357014c7d9c8bc67ff6bc6ee202a8d4fba079a476f73a71c77ff`. This contains an evaluation payload, **not** the production Lu Desktop frontend and **must not** be passed as an alpha installer.

## Failure diagnosis: model-driven native tool test

The opt-in `real_gguf_tool_json` test ran the actual Qwen2.5-0.5B Q2_K GGUF against checksum-pinned `llama-server`, supplying a file marker accessible only to `lu.files.read_text`. It failed with **1 generation, 0 tool calls**, where the acceptance criterion is **2 generations and 1 tool call**. The raw model JSON was `{"kind":"final","text":"/workspace/notes.txt"}`. The host did **not** execute the file-read tool or fabricate a successful result. The 0.5B model's tool-selection failure is real; acceptance stays failed until a capable target model generates and completes a legitimate tool loop.

A diagnostic-only branch of the test logs bounded model records when tool-use expectations are not met. No threshold was lowered, no tool invocation was fabricated and no successful response was substituted.

## Gate decisions

| Gate | Status | Next requirement |
| --- | --- | --- |
| 1. R4+PR106+R9 source integration and tests | **Partially satisfied** | Core source unified and ordinary tests pass; full desktop and real vision test still open |
| 2. Windows Vulkan engine and dependency package | **Cross-build and hash verification satisfied** | Must run on real Windows AMD Vulkan device; Vulkan ABI loader, offload and component signing remain unverified |
| 3. Actual independent Lu Desktop NSIS | **OPEN** | Build the complete Tauri+frontend, replace remaining Jan-owned pathways, create true Lu installer |
| 4. Real Windows GPU text + MMProj vision inference | **OPEN** | Run GGUF+projector with an image-dependent question, record AMD Vulkan offload |
| 5. Persistence, native tools, recovery | **PARTIAL** | Unit tests pass; real model tool-use test failed; physical Windows worker containment and restart remain unverified |
| 6. Installed app acceptance | **OPEN** | Install/launch/chat/restart/reinstall/uninstall the *true* Lu Desktop package |

## Known environment blockers

This execution environment is Linux, with no Windows desktop session, no physical AMD R9700 GPU, and no complete independent Lu frontend checkout in the local R10 core workspace. GitHub network cloning is DNS-blocked. The evaluation NSIS package alone cannot close gates 3, 4 or 6. No additional SDK is currently identified as necessary; the missing work is integration and physical Windows verification.

## Reproducibility

`r11_verify_gates.py` validates the Windows package and manifest sizes/digests, PE machine type, offline test log results, cross-target build result, and the real GGUF test's observed failure. `R11_ACCEPTANCE_GATE_EVIDENCE_20261101.json` captures the machine-readable decisions. The local source snapshot in the accompanying ZIP deliberately excludes vendored crates, GGUF weights and proprietary MSVC/SDK/Vulkan binaries.

**Next engineering action:** build the independent Lu Tauri desktop from the reconciled source; use this same hash-pinned Vulkan engine in the bundle. Do not present the evaluation installer as user-acceptable alpha. Physical acceptance on Windows with a compatible multimodal model and MMProj is mandatory before closure.
