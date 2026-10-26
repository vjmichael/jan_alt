# Lu Architecture & Production Roadmap — Revision 0.2

Status: design update, not evidence that the features below are implemented. Applies to Lu's Jan fork.

## Product boundary: model-powered, model-neutral

Lu is a local-first AI desktop **host and orchestration platform**. Its intelligence, prose, analysis and generative decisions depend on the **loaded AI model(s)** and their capabilities; Lu Core is not itself a substitute for an LLM. Qwen is one supported model family, not the exclusive engine. Local and cloud model adapters are interchangeable, and two-model routing may delegate heavy reasoning to a capable model. Distinguish model quality from Lu's UI, policies, tools, retrieval, and inference backend. A model can be evaluated *inside* Lu without claiming the GUI is the model.

Existing architecture boundaries remain: Jan Tauri IPC, Cowork TypeScript agent loop, Rust native tools/policy, ANSF immutable messages and revisions, and app-owned memory. Protobuf for typed internal contracts with JSON adapters at external model/API boundaries. Never turn memory content or chat context into tool permissions.

## Goal: broadly useful, accessible, reproducible research and production

Support ordinary end users, students, researchers, and teams. A simple task (CV/resume, letter, budget, image export) should not require command-line configuration; power users can enable diagnostics and reproducible controlled benchmarks.

### Artifact subsystem (planned)

* Stable Lu Core `ArtifactRequest`, `ArtifactManifest`, `ArtifactResult` and `ArtifactValidation` metadata; production is delegated to replaceable libraries and isolated tool adapters.
* Formats, in priority order: **CSV**, **XLSX**, **DOCX**, **PDF**, **PNG/JPEG**, **SVG**; optionally ODS/ODT and legacy XLS/DOC conversion where needed. CV (curriculum vitae) and resume templates use DOCX/PDF; CSV is a separate tabular format.
* Validate file magic, generated size and schema, formula handling, encoding, printable previews, page counts, spreadsheet value/formula semantics, and path containment. Use temporary files plus atomic publish, typed failure statuses and user-approved destination. Sanitize formulas and external links.
* Deterministic charts, image composition and JPEG/PNG export do **not** require a generative image model. Photorealistic or illustrative original images generally require a separate image-generation model/adapter; respect model availability and licensing.
* Preserve provenance: producing model/backend (when relevant), tool/renderer version, source refs, settings and hash. Document and spreadsheet artifact engines must not be put into Lu's orchestration kernel itself.

### Observability and audit (planned, privacy-first)

* Correlate `run_id`, `trace_id`, `conversation_id`, `model_id`, `backend_id`, `artifact_id`, and scoped ANSF provenance references. Capture monotonic timings, failure classifications, process/resource samples and policy decisions at instrumented boundaries.
* Levels: default minimal local diagnostic metadata; explicit per-run detailed trace with secrets redacted; optional benchmark dataset capture only after review. No implicit cloud telemetry, keylogging, or raw prompt/tool-argument export.
* Lu's own code, IPC, memory and native tools can be observed deeply. GPU/kernel visibility depends on driver/backend; neural internal causal explanations cannot be inferred solely from execution traces.
* Trace retention, quotas, opt-out and deletion, access controls, and immutable audit events should be separately managed; user data never becomes trusted authority through observability.

### Benchmark and comparison modes (planned)

1. **Lu-common-denominator mode**: evaluate multiple interchangeable models under the same Lu task harness, tools, policies, retrieval configuration and artifact validators; report per-model strengths and weaknesses. The GUI/runtime overhead should be measured separately.
2. **Cross-client mode**: compare a model/task inside Lu with another AI GUI/client. Declare whether prompts, samplers, tools, retrieval, system policies, token accounting, runtime hardware, inference backend and versions match; report unmatched variables explicitly and never call an uncontrolled comparison apples-to-apples.
3. **Diagnostics mode**: inspect one run's tool decisions, errors, timings and redacted trace.

For reproducibility store benchmark dataset revision and hashes, canonical test cases, expected and measured outcomes, model names/versions/quantization, backends, token budget, decoding parameters, hardware, thermal/power environment, concurrency, warmup and run counts, seed where available, raw scored outputs subject to consent, and statistical intervals. Distinguish determinism from variability; no claim of general model superiority from one suite. Reports as CSV/JSONL/Parquet and optionally XLSX/PDF.

