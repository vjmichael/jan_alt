# Lu Architecture & Production Roadmap — Revision 0.3 (Alpha rebaseline)

Status: design update, not evidence of implemented or released features.
**Authoritative 2026-10-29 Alpha decision:** [Cowork-free rebaseline](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md)
and [fault-localization diagnostics](lu-alpha-diagnostics-fault-localization-2026-10-29.md).
**Alpha is postponed (no committed date).** Full Cowork exclusion and removal
of non-inheritable Jan functionality are now **pre-Alpha blockers** rather
than v1.0 refactoring. The build must not ship Cowork code/routes/UI/registered
commands, even in a disabled compatibility bundle. Only consciously accepted,
licensed, Cowork-independent Jan-derived foundation components may remain.
**End-to-end diagnostic localization** is also a pre-Alpha requirement;
benchmark suites/comparisons and unrelated diagnostic features are deferred.
Older sections below record historical technical prototypes, not permission
to carry Jan/Cowork into the new Alpha.

## Product boundary: model-powered, model-neutral

Lu is a local-first AI desktop **host and orchestration platform**. Its intelligence, prose, analysis and generative decisions depend on the **loaded AI model(s)** and their capabilities; Lu Core is not itself a substitute for an LLM. Qwen is one supported model family, not the exclusive engine. Local and cloud model adapters are interchangeable, and two-model routing may delegate heavy reasoning to a capable model. Distinguish model quality from Lu's UI, policies, tools, retrieval, and inference backend. A model can be evaluated *inside* Lu without claiming the GUI is the model.

The **pre-extraction codebase currently contains** Jan Tauri integrations, a Cowork TypeScript agent loop, Rust native tools/policy, ANSF immutable messages/revisions, and app-owned memory. This is a *technical-debt inventory*, **not** the Alpha target architecture. Cowork and unapproved Jan-origin feature dependencies must be removed/excluded before Alpha release. Lu-owned host/orchestration, validated Protobuf IPC for internal native tools, narrowly scoped JSON adapters at model/external boundaries, and host-derived permissions are the target. Never turn memory or chat content into tool authority.

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

### Benchmark and comparison modes (**deferred — not Alpha**)

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

## Historical Jan inference bridge prototype — **not an Alpha dependency**

**Rebaseline:** the Jan `tauri-plugin-llamacpp` worker invocation described
below is a legacy prototype and a candidate for **non-inheritable Jan feature
removal**. It may remain in Git history for source/provenance reference but
must not be required or bundled in Cowork-free Alpha unless its exact
functionality is independently reimplemented in Lu-owned APIs. Record
replacement and negative-reachability test results under AX-00..02.

The feature-gated `lu_compute_diagnostics` desktop command now combines Lu's actual process-visible CPU topology/ISA inventory with the existing Jan `tauri-plugin-llamacpp::engine::commands::engine_devices` native worker enumeration. It invokes Jan's already bundled `--list-devices` worker pathway, with no client-controlled executable path or env overrides. This is a read-only, on-demand operation; if the worker is missing or its enumeration fails, the command returns an error rather than fabricating devices. This is **real Jan integration**, but **not yet automatic model loading, hardware selection, GPU initialization attestation, or a UI settings screen**. The engine itself owns its backend selection and offload configuration; Lu cannot infer an engine's performance or CUDA/ROCm/Vulkan flavor from device names alone. The command is available only when `lu-foundation` is enabled, and Windows/Linux runner compilation plus real runtime smoke tests remain necessary.

## Validated GPU and CPU autotuning protocol (prototype)

Lu Core now implements pure selection functions `choose_verified_engine` and `choose_measured_threads`. Actual backend candidates must come from **real Jan worker initialization + a small model inference pass**, not from PCI IDs, listed devices, or mocked benchmarks. Reject candidates without successful inference or positive measured throughput; deterministic duplicate rejection; use strictly comparable model, quantization, prompts, sampling and workload. CPU thread tuning selects the fastest observed passing latency/capacity constraints and favors fewer threads on ties. Neither is connected to live model settings: *do not claim auto backend loading or tuning is operating yet*.

### Real smoke-test matrix (release blocker)

