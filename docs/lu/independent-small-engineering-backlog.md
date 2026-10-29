# Lu small, independent engineering task ledger

Updated: 2026-10-28 (America/Phoenix). Scope: Windows-first Lu core; no changes to Cognitum.
This is the durable task list requested by the project owner. Tasks must be small,
reviewable, independently testable, and safe to develop outside the installer branch.
A committed patch is **not** a verified pass; record CI evidence before marking Done.

**Statuses**: Done = implemented and relevant acceptance checks passed;
Implemented/verify = code committed, CI or review outstanding; Queued = not started;
Blocked = waiting on a concrete external input or supported environment.
No CI job is assumed to be a background developer. Do not auto-merge protected main.

## Ready for local/headless execution

| ID | Task | Acceptance gate | Status |
| --- | --- | --- | --- |
| S01 | Maintain this prioritized task ledger, links, outcomes, and dependencies | Committed ledger under docs/lu | Done |
| S02 | Validate only the current user turn in Lu text-only chat, allowing older attachments and tool records | Existing Lu Vitest plus new history test | Done |
| S03 | Enforce current-turn Unicode byte limits rather than JavaScript string length | Emoji boundary tests: 4096 pass, 4097 rejected | Done |
| S04 | Check both feature-enabled and feature-disabled Tauri native-turn signatures | Static gate + mutation tests | Done |
| S05 | Require precisely sessionId/turnId in JS cancellation IPC and host wrappers | Static gate + additional-field mutation tests | Done |
| S06 | Guard trusted primary window and read-only native grants against source regressions | Static gate + mutation tests | Done |
| S07 | Reuse fast chat/IPC checks on future Lu working branches | GitHub CI triggers and green Node job | Done |
| S08 | Run targeted Lu chat frontend tests without compiling Windows Tauri | Green frontend job with matching Vitest tests | Done |
| S09 | Add saved-chat prompt JSONL line-count, byte-size, and malformed-history tests | Lu Core unit tests | Done |
| S10 | Add saved-chat prompt rolling-history and nontext-history tests | Lu Core unit tests | Done |
| S11 | Test native-file path traversal and symlink denial for read-only tools | Lu Core native_files security tests | Done |
| S12 | Test JSON repair-then-validate with malformed-but-repairable model tool arguments | Lu Core model JSON boundary tests | Done |
| S13 | Test tool allowlist rejection of write/shell/MCP capabilities in desktop mode | Lu Core authority and registry tests | Done |
| S14 | Verify journal/tool effect IDs remain idempotent after interrupted replay | Lu Core journal tests | Done |
| S15 | Verify repeated active cancellation, wrong-session denial, and completed-turn no-op denial | Lu Core supervisor tests | Done |
| S16 | Verify persisted conversation metadata/path redirection refusal | Lu Core persisted turn verifier tests | Done |
| S17 | Add deterministic non-sensitive error-code families for native dispatch failures | Unit tests for typed dispatch errors | Done |
| S18 | Verify persisted permission revocation rejects new native task grants | Lu Core conversation authority tests | Done |
| S19 | Verify strict Protobuf message/version mismatch refusal | Lu Core wire tests | Done |
| S20 | Verify native registry identity and typed dispatch contracts | Lu Core and web adapter tests | Done |
| S21 | Verify durable task progress and restart checkpoints | Lu Core task checkpoint tests | Done |
| S22 | Add host-authorized data-only ANSF cross-chat reference contract; desktop integration deferred | Link/authority/ANSF regression tests | Done |
| S23 | Add small consistent benchmark result schema fixtures across LLM tiers | Standalone schema tests, no model runs | Done |
| S24 | Add a file-export artifact naming/provenance contract test | Standalone contract tests | Done |
| S25 | Check Jan-derived source markers, NOTICE and installer resource manifests | Existing license provenance CI + focused tests | Done |

## Requires Windows, model, packaging, or OS-runner acceptance

| ID | Task | External acceptance gate | Status |
| --- | --- | --- | --- |
| W01 | Execute persisted USER message -> native Protobuf tool -> real GGUF continuation through WebView2 | Real GUI worker/PID/marker-file E2E | 40819829581 blocked by unmanifested debug package; 4E sealed staging fix passed fixture, WebView2 run 40824127456 pending |
| W02 | Reject missing/non-user saved messages, bad thread/session and malformed turn IDs from actual Tauri IPC | Real Windows WebView2 denial assertions | 40820583117 blocked before policy assertions by debug package; 4E combined rerun 40824127456 pending |
| W03 | Verify exact NSIS-installed x64 worker/engine resource identity and real pinned GGUF + Protobuf tool response | Windows NSIS smoke (`-ProbeWorker -ProbeInstalledNativeToolTurn`) | Integrated; awaiting current full installer CI |
| W04 | Cancel real trusted GGUF generation without stranding backend; separately verify in-flight native tool cancellation later | Real Windows WebView2 cancellation + journal follow-up | 40820583117 blocked before model load; 4E combined rerun 40824127456 pending |
| W05 | Verify installed Lu profile A → B → A restart, native worker ownership, independent profile files and Jan sentinel | Real installed Windows process smoke (`-ProbeProfileRestart`) | Implemented; fast syntax and real installer CI pending |
| W06 | Verify prior-commit to current NSIS replacement, license/NOTICE hashes, preservation of Lu/Jan profile and jan:// canaries, then uninstall | Real cross-commit Windows installation, not a synthetic reinstall | Prepared; fast harness 40822820648 passed; Windows run 40822939647 pending |

