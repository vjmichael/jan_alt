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
| S01 | Maintain this prioritized task ledger, links, outcomes, and dependencies | Committed ledger under docs/lu | Implemented/verify |
| S02 | Validate only the current user turn in Lu text-only chat, allowing older attachments and tool records | Existing Lu Vitest plus new history test | Implemented/verify |
| S03 | Enforce current-turn Unicode byte limits rather than JavaScript string length | Emoji boundary tests: 4096 pass, 4097 rejected | Implemented/verify |
| S04 | Check both feature-enabled and feature-disabled Tauri native-turn signatures | Static gate + mutation tests | Implemented/verify |
| S05 | Require precisely sessionId/turnId in JS cancellation IPC and host wrappers | Static gate + additional-field mutation tests | Implemented/verify |
| S06 | Guard trusted primary window and read-only native grants against source regressions | Static gate + mutation tests | Implemented/verify |
| S07 | Reuse fast chat/IPC checks on future Lu working branches | GitHub CI triggers and green Node job | Implemented/verify |
| S08 | Run targeted Lu chat frontend tests without compiling Windows Tauri | Green frontend job with matching Vitest tests | Implemented/verify |
| S09 | Add saved-chat prompt JSONL line-count, byte-size, and malformed-history tests | Lu Core unit tests | Queued |
| S10 | Add saved-chat prompt rolling-history and nontext-history tests | Lu Core unit tests | Queued |
| S11 | Test native-file path traversal and symlink denial for read-only tools | Lu Core native_files security tests | Queued |
| S12 | Test JSON repair-then-validate with malformed-but-repairable model tool arguments | Lu Core model JSON boundary tests | Queued |
| S13 | Test tool allowlist rejection of write/shell/MCP capabilities in desktop mode | Lu Core authority and registry tests | Queued |
| S14 | Verify journal/tool effect IDs remain idempotent after interrupted replay | Lu Core journal tests | Queued |
| S15 | Verify cancellation is idempotent for already completed turns and wrong sessions | Lu Core supervisor tests | Queued |
| S16 | Audit conversation metadata/link redirection and oversized files | Host and Lu Core security tests | Queued |
| S17 | Add deterministic error-code contract checks for native tool failures | Unit tests for typed error envelopes | Queued |
| S18 | Verify persisted permission revocation rejects new native task grants | Lu Core conversation authority tests | Queued |
| S19 | Add tests for strict Protobuf message/version mismatch refusal | Lu Core wire tests | Queued |
| S20 | Audit and test the Lu-native tool catalog for consistent schemas/names | Lu Core and web adapter tests | Queued |
| S21 | Add task lifecycle state-transition and completion/kill result regression tests | Lu Core task supervisor tests | Queued |
| S22 | Verify ANSF+SQLite cross-chat links never become instruction authority | Memory/continuity unit tests | Queued |
| S23 | Add small consistent benchmark result schema fixtures across LLM tiers | Standalone schema tests, no model runs | Queued |
| S24 | Add a file-export artifact naming/provenance contract test | Standalone contract tests | Queued |
| S25 | Check Jan-derived source markers, NOTICE and installer resource manifests | Existing license provenance CI + focused tests | Queued |

## Requires Windows, model, packaging, or OS-runner acceptance

| ID | Task | External acceptance gate | Status |
| --- | --- | --- | --- |
| W01 | Execute saved USER message -> native read tool -> GGUF continuation in actual WebView2 chat | Real GUI worker and marker-file E2E | External gate; PR #29 |
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
- This batch branch: `work/lu-independent-small-tasks-20261028`. Update statuses and evidence as CI verifies each patch.
