# Lu Alpha DX-01 — Host trace isolation, evidence loss and Windows validation

**2026-10-29.** Status: source integration and component tests in progress; **NOT full DX-01 release acceptance**. Owner: ChatGPT DX diagnostics workstream; **Work owns AX/Cowork extraction**.

## This implementation slice

- The host creates an ephemeral UUIDv4 **after an accepted native-turn admission**, independent of the conversation, user-message, model task and worker identity. The token is a local correlation reference, **never a permission grant** and never included in a model prompt.
- `PassiveTraceJournal` in `lu-core/src/passive_diagnostics.rs` records a bounded per-accepted-turn ring. Events from the previous turn cannot be appended after a subsequent trace has begun; sequence resets per accepted turn. The ring accumulates an explicit overwritten/contended count.
- Host `lu_inference_diagnostics` is **main-window-only** and does not lock the inference worker. The JSON projection is `lu.native.host-trace.v2`: anonymous `traceRef`, `clockDomain=host`, `droppedEvents` and allowlisted `sequence/elapsedMillis/stage`. It contains **no** thread ID, raw prompt, tool argument, file path, username, PID or model output. It is user-exported, not automatically uploaded.
- Frontend sanitizer validates the token format, clock domain, loss count and stage allowlist, re-emits only safe fields, and distinguishes `status=legacy` for previous v1 uncorrelated snapshots. Legacy evidence has `droppedEvents=null` rather than a fabricated zero.
- W01's failure-only WebView2 probe recognizes v2, caps diagnostic output and reports that the evidence is **host-only**. No second generation or tool request is triggered to obtain evidence.
- A compile-only Tauri resource fixture now stages Bun/UV/worker *placeholders* for `cargo check`. This is **never** license/package/install evidence. Actual NSIS verification must use real sealed binaries and the independent W06/AX acceptance.

## Evidence caveats

- These host milestones are associated with the **latest successfully admitted turn**. Rejected requests **before** durable accepted-turn registration do not yet receive their own trace. End-to-end W02 and diagnostic denial attribution require future DX-02 instrumentation.
- Several pre-admission checks are recorded together **after** their successful completion so they can be associated with the accepted trace. Those checkpoints attest completed checks; **their recorded timestamps are not measurements of each pre-admission action**. Do not compute step-by-step pre-admission latency or falsely infer causal order from their nanosecond spacing.
- Trace initialization may fail under lock contention. The source now records **`admission_unobserved`** and suppresses all previous-turn events/references, with a synthetic Rust lock-contention regression and frontend negative test. This still needs the current Windows CI's exact-build verdict; a missing trace **never** proves the host did not receive the turn.
- The existing frontend event ring is still uncorrelated with the host UUID; a stream-close event alone does **not** prove durable assistant persistence or UI rendering.
- The typed `DiagnosticTrace` Protobuf and deterministic `localize_normal_turn` core are independently tested but **not yet wired into the live multi-process collector**. Do not report complete DX-00/01/02/03 on the strength of the passive host trace.
- A host-only W01 report showing `native-model-loop-entered` without `native-model-loop-returned` suggests where to probe next. It does not prove an LLM hang versus a worker crash, dropped event, late cancellation or test timeout.
- A user must never have to grant extra filesystem/shell access merely to inspect these content-free local events. An active fault-injection probe remains a separately approved operation.

## Next work, in order

1. Ensure Windows diagnostic CI passes **Rust unit tests, frontend privacy/E2E typecheck and full desktop compile**, with an exact branch SHA.
2. **Implemented in source, awaiting full CI:** guard start-trace contention so a previous accepted trace cannot masquerade as the latest one; test loss and a fail-closed `admission_unobserved` state. Validate against exact Windows run SHA before accepting this regression.
3. Establish **trusted host–WebView causal correlation** using a scoped, non-authorizing trace reference that remains accessible while the model worker is hung. Ensure an unauthorized/malformed request cannot reset an active trace.
4. Emit typed native Protobuf stage/outcome records and link the existing deterministic localization engine. Record **worker restart clock epochs**; cross-process durations require clock mapping or must be marked unknown.
5. Add distinct verified **assistant persisted** and **assistant rendered** observations; a storage write ACK and optimistic UI display are not sufficient. Preserve source ownership so this DX feature does not collide with Work's AX chat extraction.
6. Validate injected failures in a disposable Windows Lu-only installed desktop, then reconfirm no Cowork/no unapproved Jan bundles and complete remaining Alpha gates. No performance benchmarking.

**Alpha remains postponed.** Benchmarking, automated repair, remote diagnostic bridge, heavy instrumentation and multi-assistant QoL are not DX-01 deliverables.

## DX-01 next test: host-scoped UI trace receipt (2026-10-29)

**Implementation committed on DX branch; latest exact Windows CI verdict pending.** This is a partial DX-01 correlation slice, **not** installed-runtime acceptance.

- The trusted host now pairs a UI-generated turn handle with a fresh *host-generated* trace reference only after recovery, session and persisted USER-role verification and exclusive active-turn admission. The pair is private host state and is never a capability grant.
- The read-only, main-window-only `lu_inference_diagnostics` command accepts an optional scoped `turnId` for an *active* turn. It uses nonblocking locks and refuses wrong, missing, stale, or trace-unobserved correlation rather than returning the last accepted turn's evidence. The legacy unscoped diagnostic export remains available for manual host-only inspection.
- On an accepted, successful native response, the host includes its anonymous `traceRef` (or null if the trace was not recorded). The frontend retains that reference only in an ephemeral diagnostic receipt, never a conversation/task/permission ID and never a prompt.
- During generation, the frontend requests the host snapshot scoped to its currently active turn. After response, it matches the returned reference to the current host trace. The exported status distinguishes `matched_active`, `matched_returned`, `mismatch`, `unlinked`, and `unavailable`; all are explicitly marked `host_only`.
- Frontend tests cover in-flight match, completed receipt match, mismatch, missing trace, wrong/stale turn, and late callbacks from a canceled earlier operation. Windows desktop compilation and frontend test runs are required before promoting this slice.

**Important evidence boundary:** the match proves only that the observed host trace corresponds to the UI's native invocation. It does not yet prove assistant persistence, rendering, worker process epoch, tool effects, or causal ordering across process clocks. A trace lost to contention, an active worker still blocked, or a failed response must remain `unavailable`/incomplete, not a fabricated success.

**Next test after this gate:** the real disposable Windows WebView2 run should request a scoped snapshot while an admitted GGUF native turn is still in flight, deny an unrelated turn handle without altering the current trace, then compare the exact host return reference and the UI receipt. Only afterward wire typed Protobuf multi-process stages and durable assistant-save/render observations. Work continues to own AX/Cowork extraction.

### Exact-build verification of scoped correlation slice

- **PASS** — [Windows Lu Alpha DX run 40942028979](https://github.com/vjmichael/jan_alt/actions/runs/40942028979), tested source SHA `426a5225a5578a51995cb92cd487280b40fd3295`.
- Native job: Rust formatting, existing Protobuf/localization/ring tests, compile-only valid ICO validation, and Windows Tauri `cargo check --locked --features lu-distribution --lib` all passed.
- Frontend job: diagnostic privacy/correlation tests, native chat adapter tests, and WebDriverIO TypeScript checks passed.
- **Scope:** verified source and compile-only test artifacts, NOT a real installed WebView2/GGUF in-flight trace acceptance. The following installed boundary and persistence/render checks remain open.
