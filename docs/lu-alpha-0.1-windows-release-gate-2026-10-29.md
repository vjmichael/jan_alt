# Lu Alpha 0.1 — revised Windows x86-64 release gate

Date: 2026-10-29. **REBASELINED: Alpha postponed; release date unset.**
Scope: binding requirements and acceptance, not evidence of a shipped/GUI-verified release.

**NEW OWNER DECISION (supersedes earlier "compatibility Alpha" assumptions):**
Alpha must ship **without Cowork or unapproved/non-inheritable Jan features**.
A full, end-to-end **fault-localizing diagnostic system** now precedes final
Alpha verification. Benchmarking and unrelated diagnostic features remain
deferred. See [the Alpha rebaseline](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md)
and [DX acceptance specification](lu-alpha-diagnostics-fault-localization-2026-10-29.md).
These requirements override any older permission below to ship Jan fallback or
to defer Cowork extraction until v1.0.

## Parallel work ownership

- Alpha release gate (this branch): **re-baselined** release matrix, architecture/extraction and DX evidence requirements; do not promote an old transitional candidate.
- Phase 4H: repair W01/W06 and preserve W02/W03/W04/W05 regression evidence, but older tests using Jan/Cowork routing/Jan bootstrap are **development evidence only**, not the new Alpha proof.
- Batch 4G and successors: **Alpha-critical** Cowork and non-inheritable Jan extraction, import/dispatch/IPC/build-graph inventory, replacement and runtime/bundle exclusions. The handoff must be reconciled with this decision.
- Diagnostics stream: **Alpha-critical** end-to-end causal trace and failure localization DX-00..DX-04, not merely UI logs. Benchmarking remains post-Alpha.
- Protected `main` untouched. Do not equate a build SHA, smoke result, or source-only test with Alpha release.

## Blocking Alpha gates

| ID | Acceptance | Evidence required | Baseline |
| --- | --- | --- | --- |
| A01 | Clean NSIS install on Windows x86-64, GUI launch | Actual installed desktop log/screenshots and run URL | Unverified complete |
| A02 | Select GGUF, load and produce visible assistant response | Real WebView2 test with generated response, not just catalog or worker | W01 failed, run 40824127456 |
| A03 | Native Protobuf tool turn with model result and persisted transcript | Installed/GUI end-to-end proof, schema and auth assertions | W03 worker partial pass, run 40821973595 |
| A04 | Deny forged/foreign session, revoked permissions, invalid scope | Real runtime negative assertions | W02 parsing blocked, run 40824127456 |
| A05 | Stop generation, release worker, relaunch and cancel durable tasks | Windows process-exit and recovery evidence | W04 partial pass, run 40824127456; 4F regression passes |
| A06 | Profile A/B/A isolation and relaunch | Installed NSIS restart test and preserved profile state | W05 PowerShell HOME collision, run 40821973595 |
| A07 | NSIS replacement, external user-data sentinel, uninstall | Actual cross-commit install/replacement/uninstall test | W06 missing prior LICENSE, run 40823011654 |
| A08 | Manifest and license integrity | Strict sealed inventory; Jan Apache-2.0 LICENSE/NOTICE provenance | Earlier package inventory failures; W06 failure |
| A09 | First-run failure UX and recoverability | Installed GUI error paths; no silent success | Not verified |

## NEW ARCHITECTURAL AND DIAGNOSTIC BLOCKERS (additional to A01–A09)

| Gate | Mandatory outcome | Evidence |
| --- | --- | --- |
| AX-00 | Complete import/call/feature/resource graph and explicit inherit/reject classification of Jan-origin modules | File/symbol level source audit with ownership, current reachability, reason for retention/removal |
| AX-01 | Lu-owned chat, inference, tool/worker and UI routes replace Cowork/legacy fallbacks | Native GGUF to model tool to Protobuf dispatcher to persisted reply; negative authority checks |
| AX-02 | **No Cowork and no non-inheritable Jan feature shipped or reachable** | Optimized UI/native build dependency audit, Tauri command/plugin/feature audit, NSIS inventory and installed Windows dynamic negative probes |
| DX-00..DX-04 | **End-to-end causal diagnostics actually localize faults** | Schema/allowlist tests, controlled injected faults, real installed Windows trace across GUI/host/engine/tool/stream/persistence, redacted local report and no observable security/latency regression |
| AX-03 | Requalify existing A01–A09 and W01–W06 on one new independent Alpha candidate | Real Windows NSIS installer provenance, GGUF responses, tool result, cancellation, profile isolation, upgrade/uninstall |
| AX-04 | Jan-origin licensed artifacts and intentional third-party inheritance explicitly reviewed | Component inventory, modified-file notices, LICENSE/NOTICE installed and exact package/manifest provenance |

Previously passed 4F, 4G, 4H and six-support-gate tests are useful
**component evidence**, not proof of AX/DX or of the new release. A01–A09
alone are **necessary but insufficient**. The old candidate pin is retained
unchanged as historical evidence; it cannot silently be relabeled as the
new Cowork-free build.