- Windows 10/11, supported NVIDIA/AMD/CPU targets; Ubuntu 24.04 on dedicated GPU-enabled host. Record driver, kernel/runtime version, selected engine binary, hardware ID, model SHA256, quantization, and memory budget.
- Confirm the packaged worker starts, `--list-devices` returns valid JSON, a model loads, deterministic short generation succeeds, second generation succeeds, engine stop cleans worker state, and restart works. Exercise backend missing/failure, driver mismatch and CPU fallback in automatic preference; explicit backend failures must not silently fall back.
- CPU: test 1/half/all available worker settings under identical workload with warmups and repeated samples; record throughput and p95 latency. Do not overcommit CPU threads across concurrent subsystems.
- Run memory/checkpoint permission tests and Windows symlink/reparse/SQLite-sidecar tests separately; passing a GPU smoke test does not establish host authority security.
- Current CI does not expose an actual Windows desktop+GPU or Ubuntu desktop+GPU target to this connector. Hardware smoke-test status remains **not performed** until real host execution evidence is attached to the PR.


## Deferred extension — Lu Server Mode (post-core DLC)

**Priority:** Backlog for **after production-ready Lu Core and desktop release**. This is a proposed optional downloadable extension ("DLC" in the sense of modular add-on), **not a launch prerequisite** and **not yet implemented**. No decision has been made about pricing, licenses or distribution terms.

### Goal and scope

Enable the owner to optionally run Lu as a host that **other authorized devices, people or AI clients can connect to**, while retaining the same local-first, model-neutral core and host-owned security policies. The normal Lu desktop application must remain fully usable offline with no server enabled or server component installed. Remote clients may request chat/inference and narrowly permissioned functions; the host maintains ownership and final authorization.

### Architecture sketch (subject to review)

* Package an installable, removable **Server Mode extension** with a stable versioned API, rather than placing a permanently listening service in Lu Core. Implement adapters for desktop, mobile, browser and/or CLI clients without requiring that Lu itself become a cloud service.
* Start **disabled by default** and bind only to `127.0.0.1` for development. Explicit opt-in is required for LAN binding; public/WAN exposure is out of scope for the first version. No automatic router port forwarding, UPnP or unrestricted network interfaces.
* Reuse Lu's model-neutral inference scheduler, native tool catalog, ANSF context and continuity abstractions **behind** a server-side authorization boundary. A remote API request is never a trusted Tauri desktop session or a host administrator merely because it knows a model ID, project name or device address.
* Define versioned, typed request/response/event schemas (Protobuf internally; JSON and/or OpenAI-compatible HTTP at an explicitly validated boundary), streaming support, cancellation, backpressure and graceful disconnect/reconnect semantics. Protocol details and service-discovery mechanism remain design choices.
* Require authenticated client/device identity and owner-managed enrollment/revocation. Add exact per-user/project/resource authorization checks before exposing history, memory, files, tools, exports or administrative settings; memory retrieval and HDC similarity only discover candidates, never grant authority.
* Isolate remote workspaces, secrets, credentials, model execution quotas and artifact paths. Add configurable model access, job priorities, concurrency limits, rate limits, queue limits, idle timeouts, audit logs and resource accounting (CPU/GPU/VRAM/RAM); avoid remote work crowding out the local desktop user.
* Protect traffic with an appropriate transport security design before accepting non-loopback clients. Require explicit confirmation for sensitive remote tools, network exposure, file reads, memory exports and privilege-affecting actions. Separate server role permissions from desktop-owner capabilities.
* Provide a clear owner-facing dashboard for active sessions, connection status, listening interfaces, model utilization, stop/revoke controls and audit history. The extension must not weaken core fail-closed behavior if absent or stopped.
* Develop with staged security gates: loopback-only integration tests, multiple-client isolation tests, token rotation/revocation, denied cross-user data access, reconnect/stream cancellation, load/DoS tests, Windows and Ubuntu network/firewall smoke tests, and adversarial tool-request testing **before** LAN access is offered.

### Roadmap gate

Do not begin Server Mode development until Lu Core has passed its production gates (desktop installers, Windows/Ubuntu smoke tests, real inference backend startup, safe model configuration, authentication/ownership enforcement and reliable ANSF continuity). Once those are stable, draft a dedicated Server Mode threat model and API specification, then implement as an optional extension. Existing Lu installations must remain local-only unless their owner deliberately installs and activates the extension.
