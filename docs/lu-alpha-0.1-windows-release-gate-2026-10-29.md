# Lu Alpha 0.1 — Windows x86-64 release gate

Date: 2026-10-29
Scope: candidate acceptance only. This document is not evidence of a shipped or GUI-verified release.

## Parallel work ownership

- Alpha 0.1 gate (this branch): release matrix, evidence ledger, candidate readiness; do not silently integrate unfinished 4G extraction.
- Phase 4H: repair failing W01/W02/W05/W06 acceptance, retaining W04 cancellation and W03 installed-worker assertions. Fix scripts without weakening checks.
- Batch 4G: independent Jan-dependency extraction, based on 4F handoff; no Alpha dependency on full Jan removal.
- Protected main untouched. Do not equate changed commit with semantic-version upgrade.

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

## Acceptance rules

1. Record exact commit SHA, installer artifact digest, Windows runner and full workflow URL per gate.
2. Harness and script passes are supporting evidence only; mark actual installed GUI separately.
3. No gate passes based on an expected future build, cancelled/superseded workflow, or changed build SHA alone.
4. Never loosen inference manifest checks, host-owned conversation authorization, durable effect journal, or Jan/Apache attribution to pass a test.
5. Alpha 0.1 can retain isolated, attributed Jan compatibility components; publish a remaining-dependencies ledger.
6. Alpha candidate requires A01–A08 passing with actual Windows evidence; A09 must have documented manual or automated verification before public distribution.
7. Keep Alpha packaging, 4H fixes and 4G extraction on independent branches; merge only after review and CI. User-installed AppData is out of scope.

## Immediate next implementation queue

- 4H-A: diagnose JSONL parsing failure and PowerShell HOME assignment; repair scripts in independent commit(s), test locally and in Windows CI.
- 4H-B: trace GGUF token -> desktop transport -> persisted assistant -> rendered reply, distinguishing model failure from test-observer failure.
- 4H-C: verify prior installer LICENSE/NOTICE inventory and cross-commit NSIS attribution; do not falsify the prior-artifact check.
- Alpha: build a per-artifact acceptance ledger and execute A01–A09 against one pinned candidate after fixes.
- 4G: continue independent 4G-A/4G-B extraction with 4F safeguards and Apache provenance.

## Baseline links

- Phase 4E real WebView2: https://github.com/vjmichael/jan_alt/actions/runs/40824127456
- Phase 4E fast harness (not real runtime): https://github.com/vjmichael/jan_alt/actions/runs/40824132865
- Phase 4C installed worker/profile: https://github.com/vjmichael/jan_alt/actions/runs/40821973595
- Phase 4D NSIS integrity: https://github.com/vjmichael/jan_alt/actions/runs/40823011654
- Batch 4G handoff: docs/lu-batch-4g-jan-dependency-extraction-work-handoff-2026-10-29.md on work/lu-batch4g-jan-extraction-handoff-20261029