## Acceptance rules

1. Record exact commit SHA, installer artifact digest, Windows runner and full workflow URL per gate.
2. Harness and script passes are supporting evidence only; mark actual installed GUI separately.
3. No gate passes based on an expected future build, cancelled/superseded workflow, or changed build SHA alone.
4. Never loosen inference manifest checks, host-owned conversation authorization, durable effect journal, or Jan/Apache attribution to pass a test.
5. **No Cowork in Alpha**: none compiled/bundled/routable/registered, even as a disabled compatibility option. No non-inheritable Jan feature in the Alpha build graph or package. Only explicitly approved, documented, licensed, tested, Cowork-independent Jan-derived foundation modules may remain.
6. Alpha requires all A01–A09 (as applicable), AX-00..04 and DX-00..04 verified against one **newly pinned Cowork-free** Windows candidate. An existing A01–A09 schema-only validator does not authorize this rebaselined release; add independent fail-closed AX/DX evidence first.
7. Keep Alpha packaging, 4H fixes and 4G extraction on independent branches; merge only after review and CI. User-installed AppData is out of scope.

## Engineering priority update — 2026-10-29

**Alpha diagnostics scope increased:** an actual fault-localization pipeline
must correlate user submission, persisted USER role, Tauri IPC, host
authorization, worker/model loop, model boundary and native tool dispatch,
response transport, assistant persistence and GUI rendering. It must
identify confirmed and unconfirmed stages, failure code, bounded timing,
missing evidence and safe next probes. The existing content-free ring and
frontend export are useful D0 primitives **but do not satisfy DX gates**.
No unsafe log dumps, no silent remote telemetry, no autonomous permissions
or unapproved repair. Details: [DX specification](lu-alpha-diagnostics-fault-localization-2026-10-29.md).
This instrumented pipeline is required **before final Alpha release**.

**Defer benchmarking to a later revision.** Do not include TPS/throughput,
cold-vs-warm benchmark suites, cross-model evaluation, matched Cognitum
runs or resource-heavy performance experiments in the Alpha diagnostic
implementation. Deterministic targeted *fault-injection* checks and verified
process/worker health are in scope when needed to isolate an actual defect;
active operations/restarts require user authorization and disposable profiles.
No automated repair/remote bridge/telemetry in Alpha.

Diagnostic design baseline: `docs/lu-alpha01-diagnostics-acceptance-2026-10-29.md`
and `docs/lu-p4-diagnostics-design.md` on the diagnostic branch. The
[DX rebaseline](lu-alpha-diagnostics-fault-localization-2026-10-29.md)
extends them from passive breadcrumbs into end-to-end fault localization.
Diagnostics implementation must be tested against these newly added DX gates.

## Immediate next implementation queue

- 4H-A: diagnose JSONL parsing failure and PowerShell HOME assignment; repair scripts in independent commit(s), test locally and in Windows CI.
- **DX-00..DX-04 (Alpha prerequisite):** implement scoped end-to-end causal tracing, safe correlation, stage/error localization, controlled boundary-failure probes and sanitized local/CI evidence. Passive breadcrumb work alone is not sufficient.
- 4H-B: resolve W01 using diagnosis and **Lu-owned** thread bootstrap; Jan mock-provider bootstrap and Cowork fallback cannot certify this Alpha.
- 4H-C: verify prior installer LICENSE/NOTICE inventory and cross-commit NSIS attribution; do not falsify the prior-artifact check.
- **AX-00/01/02/04:** classify and remove all Cowork/non-inheritable Jan runtime/build dependencies, replace required capabilities, independently verify no Cowork shipped.
- Alpha: build new per-artifact acceptance ledger, pin a **new** Cowork-free build, and execute A01–A09 **plus AX/DX** against that identical installed artifact.
- **4G is Alpha-critical:** expand beyond incremental optional extraction to complete Cowork/runtime and unapproved Jan feature removal; retain 4F authority/cancellation safeguards and Apache provenance.
- **POST-ALPHA (BLOCKED):** major Lu codebase/architecture/security review and prioritized v1.0 roadmap. Do not begin until the Alpha NSIS installer is built, installed and running with a real visible, persisted GGUF reply. See [post-Alpha v1.0 review backlog](lu-post-alpha-v1-code-review-backlog-2026-10-29.md).

## Baseline links

- Phase 4E real WebView2: https://github.com/vjmichael/jan_alt/actions/runs/40824127456
- Phase 4E fast harness (not real runtime): https://github.com/vjmichael/jan_alt/actions/runs/40824132865
- Phase 4C installed worker/profile: https://github.com/vjmichael/jan_alt/actions/runs/40821973595
- Phase 4D NSIS integrity: https://github.com/vjmichael/jan_alt/actions/runs/40823011654
- Batch 4G handoff: docs/lu-batch-4g-jan-dependency-extraction-work-handoff-2026-10-29.md on work/lu-batch4g-jan-extraction-handoff-20261029