### Teacher / dataset-production mode (planned)

* Input: user-approved demonstrations, ANSF sources, validated tool outcomes and benchmark cases.
* Pipeline: select -> de-identify and permission/license filter -> annotate provenance -> deduplicate -> verify with tests/human approval -> split train/validation/test to prevent leakage -> emit schema-versioned JSONL or Parquet datasets and manifests.
* Target curricula: supervised task examples, tool-use imitation, preference pairs, evaluations and graded skills. Synthetic reasoning explanations must be labelled as generated explanations, not hidden neural chain-of-thought transcripts.
* Training itself is an **optional external adapter** (e.g. LoRA/PyTorch). Teacher Mode can prepare datasets without training any model. Generated material does not automatically retrain Lu's active model or enter trusted ANSF facts. User opt-in controls capture, release and export.
* Observe & Learn remains a separate consent-driven desktop demonstration source, **not** an always-on recording system.

### Proposed boundaries

`Lu Core -> CapabilityPolicy/Provenance/Artifact contracts/Trace schema/Benchmark protocol/Teacher export contract`

`Adapters -> local/cloud model backends; PDF/DOCX/XLSX/CSV writers; graphics renderer; profiling drivers; benchmark evaluators; dataset exporters`

`UI -> everyday generate/export actions; opt-in diagnostic/benchmark lab; explicit Teacher curation and approvals`

### Implementation order

1. Finish ANSF Memory Worker: archived read views, manual trusted-host checkpoint capture **and read-back**, continuity source checks and Windows smoke/security review.
2. Add minimal, privacy-preserving trace IDs and structured outcome events to core/IPC.
3. Add artifact contract and CSV writer first, then DOCX/XLSX/PDF and deterministic graphics.
4. Add model-neutral benchmark harness and reproducible reporting; distinguish Lu-as-common-harness from cross-GUI comparisons.
5. Add opt-in Observe & Learn / Teacher export pipeline and optional fine-tuning integrations, only after provenance and redaction tests.

## Non-goals and acceptance gates

Do not merge unfinished Lu features solely because design is documented. No silent user or model authority elevation, silent cloud upload, autonomous retraining, purported reading of hidden model cognition, or unsupported claims about image generation. CI plus real desktop tests, permissions audit, signed-commit requirements and comparative benchmark validity checks remain release gates.

## Host authority and HDC-assisted context association — Revision 0.3 addendum

An HDC/vector-symbolic system may be valuable as a **candidate discovery and relationship reasoning layer**. Bundling project, task, conversation, resource type and sensitivity symbols could efficiently retrieve related checkpoints, propose links, identify possible data-classification mismatches, and produce explainable symbolic labels. Evaluate HDC against exact lookup, FTS/BM25 and embedding baselines; do not assume improved precision or security without measurements.

**Non-negotiable trust boundary:** HDC similarities, model classifications, retrieved facts and model-generated labels are advisory, not capability grants. Approximate vector similarity cannot prove identity or ownership and may produce collisions or false positives. Host-owned exact records and deterministic policy checks must independently verify profile ownership, current authorized project, data sensitivity and action scope. Reading memory does not imply exporting it or generating training data from it.

A basic standalone contract now lives in `lu-core/src/host_resource_authority.rs`: host-enrolled conversation ownership records, scoped principal, sensitivity ceiling, per-action authorization, and typed authorized resource. It is currently **not wired into Tauri commands**; this avoids pretending that a webview-supplied session identifier is authenticated. It is an in-memory policy prototype, not a persistent ownership registry, Windows filesystem security solution, or cross-chat access service.

Before wiring into the desktop: add durable host-created profile/conversation enrollment and migration for Jan history; obtain caller identity from trusted Tauri window/session context; require host-created non-serializable authorization handles for reads/exports/training; enforce revocation at operations; test profile separation, replay, arbitrary thread IDs, symlinks/junctions/reparse points, SQLite sidecars, and concurrent navigation. Cross-chat resume remains explicit and user-approved.

