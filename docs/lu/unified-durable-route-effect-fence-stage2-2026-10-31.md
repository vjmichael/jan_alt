# Lu unified source — Gate 2: durable host-route effect fence

**Date:** 2026-10-31 America/Phoenix (UTC 2026-11-01)  
**Branch:** `work/lu-unified-durable-route-dispatch-stage2-20261101`  
**Review:** [draft PR #96](https://github.com/vjmichael/jan_alt/pull/96) into the verified Stage 1 source.  
**Release state:** **DRAFT / NOT ACTIVATED.** Vanilla Lu has only read-only native tools and does not enroll Cognitum `ExecuteCode` worker routes. This source work is not proof of installed GGUF+worker runtime success.

## Problem found in Stage 1 review

The prior model-output audit and `HOST_ROUTE_SELECTED` record tracked intent/provenance but did not make native effects durable. `NativeToolTurn::handle_model_reply_observed` called `ConversationAuthority::dispatch_bound`, the legacy *non-durable* path; the independently implemented `EffectJournal` and `dispatch_bound_durable` were not connected. Enabling the reviewed rational `ExecuteCode` route over this path could replay effects after a crash or incorrectly continue following an uncertain/failed effect.

## Reconciliation implemented

- The existing `NativeToolTurn` now has a trusted-host-only `handle_model_reply_observed_durable` method, using the preexisting `ConversationAuthority::dispatch_bound_durable` and `EffectJournal` for effect intent, `EXECUTING`, committed encoded Protobuf receipt, and recovery. Old in-memory callers are preserved for existing compatibility; no model-originated argument can supply or replace the journal.
- `run_supervised_native_turn_journaled_observed_with_host_routing` requires **both** `ModelTurnJournal` and `EffectJournal` before choosing executable host routes. A missing durable effect journal is a terminal failure, never a fallback. **All subsequent model-selected tools in that same route-enabled turn also use durable dispatch**.
- Fail-closed improvement: any durable dispatch error (policy denial, journal write failure, uncertain effect, malformed receipt) halts the native turn, rather than re-encoding a potentially uncertain effect as recoverable model feedback. The fixed `durable_effect_failed` diagnostic never leaks model content, host paths or tool arguments.
- `LuDesktopRecovery` holds `Arc<EffectJournal>` under its OS-exclusive owner lock and performs startup reconciliation before accepting tasks. `lu_inference.rs` clones this trusted in-memory handle, not a WebView-selected or worker-selected filesystem path.
- Production Windows host still creates a `new_read_only` native turn. There is no registered Cognitum rational module or explicit `ExecuteCode` consent in the ordinary app, and metadata discovery still cannot grant execution.

## Local/source-level acceptance tests added

`lu-core/tests/host_reviewed_route_durable.rs` uses an inert in-process typed fixture (not a real Cognitum worker or GGUF). The suite covers:
1. HOST_ROUTE_SELECTED and tool feedback auditing, committed effect receipt and replay cache: same canonical call ID cannot execute twice.
2. Model audit insertion failure **before** tool dispatch: no effect and no generation.
3. Cancellation during an invoked tool: effect receipt remains committed, model continuation does not happen.
4. Unknown model tool after a host-routed effect: the older one-time unknown-tool correction does not trigger.
5. Host policy denial before execution: no effect or generation.
6. Durable effect journal prepare failure: no effect and no generation.

The real multi-process and installed OS tests are independent gates. The draft stays unmerged until native Windows/Linux Rust and desktop checks pass. Source-only tests must not be reported as a successful Cognitum CE deployment.

## Remaining gates

- **G2-A:** Native Ubuntu and Windows Rust compilation, complete `lu-core --all-targets`, Rustfmt and strict Clippy at exact commit.
- **G2-B:** Windows Tauri desktop compile and frontend regression suite, plus restored single-owner startup/restart tests.
- **G2-C:** Real signed Cognitum CE invocation through host-owned policy, pinned worker executable and per-turn consent; Windows Job/AppContainer and Linux real sandbox/graduated containment. This requires a new separately reviewed test host and **does not occur merely by adding the rational route metadata**.
- **G2-D:** One-source-SHA NSIS/.deb installed real GGUF, Protobuf tool response, durable saved answer and cold-restart acceptance. No physical Windows acceptance is yet claimed.
- **G2-E:** Do not merge into the Windows alpha source or promote to production until G2-A/B and relevant real runtime gates are supported by evidence.

GitHub remains the source archive and independent verification resource; core development does not depend on Docker or GitHub CI as the primary execution environment.
