# Lu small-task phased execution and CI ledger

Updated 2026-10-28 (America/Phoenix). Review order is deliberate:
a phase's result is verified only when **its own latest commit** has green
acceptance CI. A passing older run does not pass changed source.

| Phase | Scope | Acceptance / promotion gate | Branch | Status |
| --- | --- | --- | --- | --- |
| 0 — Baseline | S01–S14, S16, S18–S21, S25 (20 independent tasks) | Fast IPC, frontend, prompt, native security, continuity CI | `work/lu-independent-small-tasks-20261028` | **Done** — [run 40817540189](https://github.com/vjmichael/jan_alt/actions/runs/40817540189) |
| 1 — Reliability | S15 repeated cancel/wrong-session/completed-turn behavior; S17 non-sensitive typed native errors | `lu-phased-small-tasks.yml` Rust tests + error-contract checks, green on phase SHA | `work/lu-phase1-reliability-20261028` | **Done** — [run 40818158751](https://github.com/vjmichael/jan_alt/actions/runs/40818158751) |
| 2 — Continuity | S22 data-only linked-chat reference contract (desktop integration deferred) | Focused Lu Core authority + ANSF link tests | `work/lu-phase2-linked-data-20261028` | **Done** — [run 40818482221](https://github.com/vjmichael/jan_alt/actions/runs/40818482221) |
| 3 — Data contracts | S23 matched LLM benchmark result schema; S24 safe export filename/provenance schema | Deterministic headless Rust schema tests | `work/lu-phase3-data-contracts-20261028` | **Done** — [run 40819003672](https://github.com/vjmichael/jan_alt/actions/runs/40819003672) |
| 4 — Windows integration | W01–W06 GUI GGUF native tool, denial, NSIS, cancellation, profile, notices | Real Windows WebView2/NSIS E2E; no synthetic substitute | `work/lu-phase4-webview2-bootstrap-20261028` for W01 bootstrap harness | W01 fix implemented; awaiting real Windows acceptance; W02–W06 open |
| 4B — Host denial and cancellation | W02: invalid saved USER ID, non-user role, bad thread/session; W04: real GGUF generation cancellation | Independent real WebView2 Windows runner + disposable profile | `work/lu-phase4b-security-cancel-20261028` — PR #38 | Fast harness green; real Windows acceptance running; in-flight native tool cancellation unproven |
| 4C — Installed package and profile restart | W03 actual NSIS-installed inference engine/worker with pinned GGUF; W05 A → B → A installed desktop restart | Real Windows NSIS smoke with included `-ProbeProfileRestart`; separate fast PowerShell parser/safety checks | `work/lu-phase4c-installer-profile-20261028` | Implemented; Windows installer acceptance pending |

## CI bookkeeping

| Revision or run | Checks | Result | Action |
| --- | --- | --- | --- |
| 40817047929 | Fast desktop IPC, Lu frontend, saved user-turn prompt | Passed | Baseline first batch |
| 40817331865 | Six native file/JSON/tool authority/effect journal/Protobuf checks | Passed | Baseline second batch |
| 40817540189 | Saved-turn verification, native registry, task checkpoints, ANSF/continuity and other fast jobs | Passed | Baseline third batch |
| 40818158751 (Phase 1) | Cancellation and typed-dispatch-error Rust checks | **Passed** | S15 and S17 verified |
| 40818482221 (Phase 2) | Host-authorized data-only linked chat and ANSF/authority tests | **Passed** | S22 foundation verified; desktop integration deferred |
| 40819003672 (Phase 3) | Matched benchmark and safe export contracts + rerun earlier phases | **Passed** | S23/S24 verified, all 25 S tasks covered |
| Lu Core format check 40819003740 | Rustfmt style check for files added in batches | **Failed** | Exact formatter patches applied on `work/lu-phase3-ci-cleanup-20261028`; rerun pending |
| Windows E2E 40814426273 | GGUF -> native file tool from WebView2 | **Failed in mock bootstrap**, before tool execution | Fix `Expected exactly one mock bootstrap turn` first |
| 40819664847 (Phase 4 harness) | TypeScript E2E bootstrap fixture | **Passed** | Ready for actual Windows acceptance |
| 40819664805 (Phase 4 Windows) | Real WebView2 GGUF/native Protobuf tool-turn E2E | **Running** | W01 must remain open until actual marker/tool/PID checks pass |
| 40819601572 (Phase 3 CI cleanup) | Lu Core format, lint, contract suites and Windows OS confinement | **Passed** | Style/contract cleanup completed on that SHA |
| 40820621867 (Phase 4B fast harness) | WDIO TypeScript checks and W02/W04 test presence | **Passed** | Windows runtime acceptance still required |
| 40820583117 (Phase 4B Windows) | Real WebView2 denial + reserved GGUF cancellation | **Running** | W02/W04 pending actual negative and cancellation assertion results |

## Controls

- Use separate `work/lu-phase*` branches and small commits, with draft PRs targeting the prior phase.
- Always test model permissions as host-owned; no model-origin elevation and no required MCP transport.
- JSON repair then schema validation belongs at model/external boundaries; native tool dispatch stays typed Protobuf.
- Preserve Jan Apache-2.0 attribution where reused; no protected-main or installed Windows AppData changes.
- Headless tests are necessary but cannot certify actual Windows GUI/native GGUF, installed worker discovery, or cancellation timing.
- On CI failure: record the exact failing step and root cause, fix it on the same phase, and rerun before promotion.
- On completion: update the status, exact commit SHA, run ID and outcome in this document and in the 31-task ledger.

## Phase 4 W01 bootstrap root-cause update

Prior Windows E2E 40814426273 stopped in `before()` with `Expected exactly one mock bootstrap turn`. The initial mock stream was checked immediately after the composer returned, which is not proof the provider request was sent. Phase 4 explicitly waits for a nonzero provider-request count, records that actual bootstrap baseline, and then verifies no subsequent Lu-native GGUF turn touches Jan's provider. If no mock request occurs, the test still fails with a precise timeout; it does not permit unbootstrapped native tool tests to pass. The actual Windows E2E run is required to close W01.

Core formatting/lint cleanup: phase-specific run 40819003672 was green, while Lu Core Contracts 40819003740 failed the style gate. Formatting and the Clippy byte-length fix are in PR #36; its complete Core Contracts gate must be green before merge. Phase 4 is a draft stacked on that cleanup, not an installer release.

## Phase 4B evidence and limits

- W02 probe inputs: saved assistant-role message ID; missing user ID; missing canonical thread; wrong loaded session; malformed turn ID. Each must be rejected before a model generation, preserve session/PID, and avoid Jan-compatible provider calls.
- W04 probe: reserve a **real GGUF generation**, require foreign-session cancellation denial, signal the authorized generation, observe Ready with the identical PID, and demand `signalled:false` on unknown native-turn cancellation. This does **not** yet demonstrate end-to-end cancellation of an active native **tool-call** turn and its effect journal; that is a follow-up subgate.
- Windows tests run with `LU_E2E_SECURITY_ONLY=1` and the existing isolated `JAN_E2E_HOME` profile. The W01 tool-result marker test is deliberately skipped in this security-specific run and remains its own gate.
- A passing fast harness proves TypeScript syntax and test registration only, not that the Tauri security checks actually ran.

## Phase 4C installed-runtime and profile gates

- W03 uses existing `lu-windows-installer.yml` to compile an x86-64 Lu NSIS preview, pin/verify installed llama-server package and worker binaries, and run actual installed GGUF inference plus a native Protobuf tool continuation via `smoke-lu-windows-x64.ps1`. A debug WebView2 binary is **not** an installed-release substitute.
- W05 now runs a new installed `Lu-Desktop.exe` process three separate times in one disposable Windows runner: profile A first launch, independent profile B, then profile A restart. Each must persist a native-first configuration and spawn a directly owned worker, while source files in the inactive Lu profile and the distinct Jan sentinel remain unchanged. The A checkpoint must survive A restart. This verifies profile-level persistence, not yet resumed GUI chat history or active model session.
- The smoke script runs W05 **before** NSIS uninstall; only test-owned temporary profile directories may be cleaned. It refuses non-ephemeral Windows runners and installation directories outside RUNNER_TEMP.
- Fast harness `lu-phase4c-installer-profile-harness.yml` validates script syntax, smoke wiring and refusal of non-runner install roots; it is a prerequisite, **not** proof the installed application passed.
- W03/W05 must remain open until the actual Windows NSIS job completes these assertions. Existing W01/W02/W04 CI work remains independent.