## Durable ownership registry — experimental core slice

The new `lu-core/src/ownership_store.rs` persists immutable conversation/profile/project/sensitivity bindings in SQLite. It re-reads the current row for each `require` operation, applies exact host resource policy, rejects unknown records, and keeps read/export/training permissions separate. It is deliberately not exposed to models or Tauri IPC; it is **not** a user authentication mechanism. The real host will need to derive a principal from trusted desktop window/profile state and create ownership enrollments only after verifying Jan conversation identity and controlled import. Do not use a UI-selected profile, project, or HDC inference as a credential.

SQLite triggers guard normal row updates/deletes, but this is not tamper-proof storage against a process with filesystem write access; Windows ACLs, safe database opening and journal/sidecar handling, transaction concurrency, migration and revocation still need explicit review. Existing checkpoint operations are not protected by this new registry until those integration gates have passed.

## Trusted desktop session contract — next integration slice

`lu-core/src/host_session.rs` introduces a host-owned, in-memory window-label to `HostPrincipal` registry. A missing window fails closed; a live binding cannot be silently replaced; unbinding revokes future accesses. `require_window_resource` composes window binding and the persistent SQLite ownership policy, using a typed read/export/train action. Regression tests cover absent windows, duplicate binding, read success, denied export and revocation.

**Current limit:** a window label is not a credential, and the provided `bind_host_window` API is only safe when invoked by trusted Rust host lifecycle code. This module is intentionally **not connected to Tauri IPC yet**: the host must identify its legitimate calling window, enroll OS/profile-bound Jan conversations on a verified path, define project default/selection as a trusted host workflow, support revocation, and reject window-label spoofing. Never expose `bind_host_window` as a model tool or accept arbitrary profile/project values from the webview. Before production integration, review Windows filesystem reparse/hard-link/SQLite sidecar behavior and multi-window lifecycle security.

## Portable Compute Runtime Manager — early core contract

Lu should reuse Jan's existing llama.cpp inference engines while allowing explicit CPU, Vulkan, ROCm/HIP and CUDA backend choices where binaries and host hardware support them. **Bundled backend binary != installed GPU driver.** Vulkan depends on an installed compatible graphics ICD/driver; ROCm depends on the supported AMD kernel/userspace stack; CUDA depends on the NVIDIA host driver. Users should not need a full compilation SDK for normal packaged inference, but Lu cannot package away OS kernel/driver dependencies.

`lu-core/src/compute_runtime.rs` now provides a backend probe/result contract and pure deterministic selection function. Missing package, driver compatibility, or model compatibility makes the backend unavailable; strict user-selected backends fail closed rather than silently selecting CPU. Automatic mode chooses from an explicit host-configured ordering and can fall back to CPU. This order is **not** a claim of relative GPU performance. Tests cover missing driver, incompatible model, duplicate probe, strict failure and CPU fallback.

This is **not yet integrated** with the Jan runtime manager and does not perform hardware enumeration, executable loading, downloads, driver installation, signature verification or GPU benchmarking. Upcoming adapters must report verified runtime versions, driver/ICD information, GPU identity, model format/quantization and diagnostics. Validate on Ubuntu (native and sandboxed packaging) and Windows; never execute arbitrary model-supplied installers or elevate OS privileges to install GPU drivers.

## Conservative compute probe observation contract

`lu-core/src/compute_probe.rs` now defines `HostComputeObservation` (OS, backend, detected device, driver version, runtime-package version, initialization success, model support, diagnostic) and converts trusted observations into conservative backend readiness checks. GPU use requires a known device, known driver, present engine, successful initialization, and model support; CPU uses engine presence and initialization success. This is a **data contract**, not a hardware enumerator: future platform-specific adapters must produce observations by genuinely probing drivers and backend startup, not by treating string fields, hardware names, or package existence as proof. Fake observations in tests cannot be used as real compatibility attestations. Runtime selection remains unconnected to Jan's active model loader. Record OS/driver/backend/runtime versions for benchmark comparisons.

## Linux hardware discovery hints — experimental