## Independence and scope rules

- Execute queued **S** tasks in small reviewable commits, preferably using Lu Core tests or Node/Vitest without local user-data access.
- No task may silently enable model-issued authority, user filesystem writes, shell/MCP as native default, or bypass JSON repair-then-validation.
- Native internal tool contracts are typed Protobuf; JSON is limited to model/external boundaries.
- Keep Jan-derived Apache-2.0 provenance and preserve attribution when moving code.
- CI may run concurrently, but a green unit test never stands in for a Windows E2E assertion.
- Never block a completed **S** task solely because a **W** task is pending. Do not touch protected main or the installed user's Windows AppData.
- Long-term DLC Workspaces, Cognitum, Linux/macOS, and the larger Jan dismantling work are tracked separately; they are not prerequisites for these quick tasks.

## Evidence log

- Pre-existing Lu native chat IPC gate: PR #31, GitHub run 40815822840 passed.
- Pre-existing saved-user prompt gate: PR #30; native Rust loop and frontend adapter checks passed.
- Pre-existing desktop tool loop: PR #29; Windows Tauri/TypeScript passed; actual WebView2 proof is separate.
- This batch branch: `work/lu-independent-small-tasks-20261028`, draft PR #32.
- Full-pass evidence: GitHub Actions run 40816910684 (IPC checker, targeted frontend, and headless Rust prompt-limit suite all passed).
- Subsequent fixture correction: GitHub Actions run 40817047929 (IPC checker and Rust prompt-limit suite passed; current-branch frontend source unchanged since earlier green CI).
- S01-S10 are Done for the specified static/frontend/headless checks. This does not imply Windows WebView2 acceptance.
- S11-S14, S18, and S19: existing Lu Core test suites audited and executed in GitHub Actions run 40817331865; all six suites passed without requiring an installer. Those tasks verified existing protection, not newly authored implementations.
- The same run 40817331865 passed the IPC, saved-chat prompt, and Lu frontend jobs, confirming the small-batch gate after the CI concurrency change.
- S16/S20/S21: verified persisted turn checks, registry identity, task checkpoints, plus ANSF/continuity scoping in all-green GitHub run 40817540189. Existing coverage for broader cross-chat instruction authority remains incomplete (S22 queued).
- S25: Jan-origin copyright and installer notice provenance passed in GitHub run 40816844868. This is not final commercial release licensing clearance.
- W01: Windows WebView2 run 40814426273 failed **before** testing native tool dispatch: `Expected exactly one mock bootstrap turn`; investigate the bootstrap mock-message timing and test harness before rerunning expensive GGUF E2E.
- Phase 1 reliability: S15/S17 green in run 40818158751; typed errors and cancellation tests passed. 22 of 25 headless S tasks done at Phase 1 (3 queued), before Phase 2 validation.

- Phase 2 continuity: S22 data-only reference contract, host permission, role demotion, ANSF tests green in run 40818482221. 23/25 headless S tasks verified; remaining S23/S24 data contracts, plus Windows W01-W06. This does not certify desktop cross-chat UI integration.

- Phase 3 schema contracts: S23/S24 Rust tests green in run 40819003672; 25 of 25 headless S tasks complete (data contracts only, not frontend export/benchmark implementation). Six Windows/runtime W acceptance gates remain.
- Broader Lu Core Contracts run 40819003740 found rustfmt diffs in batch-added files. Exact formatting applied in cleanup phase; green formatter rerun still required before merge.

- Phase 4B launched: draft PR #38 (`work/lu-phase4b-security-cancel-20261028`), W02 five denial probes plus W04 active GGUF cancellation with session/PID checks. Fast WDIO harness passed in 40820621867. Real Windows security acceptance on 40820583117 remains pending. No W02/W04 completion claimed until actual Windows results.

- Phase 4C: a separate branch adds `scripts/check-lu-windows-profile-restart.ps1` plus optional smoke parameter; the NSIS CI now invokes it with existing installed worker/GGUF assertions. W03 and W05 are **not** marked complete until real installed Windows acceptance passes. No user's Windows AppData is accessed by these tests.

- Phase 4D draft PR #40: version-aware provenance identifies two distinct Lu NSIS commit builds without inventing semantic release versions. Current Lu and Jan data markers, original Jan `jan://` protocol association, and the full bundled Apache-2.0 license must survive actual older→newer installer replacement and silent uninstall. Fast PowerShell parser/root/forged-artifact gate passed in 40822820648; full W06 acceptance on 40822939647 is pending. No user's AppData is touched.

- Phase 4E (`work/lu-phase4e-runtime-package-recovery-20261028`, draft PR #41): both W01 40819829581 and W02/W04 40820583117 failed during strict package inventory verification, before real GGUF load. CI-only exact-file staged copy now prevents nested/stray debug resources; fast Windows staging/tamper/negative tests passed 40824132865. The real combined WebView2 acceptance 40824127456 remains pending, so W01/W02/W04 are **not** completed.
