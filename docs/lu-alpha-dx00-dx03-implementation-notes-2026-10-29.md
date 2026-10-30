# Lu Alpha DX-00 / DX-03 implementation note

**Date:** 2026-10-29
**Branch:** `work/lu-alpha01-diagnostics-priority-20261029`
**Ownership:** DX diagnostics only. ChatGPT Work owns AX/Cowork and Jan extraction.
**Status:** Code and synthetic tests present; **not** complete end-to-end DX acceptance or installed Windows runtime proof.

## Implemented

- `src-tauri/lu-core/proto/lu/v1/core.proto`: typed `DiagnosticTrace`, `DiagnosticEvent`, fixed diagnostic stages, outcomes, clock domains and failure codes. No prompt/path/model text fields.
- `src-tauri/lu-core/src/diagnostic_contract.rs`: strict, versioned, size/length-bounded canonical Protobuf codec. Rejects unknown fields, bad trace-ref shape, invalid stages/outcomes/failures, non-monotonic sequences/attempts and invalid local clock ordering. The token shape is **not** an authorization grant.
- `src-tauri/lu-core/src/diagnostic_localization.rs`: deterministic *normal native turn* localization with explicit observed-failure vs bounded-to-next-stage vs insufficient-evidence vs completed findings. Native tool/cancellation side paths supported in initial form. Reports generic subsystem and next safe probe without copying event contents into user-facing strings.
- `src-tauri/lu-core/tests/diagnostic_contract.rs` and `diagnostic_localization.rs`: synthetic positive and adversarial fixtures, including dropped events, fake parent sequence, oversized frames, failed returns, active tool/cancel, retry isolation, cross-clock timing uncertainty and forged stage codes.
- `scripts/check-lu-native-chat-boundary.mjs`: boundary audit now tolerates Rust-formatted `tools . read_only_turn_context` while still requiring the same trusted user-turn validation.
- Existing passive host/frontend bounded stages and sanitized export are retained; the strict Windows rustfmt gate is restored.

## Still mandatory, not proven by these tests

1. **DX-00 completion:** an actual trusted host must mint `trace_ref`, assign globally ordered event IDs and parent spans, and validate Protobuf on **every** native diagnostic boundary. Current schema-only unit tests do not do that.
2. **DX-01:** correlate events across Lu WebView submit/persistence, Tauri host, independently supervised model/worker, tool return, AI SDK stream and verified assistant persistence/render. Current old passive rings are **uncorrelated** and cannot alone localize a whole conversation.
3. **DX-02:** process exit/relaunch, native tool journal/cancellation/revocation, worker restart and retry trace propagation; handle different worker clock origins/epochs. **Do not subtract raw elapsed timestamps from different processes.**
4. **DX-03 completion:** run *controlled fault injection across real installed Windows boundaries*, verify the fault proximity finding for each and quantify incomplete evidence. Current synthetic findings are not release qualification.
5. **DX-04:** prove redaction, bounded event loss/retention with dropped counters, no permissions escalation, safe cancellation and no diagnostic interference with inference or user data.
6. **Integration with AX branch:** coordinate shared `lu_inference.rs`, chat transport and Tauri command edits with Work before merging. No Cowork or Jan files were intentionally modified by this DX implementation; the broad Jan/Cowork extraction remains separate.
7. **CI:** `.github/workflows/lu-alpha01-passive-diagnostics.yml` tests Rust Protobuf/localization, frontend privacy/E2E typechecking, and Windows Tauri compile on the exact branch SHA. Require exact latest run PASS before promoting any DX-specific source.

## Known limitations requiring design follow-up

- The typed contract currently distinguishes WebView/host/worker clock domains and retry attempts; a worker process restart within the same attempt requires a host-minted **clock epoch** to avoid treating distinct monotonic clocks as one. Add this before claiming DX-02 restart completeness.
- Existing passive ring has no per-turn correlation or explicit dropped-event count in its exported projection, so any attempt to infer an end-to-end root cause from it would be overstated. Add both before merging native DX-01 UI analysis.
- A successful AI SDK stream end is not proof a reply was durably saved or rendered; those checks must have their own confirmations.
- Diagnostic `trace_ref` is **not** a task authorization token and must never substitute for saved USER message, conversation and task scope, grant, permission or durable journal identity.
- Benchmarking/TPS, model comparison/ranking, auto repair, remote diagnostic bridge and unrelated diagnostic expansion are **post-Alpha** features.

**Integration rule:** keep AX and DX branches separate until both have passing relevant tests; then test one new Cowork-free pinned Windows installer with A01–A09 + W01–W06 + AX-00..04 + DX-00..04.

## DX-02 clock-restart separation (2026-10-29)

**Implemented on the DX branch; final Windows CI validation pending.** The typed `DiagnosticEvent` now includes `clock_epoch = 9` (bounded nonzero host-minted process clock incarnation), and the diagnostic Protobuf contract version is **2**. Version-1 traces are intentionally rejected so older events with an absent clock epoch cannot be silently reinterpreted as v2 evidence.

- `diagnostic_contract.rs` enforces nondecreasing epochs per `(clock_domain, attempt)`, and monotonic elapsed time only per `(clock_domain, attempt, clock_epoch)`. An explicit new epoch lets a restarted worker's elapsed time reset without falsely raising `InvalidClock`; regressions to a previous epoch fail closed.
- `diagnostic_localization.rs` computes a bounded elapsed interval only where **clock domain, attempt and epoch all match**. Causal parent and host sequence remain distinct from worker elapsed time; cross-process and cross-restart time subtraction remains unknown.
- Added tests for restart with reset time, illegal reset without a new epoch, stale epoch reentry, zero/oversized epochs, old protocol rejection, and an observed IPC failure immediately after a worker restart that must have `observed_interval_millis = None`.

**Not yet complete DX-02:** trusted runtime emission has not been wired to mint, propagate and verify worker clock epochs across actual process exit/restart, worker idempotency and effect-journal reconciliation; those require real disposable Windows process tests. Neither typed fixtures nor a passing Cargo test prove worker restart recovery. Any older protocol-v1 trace must be explicitly migrated at a future trusted boundary, not auto-upgraded from potentially missing observations.