`lu-core/src/linux_device_hints.rs` reads bounded-format PCI device identifiers from a caller-provided sysfs-like directory. The production Linux adapter should use `/sys/bus/pci/devices` as a fixed host path (not a model/webview-supplied location). This read-only enumeration provides diagnostic *hints*, not a GPU driver probe. PCI IDs alone cannot establish Vulkan ICD usability, ROCm GPU support, permissions to `/dev/dri` or `/dev/kfd`, CUDA runtime compatibility, inference engine package signatures, or initialization success. A driver/runtime adapter must independently initialize a representative backend and report evidence before `initialization_succeeded` can be true. No new Tauri command or model-load behavior is enabled by this slice.

## Linux device-node diagnostics (read-only)

The new `linux_gpu_nodes` helper inspects `/dev/dri/renderD*` and `/dev/kfd`-style paths (host-supplied, not arbitrary model paths). This is designed to help diagnose Ubuntu GPU device exposure, including differences between native execution and sandboxes. It does not attempt Vulkan ICD loading, HIP initialization, access rights verification, or kernel driver installation. Visibility is merely a hint: only a trusted inference-backend startup and model-compatibility probe can mark a runtime as ready. Tests use temporary fixture directories. Windows and Linux runtime integration remain future work.

## Windows/Linux platform boundary

`lu-core/src/platform_compute.rs` dispatches read-only discovery by compile-time target: Linux reads fixed sysfs and device-node locations; Windows returns an explicit diagnostic-only result rather than touching Linux paths or asserting GPU readiness; other targets are similarly unsupported. This is a compatibility-preserving foundation, not a Windows GPU enumerator or a real Vulkan/ROCm/CUDA initialization probe. The active Jan Windows inference interfaces are unchanged. Require Windows cross-compilation/desktop CI, then actual Windows desktop smoke testing before release.

## CPU-aware compute scheduling — initial contract

`lu-core/src/cpu_topology.rs` now reads `std::thread::available_parallelism()` to determine the logical parallelism available to the Lu process, rather than guessing physical core counts. It provides bounded worker budgets for interactive tasks (reserve one logical processor when possible), background tasks (half available), and isolated benchmarks (up to available). Explicit requested counts are clamped. These are **scheduling suggestions**, not actual thread-pool configuration or promises of speedup: SMT/hybrid P/E cores, NUMA, CPU affinity, thermal throttling, competing workloads and backend-specific thread options can all affect throughput. CPU workers must not be multiplied blindly across simultaneous model runtimes, memory indexing and tools. Future integration should use measured throughput and latency with runtime-specific APIs, user overrides and reproducibility records; maintain Windows and Ubuntu parity.

## CPU instruction sets and unified hardware inventory

`lu-core/src/cpu_instructions.rs` reads available runtime CPU instruction flags (x86 SSE4.2/AVX2/FMA/AVX-512F; AArch64 NEON). `compute_inventory.rs` combines process-visible logical CPU capacity, CPU feature hints, build target OS/architecture, and platform-gated GPU discovery into one **diagnostic-only** snapshot. The inventory does not authenticate hardware, determine physical CPU cores, detect NUMA/hybrid core topology, initialize Vulkan/ROCm/CUDA, select a model binary, or change llama.cpp thread counts. Backend-specific runtime startup remains a separate mandatory verification gate. Evaluate CPU/GPU thread contention, affinity and instruction-optimized inference binaries before enabling automated selection in the desktop.

## First real Jan inference bridge: native engine diagnostics

The feature-gated `lu_compute_diagnostics` desktop command now combines Lu's actual process-visible CPU topology/ISA inventory with the existing Jan `tauri-plugin-llamacpp::engine::commands::engine_devices` native worker enumeration. It invokes Jan's already bundled `--list-devices` worker pathway, with no client-controlled executable path or env overrides. This is a read-only, on-demand operation; if the worker is missing or its enumeration fails, the command returns an error rather than fabricating devices. This is **real Jan integration**, but **not yet automatic model loading, hardware selection, GPU initialization attestation, or a UI settings screen**. The engine itself owns its backend selection and offload configuration; Lu cannot infer an engine's performance or CUDA/ROCm/Vulkan flavor from device names alone. The command is available only when `lu-foundation` is enabled, and Windows/Linux runner compilation plus real runtime smoke tests remain necessary.
