# Lu Windows Alpha 0.1 — R9 Engineering and Acceptance Status

**Date:** 2026-11-01  
**Working branch:** `lu/alpha-r9-typed-image-boundary-20261101`  
**Verified remote head:** `481d3ac89a12fa0f022cc26ad76ba3a1a64b29af`  
**Release disposition:** **NO-GO**. No accepted Windows Vulkan multimodal Lu Desktop installer exists.

## Existing Lu continuity design

Lu already has ANSF/SQLite searchable conversation data, `ansf_library` indexing, `cross_chat_reference`, and `continuity::ContinuityStore`. The DPCA proposal must extend these systems as an artifact state projection/resumption preflight, not duplicate conversation indexing. No new dependency discovery is justified without first consulting the active R7/R9 artifact handoff. Existing delivered SDK, LLVM, Rust, NSIS, and pinned llama.cpp source are known.

## Concrete R8/R9 source changes

- **R8**, commit `8e3efa6052c74a9a081cd5edaf934bcfd671beff`: one canonical `m-<32 lower-case hex>` to `p-<same 32 hex>` derivation. Model importer and inference supervisor share the same projector filename/reference helper. The earlier R4 `p-{model_ref}` construction does not match PR #106 and must not be resurrected. Three focused Rust 1.98 tests passed in isolation.
- **R9**, commit `1ffa88bdf228e583d983f990e3d58747d33a7ba1`: typed `InferenceImageAttachment` and repeated `InferenceGenerateRequest.images = 5` in Protobuf, central image-ref validation (opaque ref, allowed MIME, SHA-256 digest, per-image/total limits), new source tests, updated model generation constructors.
- **R9**, commit `481d3ac89a12fa0f022cc26ad76ba3a1a64b29af`: explicit fail-closed regression checking an image-bearing request cannot enter the currently text-only bridge and emits no fake `Generating` event. This is source-staged but **not yet compiled** in the full Lu Core crate.
- Nine isolated Rust 1.98 image-reference validator tests passed. No full `protoc`, cargo test on the R9 tree, or Windows target compile was executed in this R9 turn. Do not transfer previous R4's `94 passed` result to R9.

## Strict remaining gates to suitable alpha

1. **One coherent current source tree:** reconcile the remainder of R4 multimodal saved-image, inference-host, supervisor, HTTP streaming, Tauri and React modules into PR #106/R9 semantics without regressing model admission, native authorization, R7's separate Windows FFI crate, or pinned engine rules. Run complete Lu Core test suite and Windows source checks on the combined exact commit.
2. **Actual Windows Vulkan inference worker:** cross-build pinned `llama-server.exe` with GGML Vulkan and all required hash-pinned DLLs/manifest. The Linux Vulkan-built `llama-server` was tested with a real Qwen 0.5B GGUF on CPU and is not a Windows engine or AMD GPU result. Existing extracted MSVC/UCRT SDK inputs were proved in R5; reuse them, do not re-search/re-request.
3. **Native standalone Lu Desktop installer:** build Tauri/React and NSIS with functioning native model import/selection/load, attach-MMProj, prompt streaming, unload/reload, Lu-owned settings and no Jan inference/plugin dependency. Earlier PE/NSIS smoke binaries were not Lu Desktop.
4. **Real multimodal installed acceptance:** on Windows, select a real GGUF and compatible MMProj, load once, generate a nonempty text answer and a genuinely image-influenced answer through Lu's saved-turn -> trusted image bytes -> Protobuf -> llama.cpp chat endpoint; prove cancellation, persistence and restart recovery.
5. **Physical AMD Vulkan evidence:** on the user's Windows 11 Radeon AI Pro R9700, capture GPU device selection and actual layer offload/runtime; SDK presence or a Linux Vulkan binary is insufficient.
6. **Worker/authorization/installer controls:** complete race-free Windows Job Object assignment (R7 post-spawn assignment still has a race), process-tree termination/recovery, conversation-scoped native tool execution, crash/restart behavior, and uninstall/reinstall testing.

## Near-term work order

Keep image-ref admission *fail closed* until host-pinned image bytes and compatible projector/backend are implemented. Then compile/test the integrated Lu Core at one exact Git SHA. Build and package the Windows Vulkan engine with the already delivered toolchain. Finally build NSIS and conduct physical Windows acceptance. DPCA's full native SQLite service is **not a reason to delay** the Windows alpha once the minimal durable handoff/asset preflight is functioning.

## Explicit limitations

R9's typed image fields are a **protocol foundation, not working image chat**. A Protobuf reference cannot confer filesystem access or prove that an image reached the model. No new alpha installer, GPU acceptance evidence, or full R9 cargo result was produced in this step.
