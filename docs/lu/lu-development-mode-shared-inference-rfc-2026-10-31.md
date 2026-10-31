# Lu Development Mode — shared inference, staged updates, and resource safety

**Status:** Proposed architecture, 2026-10-31. Not an alpha acceptance claim, and not authorization to modify live user files or install binaries. This is a design checkpoint; implementation is subsequent to the first reliable Lu-Win x86-64 alpha chat/install/restart gate.

## Decision

Adopt **Option 1 + Option 2 as the default**: Lu works on its own source in an isolated development workspace while all authorized AI clients borrow capacity from **one already-loaded model runtime**. Option 3 (a second independent model runtime) exists only as an explicit, resource-admitted fallback, disabled by default. No development window or DLC may auto-load its own model merely because it starts.

There are three separate identities: **UI/client instance**, **development workspace/build worker**, and **inference runtime/model residency**. One-to-one coupling is prohibited. The user's normal Lu session is the foreground owner; developer agents are low-priority clients.

## Mode A — embedded IDE (first implementation)

Add a Development Mode/IDE pane to the already running Lu desktop. Its compiler/test workers run in separate, bounded processes and can edit a disposable branch or isolated workspace. They reuse the current Lu model through existing trusted host APIs. No second Lu GUI and no second model load are required. Keep user chats, production profile, grants, and workspace separate from development files. The browser/WebView must not receive raw filesystem authority or a privileged model-server credential.

## Mode B — second GUI without another model (later)

When a distinct test GUI is required, it is an inference **client**, not an inference owner. It authenticates to a Lu-owned local inference broker using scoped IPC and host-minted, short-lived client credentials. The broker owns one model and schedules generation per conversation/task, maintains independent context/KV state, validates ownership on every request, and supports cancellation scoped to the requesting task. Do not directly share GPU pointers or map untrusted process memory.

`llama-server` can run parallel slots and continuous batching with one loaded model, but extra active contexts/KV caches still increase VRAM pressure. Parallelism is conditional on current budgets. The dev client cannot unload/switch the foreground model or expand its tool grants. Start with a single active generation slot if headroom is uncertain. Explicit user priority wins under contention; background generation pauses or queues.

**Lifecycle:** today Lu's model child is deliberately stopped when its desktop host exits. Do not undermine that safety contract for alpha. For *future* independent engine survival across an app restart, move engine lifecycle to a separate authenticated Lu Runtime Supervisor that owns leases, heartbeats, restart handoff, an idle shutdown deadline, and a fail-safe orphan cleanup policy. Until that exists, a native host restart may unload/reload the model.

## Mode C — optional independent runtime

Only after explicit user opt-in, memory admission, and a smaller/CPU model selection. Option C is not the default and must fail closed if budget data is insufficient. Models loaded by other apps cannot be assumed to share weights with Lu. Full second instance plus full model residency is never an automatic fallback.

## Update classes

| Update | Development behavior | Production behavior |
|---|---|---|
| Docs, prompts, theme, isolated scripts | Reload/refresh in IDE workspace | Publish after validation |
| Web UI | HMR/preview in dev WebView, with isolated output | Commit/reload app UI only at safe boundary |
| Native tool/CE worker | Versioned Protobuf contract, spawn new sandboxed worker, drain old one, verify handshake, rollback on fault | Atomic worker-version switch with existing task checkpoint rules |
| Rust/Tauri core, engine binary, native ABI/protocol break | Build separate artifacts; **never overwrite active executable or DLL** | Staged restart/upgrade, checkpoint, self-test, rollback |

A generic live hot-swap of loaded Windows Rust native code is not assumed safe or supported. A supervisor-managed restart is the preferred replacement mechanism. Engine must not outlive the supervising policy unintentionally.

## Resource admission: VRAM and system safety

The **Resource Guardian** is a host-owned, model-independent core service, shared by IDE, inference, tasks, and DLCs. It records GPU adapters, device-local memory budgets and usage, OS commit/memory pressure, CPU load, process counts, and live engine KV/context demand. On Windows prefer OS-adapter budgets (DXGI `IDXGIAdapter3::QueryVideoMemoryInfo`) plus backend-specific Vulkan `VK_EXT_memory_budget` estimates where applicable, with optional vendor telemetry. Treat all values as estimates and changing budgets, not global hard-cap guarantees. The provider's reported *per-process* usage is not a complete global VRAM census.

