# Lu Alpha Native Replacement — Engineering Decision (2026-11-01)

**Status:** user-approved direction; **implementation in progress**, not an accepted installer.

## Decision

Lu must become its **own application**, not a Jan-branded application with a
second inference path. Existing Jan source is a migration reference and must
not own any critical Lu runtime route. GitHub stores the repository and runs
Windows-only packaging/verification when helpful; development and local
cross-platform tests stay independent of the CI service.

### Current evidence

- Windows screenshots show main GGUF imported into `lu-models`, while model
  activation remains a separate **Load** operation and chat opt-in stays off.
  An admitted/imported GGUF **does not prove** weights are loaded, an answer was
  generated, or a native tool ran.
- The old **Settings > Llama.cpp > Import Model** uses Jan plugin metadata
  commands unavailable in Lu distribution. The draft Lu routing repair
  redirects this entry to the trusted Lu native importer.
- Current Hardware settings use Jan's llama.cpp backend device list,
  returning "Failed to load llamacpp backend." That is not reliable evidence
  of Windows GPU presence or absence. Route Lu to first-party diagnostics.
- The earlier Lu package explicitly built llama.cpp with `GGML_VULKAN=OFF`
  and launched `--n-gpu-layers 0`. This is CPU-only, irrespective of the user's
  graphics hardware. This draft changes those settings for Windows to
  `GGML_VULKAN=ON`, requesting 99 GPU layers and pinning the Vulkan manifest.
- The accepted version of `llama-server` supports an explicit
  `--mmproj <path>` pairing, but Lu's *current* model-import and supervised
  inference pipeline do not yet attach projectors or send image/audio content.
  Do not label a text-only session "multimodal" just because Qwen weights can
  potentially support it.

## Non-negotiable Lu Alpha 0.1 acceptance

1. **Independent packaging:** Native Lu-Desktop executable + Lu GGUF engine;
   no Jan worker, Bun, UV, Cowork execution, provider manager, model picker or
   Llama.cpp command router in the installed Lu application.
2. **GPU required:** Windows x64 package contains a genuinely Vulkan-built,
   hash-verified llama.cpp backend. On a real AMD Vulkan-capable machine,
   device enumeration and actual model inference must show **verified offload**.
   Mere device presence, Vulkan SDK presence or successful CMake compilation
   is not enough. GPU-less CI may test the CPU fallback separately, but cannot
   approve the GPU acceptance gate.
3. **Text generation:** Import external GGUF with Lu's trusted file picker,
   copy with a bounded host-owned write, admit, load, get a model response,
   unload/reload, restart, persist and recover the conversation.
4. **Multimodal:** Explicit user-selected MMProj paired to one admitted model;
   verify projector GGUF and trust boundary, verify compatible runtime, load
   with `--mmproj`. Support image content in Lu UI and the native
   conversation/request protocol. Never import/project audio/video via an
   unsupported route or silently drop user attachments.
5. **Native tools:** Conversation-scoped Lu Protobuf IPC, host-authorized
   invocation, durable cancellation/revocation/recovery; no MCP requirement.
6. **User experience:** Lu-owned Settings, Hardware, Models and Chat UI. No
   visible Jan-only controls or broken legacy screens. Respect file-save
   preference for user deliverables, not hidden scratch locations.
7. **Security and provenance:** Pin model and engine identities across
   sessions, fail closed if packager or OS containment is missing, and retain
   Apache-2.0 Jan-origin notices for genuine derivatives.
8. **OS matrix:** Windows 11 x86-64 physical AMD GPU (authoritative), Windows
   10 x64 compatibility when supported, disposable GPU-less Windows VM for
   installer/uninstall, Linux local developer tests. CI cannot simulate a
   physical AMD Vulkan result.

## Replacement order

- R0: Native UI shell owns model import/load/chat/hardware; Jan settings
  entry points redirected or removed. **Started**, not completed.
- R1: Lu native GPU build and hardware adapter; Vulkan physical verification.
  **Source draft staged**, hardware acceptance pending.
- R2: Lu native model registry, explicit MMProj admission/pairing; image-bearing
  Protobuf conversation transport and llama.cpp multimodal endpoint.
- R3: Lu settings, conversation persistence, attachments, model management and
  download/selection independent of Jan; retire Jan service hub and inherited
  web routes. Keep separate user convenience Documents output destination.
- R4: All remaining first-party capability tools, profiles, updater,
  synchronization and optional generic DLC interface belong to Lu. Cognitum
  remains a separate optional DLC, never hard-wired into vanilla Lu.
- R5: Build Lu from an isolated native desktop crate/frontend root that does
  **not** compile Jan plugins or Jan services at all; verify static dependency
  graph and installed binaries. Only then retire the preserved reference fork.

## GPU vs multimodal independence

A main GGUF may generate ordinary **text** without its projector; that
does not supply image/video/audio understanding. MMProj is never loaded
automatically by the current Lu import system. For the new Lu path, users must
explicitly select a model/projector pairing; Lu must remember the pairing and
pass it only to a host-verified runtime. Confirm Qwen3.8 architecture and
projector compatibility on physical Windows; do not infer from filenames.

## Known independent blocker in previous Windows NSIS

The November 1 CPU installer produced a runnable Windows executable and
successfully tested profile restart/uninstall. Its installed real-GGUF tool
gate stopped **before inference** because a `cargo test --locked` command
wanted to refresh lu-core's separate Cargo.lock. This is a harness error,
not evidence of Qwen generation failure. The next test fixes that switch and
must independently complete the real model/tool acceptance.

## Source references

- ggml-org/llama.cpp `docs/build.md`: `GGML_VULKAN`, device enumeration
  and GPU offloading.
- ggml-org/llama.cpp `docs/multimodal.md`: explicit `--mmproj` and
  `/chat/completions` image input.
- lmstudio-ai/lmstudio-js and lmstudio-ai/lms: public model lifecycle and
  client APIs for design reference. LM Studio's proprietary desktop engine
  is **not** an importable open-source codebase.
- Jan Apache-2.0 reference: preserve license and attribution for inherited
  source while replacing its execution and UI integrations.
