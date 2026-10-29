# Lu small-task phased execution and CI ledger

Updated 2026-10-28 (America/Phoenix). Review order is deliberate:
a phase's result is verified only when **its own latest commit** has green
acceptance CI. A passing older run does not pass changed source.

| Phase | Scope | Acceptance / promotion gate | Branch | Status |
| --- | --- | --- | --- | --- |
| 0 — Baseline | S01–S14, S16, S18–S21, S25 (20 independent tasks) | Fast IPC, frontend, prompt, native security, continuity CI | `work/lu-independent-small-tasks-20261028` | **Done** — [run 40817540189](https://github.com/vjmichael/jan_alt/actions/runs/40817540189) |
| 1 — Reliability | S15 repeated cancel/wrong-session/completed-turn behavior; S17 non-sensitive typed native errors | `lu-phased-small-tasks.yml` Rust tests + error-contract checks, green on phase SHA | `work/lu-phase1-reliability-20261028` | Implemented; awaiting phase CI |
| 2 — Continuity | S22 linked chats remain data rather than authority | Focused Lu Core authority + ANSF link tests | Planned separate branch, stack on phase 1 after green | Queued |
| 3 — Data contracts | S23 LLM benchmark result schema; S24 export filename/provenance schema | Deterministic no-model schema fixtures, Rust/Node tests | Planned separate branch, stack on phase 2 | Queued |
| 4 — Windows integration | W01–W06 GUI GGUF native tool, denial, NSIS, cancellation, profile, notices | Each specific Windows/installer E2E; no synthetic substitute | Existing installer/desktop acceptance branches | Blocked on specific E2E gates |

## CI bookkeeping

| Revision or run | Checks | Result | Action |
| --- | --- | --- | --- |
| 40817047929 | Fast desktop IPC, Lu frontend, saved user-turn prompt | Passed | Baseline first batch |
| 40817331865 | Six native file/JSON/tool authority/effect journal/Protobuf checks | Passed | Baseline second batch |
| 40817540189 | Saved-turn verification, native registry, task checkpoints, ANSF/continuity and other fast jobs | Passed | Baseline third batch |
| Phase 1: pending | Cancellation and typed-dispatch-error Rust checks | Pending | Do not mark S15/S17 done until green |
| Phase 2: pending | Linked chat authority tests | Not started | Wait for phase 1 green |
| Phase 3: pending | Schema contracts | Not started | Wait for phase 2 green |
| Windows E2E 40814426273 | GGUF -> native file tool from WebView2 | **Failed in mock bootstrap**, before tool execution | Fix `Expected exactly one mock bootstrap turn` first |

## Controls

- Use separate `work/lu-phase*` branches and small commits, with draft PRs targeting the prior phase.
- Always test model permissions as host-owned; no model-origin elevation and no required MCP transport.
- JSON repair then schema validation belongs at model/external boundaries; native tool dispatch stays typed Protobuf.
- Preserve Jan Apache-2.0 attribution where reused; no protected-main or installed Windows AppData changes.
- Headless tests are necessary but cannot certify actual Windows GUI/native GGUF, installed worker discovery, or cancellation timing.
- On CI failure: record the exact failing step and root cause, fix it on the same phase, and rerun before promotion.
- On completion: update the status, exact commit SHA, run ID and outcome in this document and in the 31-task ledger.
