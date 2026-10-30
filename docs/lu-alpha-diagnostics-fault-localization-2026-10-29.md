# Lu Alpha — end-to-end fault localization diagnostics (DX gate)

**Decision:** User-approved Alpha prerequisite, 2026-10-29. **Status: specification and acceptance criteria, not validated implementation.** The previous content-free frontend export and Rust host ring remain useful primitives, but alone do **not** meet this gate. Benchmarking and unrelated diagnostic features are explicitly outside scope.

## Integration with revised Alpha task phases

The [canonical Alpha engineering work plan](https://github.com/vjmichael/jan_alt/blob/work/lu-alpha01-release-gate-20261029/docs/lu-alpha01-revised-work-plan-2026-10-29.md) assigns DX-00/01 to Phase 1 (T04/T08), DX-02/03 and the localization engine to Phase 2 (T07–T09), and real Windows boundary fault-injection, privacy and noninterference validation to Phase 4 (T13–T15). Full acceptance on the *new Cowork-free installed Alpha* remains Phase 5/T17. The six support batches and passive Rust event ring are **prerequisites/evidence only**, not an accepted DX result. Performance benchmarking, throughput comparisons and automatic repair stay deferred.

## Objective and engineering honesty

For any failed Lu operation from user action through result, determine the **last positively observed stage**, the **first missing/failed stage**, the involved subsystem and bounded elapsed interval. When exact cause cannot be determined, report an evidence-supported fault *proximity* and what additional probe is required. A timeout is not proof the last stage caused the fault; dropped events, clock discontinuities and trace truncation must be reported as uncertainty.

Build a coherent **causal trace**, not an arbitrary collection of logs. A record is actionable only when it can establish ownership, ordering, outcome, timing, failure classification and evidence provenance **without exposing user data or empowering model instructions**.

## Required operations / tracing boundaries

1. **Startup/install:** binary/source manifest, profile lock/recovery, package integrity, backend DLL/engine checks, model catalog admission, initialization of host registry.
2. **Conversation initiation:** GUI submit, pending/optimistic message, verified durable USER-role write, Lu-native routing decision, invocation acceptance/rejection.
3. **Native execution:** Tauri command receipt, valid main-window principal, conversation/task authority, workload admission, worker scheduling and actual entry, model session/runtime process, model request, boundary validation, Protobuf tool dispatch (if selected), result validation and durable effect journal.
4. **Response return:** native completion/failure, command/stream delivery, AI SDK stream contract, verified assistant write, UI message render and completion state.
5. **Cancellation/recovery:** user Stop -> host request -> matching cancellation token -> worker/process observed state -> effect receipt/checkpoint reconciliation -> resumed/failed/terminated outcome.
6. **Installer and profile failures:** actual NSIS operation, license/resource checks, restart A/B/A and user-data sentinel health; report only status/check hashes, not private files.

Each stage must have **attempted / entered / succeeded / failed / cancelled / skipped / timed out / unavailable** outcomes where relevant. Preserve causal links between retries and earlier attempts; never confuse a retried request with the original operation. Distinguish "IPC responded" from "model finished," and "stream ended" from "assistant durably persisted and rendered."

## Trace architecture

- A Lu host supervisor owns the diagnostics ring independently of the model worker and UI component lifecycle. It remains queryable while an inference worker is blocked. Use nonblocking emission, bounded queues, loss counters and explicit overflow markers. A failed tracing lock must not slow or deny a real authorized task.
- Emit a **host-minted ephemeral trace key** on request admission and map it to local frontend/worker spans within the running session. The trace key is *correlation only*, never a grant/capability, never model-controlled, never persisted as a stable conversation identity or exported in raw form without privacy filtering.
- Use a typed internal Protobuf observation contract; WebView JSON is a strictly validated/sanitized projection at the UI boundary. No new required MCP server, no arbitrary JSON tool-calling interface, no shell/path fields for an observer.
- Use monotonic time per process and explicit clock-domain mapping across processes. Include process/session boundary and retry attempt (anonymized, run-local). Never sort different process clocks without calibration and confidence; fall back to causal sequence and event parentage.
- Bound the default ring and capture memory, avoid unbounded string formatting/stack traces in hot paths. A bounded failure-evidence snapshot is generated only on explicit local user export or on authorized disposable CI test failure.
- A structured result includes `schema_version`, `build_sha`, `anonymous_trace_ref`, `stage`, `parent_stage`, `sequence`, `clock_domain`, `elapsed_ms`, `outcome`, `failure_code` (allowlisted), `evidence_strength` and `dropped_event_count`. It may include safe process-status boolean and known reason-code categories but **never** prompt text, raw model JSON, full file paths, API secrets, usernames, thread IDs, tool arguments, content hashes that expose private data, or arbitrary exceptions.
- Active checks must use a **typed allowlist of diagnostic check IDs**, explicit human scope approval, resource/deadline limits, disposable profile/workspace and host-owned authority. They may invoke a test model or restart a worker **only** when separately approved; no automatic arbitrary repair or cross-conversation access.

## Fault-localization engine (deterministic)

Build an allowlisted stage graph with dependencies and expected terminal transitions. Compare the observed trace to that graph and return:
- `confirmed_until`: last checkpoint proven complete, with source of evidence;
- `first_unconfirmed`: missing/failed next transition (including unknown when events were dropped);
- `fault_region`: GUI, persistence, Tauri transport, authorization, scheduler, process/engine, model or JSON boundary, Protobuf tools/effects, response transport, persistence/render, NSIS/profile;
- `interval_ms`: bounded duration or `unknown`;
- `classification`: denial / malformed input / backend unavailable / resource exhaustion / deadline / transport / cancellation / persistence / mismatch / unexpected;
- `confidence`: observed failure, bounded localization, or insufficient evidence;
- `next_probe`: specific minimally privileged diagnostic test, never a self-authorizing tool call.

Do **not** produce spurious root-cause certainty from missing evidence. Failure localization must be deterministic and independently testable without a live model.

## Phased implementation / acceptance

| Gate | Deliverable | Test proving completion |
| --- | --- | --- |
| DX-00 | Stage map, typed contract, ephemeral span correlation and redaction policy | Valid/invalid event schema, unknown stages, clock domains, oversized frames rejected |
| DX-01 | Host + GUI + engine/worker boundary instrumentation for startup and normal two-turn conversation | Disposable Windows runtime reports all required transitions and linkable attempt sequence without plaintext |
| DX-02 | Tool, cancellation, recovery, durable effect journal and saved-message/UI completion instrumentation | Real Windows native tool request, scope rejection, Stop, worker exit/retry and persisted assistant checks with finite terminal state |
| DX-03 | Deterministic localization and evidence UX/export | Inject one controlled failure at each boundary; report correct adjacent stage interval; identify dropped events; report sanitized plain-English summary + technical details |
| DX-04 | Performance/safety containment of diagnostics | Observability cannot change authorization, effect idempotency, worker cancellation, concurrency, engine output or user-visible routing; no private content leaks; overhead bounded by test budget |

The critical path is **DX-00 → DX-01 → DX-03**, followed by DX-02 and DX-04 before final Alpha gate. Existing W01/W06 smoke tests become validation inputs, not substitutes. A report generated from mocked events is *not* real Windows installed-runtime proof.

## W01 example

A failing W01 trace could show:

`user_turn_saved=pass → tauri_native_turn_received=pass → saved_user_attested=pass → model_loop_entered=pass → model_loop_returned=pass → ipc_reply_delivered=pass → stream_finished=pass → assistant_persisted=unknown`.

This only justifies inspecting assistant persistence/render; it does not prove React itself is at fault. If the loop never returns, capture the current engine health, worker state, deadline, and model boundary stage next. Each failed run should automatically preserve only a **sanitized** report and provenance from its disposable Windows runner.

## What is NOT in the Alpha diagnostic system

No throughput/TPS metrics, cold-vs-warm performance benchmark, model rankings, quantization comparisons, matched Cognitum on/off evaluations, energy scoring, automatic performance tuning, large test suites that stress hardware, deep GPU profilers unless strictly needed to localize a specific failure, continuous data collection, unapproved AI-driven repairs, network support telemetry or Lu-to-Lu diagnostic bridges. Preserve these as separately gated future roadmap features.

## Explicit release policy

DX evidence is a new **mandatory Alpha gate**, alongside a **Cowork-free verified build** and existing functional/security/license tests. A pass on passive ring-buffer unit tests or on the existing six support gates does not satisfy DX-01/02/03/04. The comprehensive post-Alpha v1.0 review remains deferred until the newly scoped Alpha has actually shipped and is working.
