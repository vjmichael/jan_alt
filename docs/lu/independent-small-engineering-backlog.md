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
| S15 | Verify cancellation is idempotent for already completed turns and wrong sessions | Lu Core supervisor tests | Queued |
| S16 | Verify persisted conversation metadata/path redirection refusal | Lu Core persisted turn verifier tests | Done |
| S17 | Add deterministic error-code contract checks for native tool failures | Unit tests for typed error envelopes | Queued |
| S18 | Verify persisted permission revocation rejects new native task grants | Lu Core conversation authority tests | Done |
| S19 | Verify strict Protobuf message/version mismatch refusal | Lu Core wire tests | Done |
| S20 | Verify native registry identity and typed dispatch contracts | Lu Core and web adapter tests | Done |
| S21 | Verify durable task progress and restart checkpoints | Lu Core task checkpoint tests | Done |
| S22 | Verify ANSF+SQLite cross-chat links never become instruction authority | Memory/continuity unit tests | Queued |
| S23 | Add small consistent benchmark result schema fixtures across LLM tiers | Standalone schema tests, no model runs | Queued |
| S24 | Add a file-export artifact naming/provenance contract test | Standalone contract tests | Queued |
| S25 | Check Jan-derived source markers, NOTICE and installer resource manifests | Existing license provenance CI + focused tests | Done |

## Requires Windows, model, packaging, or OS-runner acceptance

| ID | Task | External acceptance gate | Status |
| --- | --- | --- | --- |
| W01 | Execute saved USER message -> native read tool -> GGUF continuation in actual WebView2 chat | Real GUI worker and marker-file E2E | Blocked: bootstrap test assertion; PR #29 |
| W02 | Reject a non-user saved message and missing thread from actual Tauri IPC | Windows WebView2 denial E2E | Queued |
| W03 | Confirm the installed x86-64 NSIS model/worker lookup and GGUF response | Installed-package smoke | External gate; installer development |
| W04 | Confirm cancellation preempts real worker generation and leaves stable chat state | Windows model/runtime test | Queued |
| W05 | Validate Windows profile isolation, restart recovery, and no AppData cross-access | Disposable Windows profile test | Queued |
| W06 | Test upgrade/uninstall retained Apache notices and independent Lu data | Disposable NSIS runner | Queued |

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
- Batch verified progress: 20 of 25 S tasks done; 5 S tasks queued; 6 W tasks require Windows or other real-runtime gates.
