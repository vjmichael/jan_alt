# Lu small-task phased execution and CI ledger

> **2026-10-29 release-scope supersession:** This ledger is a **historical
> record of individually tested components**, not evidence that the revised
> Alpha is ready. Alpha is postponed and must now exclude all Cowork and
> non-inheritable Jan features, and pass end-to-end DX fault-localization
> gates. Earlier W01–W06 tests, Jan-provider-based WebView2 bootstraps,
> staging harnesses and old source pins cannot certify the new architecture.
> See [rebaselined Alpha](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
> Benchmarking remains for a later revision. The phase table below retains
> its original chronology for audit/provenance; it is **not** the new critical
> path. Continue 4G as an Alpha-blocking removal program with independent gates.


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
| 4B — Host denial and cancellation | W02: invalid saved USER ID, non-user role, bad thread/session; W04: real GGUF generation cancellation | Independent real WebView2 Windows runner + disposable profile | `work/lu-phase4b-security-cancel-20261028` — PR #38 | Fast harness green; real Windows failed during package initialization; in-flight native tool cancellation unproven |
| 4C — Installed package and profile restart | W03 actual NSIS-installed inference engine/worker with pinned GGUF; W05 A → B → A installed desktop restart | Real Windows NSIS smoke with included `-ProbeProfileRestart`; separate fast PowerShell parser/safety checks | `work/lu-phase4c-installer-profile-20261028` | Implemented; Windows installer acceptance pending |
| 4D — Release integrity | W06 previous x64 Lu NSIS → current x64 Lu NSIS, then uninstall; Jan/Apache notices and Lu/Jan data survive | Real Windows two-artifact installer test, plus fast syntax/denial gate | `work/lu-phase4d-release-integrity-20261028` — draft PR #40 | Harness passed; real NSIS replacement/uninstall pending |
| 4E — Debug resource integrity recovery | W01/W02/W04 shared WebView2 `unmanifested files` blocker | Verify sealed manifest + copy each listed component without nesting, strict negative tests, then actual real GGUF WebView2 | `work/lu-phase4e-runtime-package-recovery-20261028` — draft PR #41 | Sealed staging harness passed 40824132865; real WebView2 still running |
| 4F — Native tool lifecycle | Cancel/revoke during real async native Protobuf invocation; durable replay/crash uncertainty | Headless Rust integration and effect-journal regression; Windows hard-preemption separately | `work/lu-phase4f-native-tool-lifecycle-20261028` — draft PR #42 | **Core regression verified** 40825591806; tool preemption and desktop E2E remain open |

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
| 40819829581 (Phase 4A Windows) | Real WebView2 GGUF/native Protobuf tool-turn E2E | **Failed** | Bootstrap recovered, but `unmanifested files in Lu inference package` blocked model catalog and real tool use |
| 40819601572 (Phase 3 CI cleanup) | Lu Core format, lint, contract suites and Windows OS confinement | **Passed** | Style/contract cleanup completed on that SHA |
| 40821792237 (Phase 4C harness) | Windows PowerShell parser, NSIS wiring and runner-only path guard | **Passed** | Not evidence of installed app runtime behavior |
| 40821792010 (Phase 4C NSIS) | Installer build, installed engine worker + GGUF + native tool, profile A/B/A process restart | **Running** | W03/W05 remain open pending real Windows result |
| 40820621867 (Phase 4B fast harness) | WDIO TypeScript checks and W02/W04 test presence | **Passed** | Windows runtime acceptance still required |
| 40820583117 (Phase 4B Windows) | Real WebView2 denial + reserved GGUF cancellation | **Failed** | Shared `unmanifested files in Lu inference package` blocked model and security probes before verification |

| 40824132865 (Phase 4E fast harness) | Windows sealed debug-package exact inventory, tamper and nested/stale resource checks | **Passed** | Only fixture/staging pass, not GGUF runtime proof |
| 40824127456 (Phase 4E Windows) | Combined native GGUF tool, host denial, active-generation cancellation in actual WebView2 | **Running** | W01/W02/W04 remain open pending true runtime acceptance |
| 40822820648 (Phase 4D fast harness) | PowerShell script parser, CI wiring, runner-root denial, forged installer rejection | **Passed** | Does not prove installed package upgrade/uninstall |
| 40822939647 (Phase 4D NSIS) | Real prior/current cross-commit installer replacement + notices + uninstall, followed by W03/W05 smoke | **Running** | W06 pending actual Windows result; no production version-number claim |

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

### W01 independent blocker discovered during Batch 4C
Run 40819829581 verified the corrected bootstrap completed but the trusted inference package verifier failed with `unmanifested files in Lu inference package`; the model picker could not load, so it produced no valid GGUF/native tool result. Investigate the Debug WebView2 workflow's resource staging and duplicated `lu-inference` directory separately from W03's genuine NSIS-installed package verification. Do **not** relax the package manifest/hash verification to make the test pass.

## Phase 4D release-integrity criteria

- Previous baseline is the checksum-pinned actual Lu NSIS artifact from Actions run 40542686980, with recorded commit `d6edb050d797e0d492223db6da8f335dd7c37ce1`. This must be downloaded by `actions/download-artifact@v4` and verified against its own build manifest before execution.
- Fresh candidate is the current revision's actual x86-64 NSIS product, verified by its installer SHA-256, installed `Lu-Desktop.exe` digest, and its independently hash-pinned inference package manifest plus server. Both installs target the same unique directory under `RUNNER_TEMP`.
- Verify Jan/Menlo Research and Apache-2.0 notices in the prior release; after replacement, hash-compare LICENSE, NOTICE and full Apache text to the current source. Preserve test-created Lu and Jan user-data canaries plus the `jan://` registry sentinel through both installers and final uninstall.
- Require actual uninstall removal of installed executables, package components and license assets, while keeping external Lu/Jan user data intact. Cleanup is allowed only for script-created sentinels on a GitHub Windows ephemeral runner.
- Prior and current commits are different; **this is a cross-commit NSIS replacement test**, not a claim that a semantic-version migration, signed release, or distribution upgrade service is complete.
- W06 stays open until the actual Windows NSIS job `40822939647` passes the W06 marker. The fast harness run `40822820648` verifies only script syntax and negative preflight rules.

## Phase 4F lifecycle gates

- The previous supervisor path checked cancellation before the awaited Protobuf-native tool but not after it. Batch 4F rechecks the host cancellation signal and conversation authorization after the tool returns and before any second model generation. It records the completed tool feedback plus an interruption audit event; a side effect that already applied **cannot be assumed undone**.
- NativeToolTurn is terminally halted after a cancellation or full task revocation; stale output cannot execute a second operation on the same turn. The current task grant is also checked before each model generation.
- New fixture issues cancellation/revocation **inside** the native tool's async invoke, confirms one durable effect, one model generation only, no final answer, a recorded interruption, and rejection of replaying the identical call ID. A distinct test writes a real file after the effect enters EXECUTING, simulates abrupt termination before receipt, and verifies UNCERTAIN and no automatic replay on SQLite reopen.
- [Linux Rust CI 40825591806](https://github.com/vjmichael/jan_alt/actions/runs/40825591806) **passed**: 3 new native lifecycle tests, 4 supervised native turns, 4 effect-journal tests, 2 CE effect-fence tests, and cargo fmt --check.
- **Still open:** cooperative native worker cancellation before irreversible effects, effect-specific compensation, production journal integration for all write-capable tools, and actual Windows in-flight tool-call cancellation E2E. The Rust fixture verifies the core orchestration boundary, not forced termination of a worker or an already committed filesystem effect.

## Phase 4E sealed resource recovery

- W01 and W02/W04 Windows tests both failed at the same early boundary: `unmanifested files in Lu inference package` (40819829581 and 40820583117). The strict Rust verifier rejects files absent from a pinned package manifest. Therefore those failures **do not** prove the model tool loop, denial policy or cancellation failed; none reached its real GGUF acceptance.
- Original debug WebView2 workflow copied `src-tauri/resources/lu-inference` recursively into target locations which may already contain a same-named folder. New CI-only `scripts/stage-lu-webview2-sealed-engine.ps1` verifies source manifest SHA-256, server and each component digest, allowed names, exact file inventory and both output inventories. It stages listed files one by one into the two debug locations, replacing only disposable `src-tauri/target/debug` inference subfolders. The shipping Rust package verifier remains unchanged and strict.
- Fast synthetic Windows fixture test `40824132865` passed exact staging into both roots, replacement of stale debug-only files, rejection of unmanifested source files and rejection of changed engine bytes. W01/W02/W04 stay pending until real Windows WebView2 runner `40824127456` passes.
- W03/W05 installer runs and W06 prior→current NSIS replacement are separate, and a debug staging harness cannot satisfy their release gates. Protected main, Windows user AppData and Cognitum unchanged.
