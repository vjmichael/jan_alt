# Lu Native Inference Integration — P3

> **Historical P3 development evidence only (superseded for Alpha 2026-10-29).**
> The updated Alpha must exclude **Cowork and all non-inheritable Jan
> features** from the build/runtime and verify a Lu-owned chat bootstrap,
> engine/native tool path, and end-to-end diagnostic fault localization.
> Older Jan compatibility mode, feature-flag fallbacks and a Jan-provider
> mock bootstrap are **not valid Alpha acceptance**. See
> [Alpha rebaseline](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md)
> and [DX acceptance](lu-alpha-diagnostics-fault-localization-2026-10-29.md).
> Benchmark comparisons remain for a later revision.


## Goal and retained proof

P2 verified native CPU inference using a Lu-supervised persistent llama.cpp
process on Windows x86-64. The passing real-model acceptance run is
[40635612318](https://github.com/vjmichael/jan_alt/actions/runs/40635612318):
two different prompts, one stable engine PID, in-flight cancellation, unload,
crash detection and explicit reload. P3 turns that working **standalone** core
into a genuinely Lu-owned desktop inference path without silently falling back
to Jan's model manager.

## P3 P0 — Protobuf-native orchestration contracts

- `src-tauri/lu-core/proto/lu/v1/core.proto`: versioned `InferenceFrame`,
  typed `Load`, `Generate`, `Cancel`, `Unload` and `Status` requests,
  and typed streamed `State`, `TextChunk`, `Finished`, `Failure` and
  `ResourceUsage` events.
- `src-tauri/lu-core/src/inference_wire.rs`: frame-size, prompt-size, token
  count and reference-name validation; strict version and canonical Protobuf
  round-trip; unknown/duplicate wire fields rejected, as at the CE worker boundary.
- `src-tauri/lu-core/src/inference_bridge.rs`: separates the trusted
  `InferenceBackend` host from typed wire traffic, converts live output into
  correlated, sequenced Protobuf frames, emits completion or sanitized failure,
  checks host session IDs, and **rejects projector requests** for the CPU
  text-only engine. Uses the existing `InferenceHost` backend interface.
- These are internal Protobuf messages. JSON conversion belongs exclusively
  at external model APIs and a deliberately defined desktop WebView boundary;
  it is not the native Lu inference transport. There is no MCP server.
- **Current implementation boundary:** the bridge accepts an admitted host
  model handle and emits typed frames. It does not yet allocate host-owned model
  catalog references, grant engine permissions, instantiate the verified engine
  from the installed package, route production Tauri commands, or attach a
  desktop chat to this path. These remain P3 work, not implicit passes.

## P3 integration gates (sequence)

1. **P0 contract gate:** Rust formatting, core test suite, Clippy and
   Protobuf wire regression tests, with no regression to P2.
2. **P1 host authority:** package-manifest verification for the complete
   installed engine (including DLLs); allowlisted model catalog with host-issued
   opaque reference and approved user-selected model root. Match every
   requested reference to the actual admitted file. Host controls backend,
   context window and resource limits; model text cannot install or switch engines.
3. **P2 desktop IPC:** a Tauri-owned session supervisor and cancellation
   registry, with a model worker that does not block the WebView event loop.
   Expose a narrow user-authorized load/status/generate/cancel/unload interface
   and emit stream events after host-side Protobuf validation. Treat UI JSON as
   a boundary adapter, not native orchestration.
4. **P3 desktop adoption:** route an opt-in Lu chat/model picker to the new
   native path while retaining Jan's preexisting path as a separately selectable
   compatibility fallback until its removal passes acceptance. Enforce truthful
   loading, generating, cancelled, failed and unloaded UI state.
5. **P4 desktop acceptance:** Windows WebView2-to-Tauri-to-native-engine-to-
   WebView2 **real GGUF** two-turn test, no Jan inference-manager calls,
   identity-linked transcript capture, cancellability while streaming,
   native engine crash/recovery, and no orphan processes.
6. **P5 release gate:** Windows kill-on-close job objects for subprocess
   descendants; sidecar integrity; protected backend credentials; loopback
   origin/process attestation or a private authenticated local transport;
   untrusted GGUF handling; RAM/VRAM admission; packaging/installer pass.

## Deferred by design

- Switching between installed inference engines is a later backend registry
  gate; P3 must not be coupled to Ollama/vLLM services.
- A model's `mmproj` companion may be admitted separately, but actual
  projector attachment, media payloads and multimodal correctness remain an
  explicitly separate acceptance suite.
- Reproducible benchmark baselines, engine throughput, peak memory, model
  provenance, quality and failure comparison are built on verified P3
  instrumentation, never inferred from output byte counts.

**Acceptance policy:** passing Rust contract tests means only contract tests
passed. P2's standalone native generation pass cannot stand in for P3's
desktop-to-engine pass.

### P0 host-binding security refinement

The native bridge now requires the trusted caller to supply the **already resolved
model reference** alongside `AdmittedModel`. If it differs from the frame's
model reference, load is denied before the engine sees a file. The bridge also
compares the proposed context window with its host-provisioned limit, and
refuses unverified projector attachment. Unit tests cover mismatched model
references, mismatched context windows, and unauthorized sessions. This does
not replace the still-required host-controlled model catalog and UI grants.

### P0 cancellation delivery

The bridge provides a `signal_cancel` operation which verifies the
host-registered session and generation IDs and trips the exact generation's
shared `Cancellation` token. It requires **no lock on the currently
generating inference host**, avoiding a cancellation deadlock. This is
explicitly a cancellation *request*, not proof that llama.cpp stopped;
the final `Finished` or `Failure` event and engine supervision determine
completion. The desktop supervisor and token registry are still P1/P2 work.

## P3 P1 — Trusted desktop supervisor implementation

New Lu core module `inference_supervisor.rs` connects
`InferenceBridge<PersistentLlamaBackend>` to an immutable, host-approved
model catalog and a single retained engine session. It takes a **trusted
backend factory**, not an executable path from Protobuf or a model tool call.
Operations include `load`, `reserve_generation`, `run_reserved`, `cancel`,
`unload`, `status`, and read-only model IDs.

The session controller uses a separate short-lived mutex for active generation
identity and the cancellation token. A generating worker owns the engine mutex;
the cancellation route **never locks the engine**. A generation is reserved
synchronously before its ID is returned to the WebView, making immediate
cancellation possible before the worker even starts. A drop guard releases
the active reservation on failure or panic; unloading rejects active work.

`src-tauri/src/core/lu_inference.rs` exposes six Tauri commands:
`lu_inference_models`, `lu_inference_status`, `lu_inference_load`,
`lu_inference_generate`, `lu_inference_cancel`, and
`lu_inference_unload`. Its native `lu-inference-proto` event forwards
canonical Protobuf frame bytes (serialized as an array at the WebView
boundary); `lu-inference-error` reports a sanitized generation failure when
no terminal frame was delivered. Commands accept only opaque model/session
references and generation text/limits, **never an arbitrary model path,
engine path, DLL location, SHA-256 checksum or projector location**.

### Deliberately fail-closed packaging

The initial desktop adapter is enabled only in a `lu-foundation` build whose
release process sets the compile-time `LU_TRUSTED_LLAMA_SERVER_SHA256`
checksum. The binary must exist as a regular file inside Tauri's resource
directory at `lu-inference/llama-server.exe`; it is SHA-256 checked again
by the actual backend. This is NOT a user-editable config file or a webview
argument. It will remain **unavailable** in the ordinary development build
unless those packaging requirements are explicitly fulfilled. Native inference
is therefore not silently routed back to Jan when the package is missing.

The model catalog is collected at desktop startup from a dedicated
`lu-models` directory beneath the existing Lu app data folder, admits
ordinary top-level GGUF files only through `ModelAdmissionManager`, and
assigns fresh opaque IDs. The user will need to import/copy GGUF models into
that Lu-owned location until the dedicated native model-import UI is built.
The model list currently requires an app restart to refresh. Incompatible
`mmproj` attachment is rejected for this text-only CPU path.

A signed complete engine package (including DLLs), Windows Job Object
descendant confinement, protected llama-server API keys (currently on the
child command line), loopback process attestation, graphics/multimodal support,
and a model picker/chat UI are **separate open release gates**. Host-scoped
Tauri commands are only the desktop IPC foundation; the ordinary Jan chat
screen does not invoke them yet.

### Verification requirements

- Rust core contract/lint tests exercise model admission, single-engine
  admission, one active generation, wrong session/model rejection,
  immediate cancellation, worker error cleanup, and native event frames.
- `examples/inference_supervisor_smoke.rs` runs through a pinned real
  `llama-server` and checks two generations with an unchanged process PID,
  validated Protobuf text/terminal events and proper unload. The Windows CI
  must emit `LU_P3_SUPERVISOR_GGUF_PASS` before real-supervisor execution
  can be claimed.
- `.github/workflows/lu-desktop-ci.yml` must compile the Lu Tauri feature,
  including the new command module, and enforce Rust formatting.
- The final WebView2-to-GGUF GUI test is not covered by these unit/CLI tests.

### Initial desktop principal restriction

The six inference commands are accepted only from the named **`main`**
Lu webview, matching the current `tauri.lu.conf.json` desktop window label.
A secondary window or future DLC Workspace does not implicitly inherit model
load, inference transcript or cancellation authority. Future Workspaces will
need explicit host-issued principal/session grants before joining inference.
The WebView can request only admitted model IDs; the host never accepts
a raw executable or arbitrary filesystem path.

## P3 P2 — Pinned engine package, model picker, opt-in chat routing

### Engine distribution

- `scripts/package-lu-inference-engine.ps1` clones **ggml-org/llama.cpp** at the
  explicit commit `7fe450e19305b828c199d602c23a8337aaa1f03b`,
  rejects a dirty checkout, builds Windows x86-64 CPU `llama-server.exe`
  with CUDA/Vulkan and shared-build defaults disabled, and stages its
  executable and adjacent required DLLs.
- The staging step emits `src-tauri/resources/lu-inference/manifest.json`,
  containing the source commit, architecture and SHA-256 of each component.
  Both the executable checksum and manifest checksum are exported to the
  build environment, where Rust `option_env!` embeds them in the Lu host.
- `src-tauri/tauri.lu.conf.json` bundles the dedicated Lu inference resource
  folder in the Lu Windows NSIS artifact. The preview-installer workflow now
  stages the package *before* building the Rust host and rejects absent
  package digests.
- `src-tauri/src/core/lu_inference.rs` checks the compiled-in manifest hash,
  pinned source commit and architecture, exact component list, and each
  staged executable/DLL hash **before enabling native inference**. Missing
  package or missing hash fails closed. This is not code signing and does not
  yet solve cross-process load races or child-secret command-line exposure.
- The independent disposable Windows CI
  `lu-trusted-inference-package.yml` builds and verifies the source-pinned
  package; `LU_NATIVE_INFERENCE_PACKAGE_PASS` is the desired evidence marker.
  Its first runs must complete before this package is called accepted.

### Native model selection in desktop chat

`LuNativeModelPicker.tsx` appears above the ordinary thread composer in
a Lu-branded desktop. It enumerates host-admitted GGUF model IDs, lets the
user load/unload a model, and has an explicit **Use Lu for this chat**
checkbox scoped to the current thread. No model is auto-activated. On
unload or model change, per-thread Lu routing is cleared. The engine remains
a single host-supervised process shared across turns.

The first Lu model directory is `lu-models` under Lu's separate application
data directory. Copy a plain, compatible text GGUF there and restart Lu
to refresh its startup-time catalog. A native import dialog and live catalog
refresh are still future work. The ordinary Jan model picker remains
unchanged for the compatibility route.

### Desktop conversation route

`CustomChatTransport.sendMessages` checks the explicitly enabled thread
before resolving Jan model providers. If selected, it calls
`sendLuNativeConversation` instead of `ModelFactory`, Jan's llama.cpp
plugin or Cowork/MCP routing. There is **no automatic fallback to Jan** on a
Lu error. The Rust host's six Tauri commands manage model sessions and
generation; it retains native canonical Protobuf internally and forwards
validated, sanitized JSON event projections across the WebView boundary.
The browser tracks exact host-issued generation/session IDs, increasing
sequence values, streams assistant text through the AI SDK message-stream
protocol, and sends Stop requests via the native cancellation command.

**Current limitations:** text-only ChatML-formatted prompts, fixed 256
maximum new tokens in this first GUI adapter, one loaded engine at a time,
no model-specific template negotiation, no native tool calling or multimodal
`mmproj` execution. The UI explicitly labels these limitations and rejects
non-text message parts rather than silently discarding them. Completion,
cancellation and error semantics still require a real end-to-end WebView2
acceptance test.

### Acceptance evidence policy

- Prior P2 core backend and P3 host supervisor native GGUF acceptance passed,
  but **neither substitutes for this packaged GUI integration**.
- The newest `Lu Desktop Integration` workflow must pass frontend tests,
  TypeScript, ESLint, and Windows Tauri host compilation on the exact changed
  source.
- The package workflow must emit `LU_NATIVE_INFERENCE_PACKAGE_PASS`.
- Final P3 release needs an installed Lu WebView2 test: select admitted GGUF,
  load it, generate two distinct replies with unchanged PID, stop an active
  stream, unload, restart and verify no Jan model manager invocation. This
  WebView2 acceptance is **not yet demonstrated**.
