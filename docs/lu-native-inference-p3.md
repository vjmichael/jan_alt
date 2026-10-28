# Lu Native Inference Integration — P3

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
