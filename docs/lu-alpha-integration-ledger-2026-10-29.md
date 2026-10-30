# Lu Alpha integration ledger — 2026-10-29 local / 2026-10-30 UTC

This is a dated component-evidence ledger for the canonical [T01–T18 plan](https://github.com/vjmichael/jan_alt/blob/work/lu-alpha01-release-gate-20261029/docs/lu-alpha01-revised-work-plan-2026-10-29.md). It does not supersede its acceptance criteria. Protected main and the physical user profile are untouched.

| Task group | Current evidence | Remaining release gate |
| --- | --- | --- |
| T01–T03, T10–T12 (AX inventory/exclusion) | AX stack through #60 combined with DX in draft #86. Its desktop integration run 41006372841 and provenance run 41006372989 passed after the individual source-origin correction. | Review all build-reachable inherited modules, optimized bundle, installed commands/assets and unapproved Jan fallbacks against one candidate. The inventory explicitly remains partial. |
| T04, T08–T09 (DX contract/observation/localization) | DX stack through #85 includes typed trace, host witness, native dispatch observations, WebView readback/React commit. Combined core-contract run 41006372866 passed. | Cross-process worker provenance, full GUI-to-durable-assistant causal correlation and failure injection at each boundary remain open. |
| T05–T06 (Lu-owned chat/tool path) | Native Protobuf dispatch has component tests and an installed GGUF tool turn passed in earlier preview run 41001540724. | The current positive WebView2 restart test still bootstraps a thread with a Jan-compatible mock. A real first-turn Lu-owned bootstrap and installed persistent reply without fallback are not accepted. |
| T07, T13–T14 (cancellation, fault probes, containment) | Prior cancellation and journal tests; #85 rejects stale no-turn host events; #88 redacts raw thrown host exceptions from chat/tool adapters. | Real worker exit/relaunch, effect reconciliation, targeted fault injection, privacy and overhead/noninterference qualification on the combined build. |
| T15–T17 (Windows and Alpha candidate) | #84 fixes a StrictMode W05 single-log failure; #87 adds clean-PATH installed-worker probing. DX-15E run 41004543211 failed in Process A: no new assistant UI message within 180 seconds; Process B skipped. | Establish cause via the sanitized rerun, pass W01–W06 and A01–A09 on one new pinned Cowork-free NSIS artifact, then audit licenses and accept AX/DX. No Alpha candidate is pinned yet. |
| T18 (post-Alpha review) | Blocked by the canonical release plan. | Start only after operational accepted Alpha. |

## Native first-turn candidate (2026-10-30 UTC)

The proposed first-chat change creates a saved `lu-native` thread from the branded Windows home screen after the operator loads an admitted GGUF and explicitly enables Lu. Its initial user turn uses the same saved-turn barrier and host-native transport as later turns. The persisted thread owner keeps the native route after a process restart; a missing model session fails closed, and the native thread hides Jan's provider picker. The updated two-process WebView2 test drives this native first turn without configuring a Jan mock. This is a code candidate, **not W01 or DX-15E acceptance**. The real run must demonstrate a visible, durable reply, and the installed NSIS path must pass separately.

All PRs remain drafts. CI on a component branch does not certify the integrated installed binary. The user deferred VirtualBox GPU passthrough testing, while CPU-only worker packaging remains a separate engineering compatibility gate.

The combined evidence schema now requires the same candidate commit and installer hash across A01–A09, AX-00..04, DX-00..04, and W01–W06. It rejects missing gates and source-only substitutes for operational Windows checks. Its synthetic fixtures validate schema behavior only; run identity and runtime assertions still require independent authentication.