Admission must estimate **weights + KV cache per active slot + temporary/scratch allocation + GPU overhead** rather than GGUF file bytes alone. Reserve configurable headroom for desktop and other programs. Suggested initial conservative soft target: under ~80% of the usable reported budget, continuously reevaluated; do not claim this percentage universally prevents OOM. If monitoring is unavailable or stale, do not launch an extra GPU-resident model. Fall back to a single-slot queue, CPU-only work, or user-confirmed operation.

Resource pressure response order: (1) stop admitting new GPU work, (2) throttle/queue developer inference, (3) suspend low-priority compile/test tasks, (4) shrink optional development contexts or reduce parallel slots where supported, (5) cancel low-priority work if necessary; preserve the interactive session and validated state. Never silently unload the user's foreground model. CPU/RAM/process controls use supervised workers and Windows Job Objects where suitable; Job Objects are not a GPU-memory quota.

No unbounded retry loop after memory allocation failure. Use debounced readings, bounded backoff, explicit user notice and task checkpoints. No blind second model launch.

## Security boundaries

1. **Models request actions; models do not grant authority.** IDE file writes, build execution, staging, version switches, Git pushes and model/runtime changes need host-granted permissions, with valid conversation/task IDs and independently authenticated execution identities.
2. The dev workspace is separate from the user's production profile and running Lu binaries. Default to a disposable worktree and test profile; protect the prior working release. No execution of unreviewed compiled code inside the trusted host. Native workers use existing policy and Protobuf validation.
3. A dev client gets inference use only; it does not inherit production chat history, disk roots, tool credentials or ownership authority. Do not expose unauthenticated localhost model endpoints; use loopback + authenticated broker or OS-scoped named pipes.
4. A self-update produces signed/hashed manifest and a validation receipt. Use staging, atomic switch where supported, warm startup, health check and rollback. Preserve audit/provenance without putting prompts, model output or secrets in diagnostics.
5. Revocation cancels queued and running scoped work; expired clients cannot continue generating or make tool requests. User retains manual recovery controls.

## Proposed phased acceptance gates

- **DEV-0:** Existing Lu-Win alpha remains unchanged: real installed Windows x86-64 launch, pinned GGUF load, chat completion, saved turn, process restart, engine shutdown and fault localization.
- **DEV-1:** Single-process Development Mode; workspace-aware file/tree/search tools; build/test runner with progress, cancel/kill, bounded resources and disposable worktree. Same Lu session/model, no duplicate model load.
- **DEV-2:** Shared-inference service contract; two authenticated clients produce distinct conversation responses while only one model-weights allocation is resident; cancellation, revocation, priority, session isolation, and peak VRAM measured.
- **DEV-3:** Resource Guardian pressure tests with artificially restricted budgets, stale telemetry, sudden external GPU allocation and concurrent compilation; no second model without admission; graceful degradation.
- **DEV-4:** Worker-level versioned hot-reload tests (Protobuf schema matching, drain/rollback) and safe WebView preview refresh.
- **DEV-5:** Full host update through staged restart/rollback; runtime retention across host restarts requires an independently supervised engine with leases/orphan cleanup and explicit user policy, not unchecked persistence.
- **DEV-6:** Lu modifies a disposable branch of its own source, builds locally, runs trusted tests, records outcome and presents the diff for approval. No automatic merge, deployment, model switching, or Git push.

**CI policy:** Local-first iterative development and tests. GitHub receives milestone source/documentation snapshots and narrow, pinned Windows jobs only for OS-specific verification. Do not trigger the expensive complete installer workflow on every IDE edit.

## Open implementation choices

- Whether persistent model ownership migrates to a separate Runtime Supervisor before or after the IDE's first end-to-end build gate.
- GPU measurement strategy across Vulkan, CUDA, ROCm and multi-adapter systems, and thresholds tuned by real telemetry rather than fixed claims.
- Whether the first independent dev GUI is a separate Lu binary without a model owner, or an isolated WebView hosted by the current Lu process.
