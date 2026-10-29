# Lu small-task phased execution and CI ledger

Updated 2026-10-28 (America/Phoenix). Review order is deliberate:
a phase's result is verified only when **its own latest commit** has green
acceptance CI. A passing older run does not pass changed source.

| Phase | Scope | Acceptance / promotion gate | Branch | Status |
| --- | --- | --- | --- | --- |
| 0 — Baseline | S01–S14, S16, S18–S21, S25 (20 independent tasks) | Fast IPC, frontend, prompt, native security, continuity CI | `work/lu-independent-small-tasks-20261028` | **Done** — [run 40817540189](https://github.com/vjmichael/jan_alt/actions/runs/40817540189) |
| 1 — Reliability | S15 repeated cancel/wrong-session/completed-turn behavior; S17 non-sensitive typed native errors | `lu-phased-small-tasks.yml` Rust tests + error-contract checks, green on phase SHA | `work/lu-phase1-reliability-20261028` | **Done** — [run 40818158751](https://github.com/vjmichael/jan_alt/actions/runs/40818158751) |
| 2 — Continuity | S22 data-only linked-chat reference contract (desktop integration deferred) | Focused Lu Core authority + ANSF link tests | `work/lu-phase2-linked-data-20261028` | **Done** — [run 40818482221](https://github.com/vjmichael/jan_alt/actions/runs/40818482221) |
| 3 — Data contracts | S23 matched LLM benchmark result schema; S24 safe export filename/provenance schema | Deterministic headless Rust schema tests | `work/lu-phase3-data-contracts-20261028` | Implemented; awaiting CI |
| 4 — Windows integration | W01–W06 GUI GGUF native tool, denial, NSIS, cancellation, profile, notices | Each specific Windows/installer E2E; no synthetic substitute | Existing installer/desktop acceptance branches | Blocked on specific E2E gates |

## CI bookkeeping

| Revision or run | Checks | Result | Action |
| --- | --- | --- | --- |
| 40817047929 | Fast desktop IPC, Lu frontend, saved user-turn prompt | Passed | Baseline first batch |
| 40817331865 | Six native file/JSON/tool authority/effect journal/Protobuf checks | Passed | Baseline second batch |
| 40817540189 | Saved-turn verification, native registry, task checkpoints, ANSF/continuity and other fast jobs | Passed | Baseline third batch |
| 40818158751 (Phase 1) | Cancellation and typed-dispatch-error Rust checks | **Passed** | S15 and S17 verified |
| 40818482221 (Phase 2) | Host-authorized data-only linked chat and ANSF/authority tests | **Passed** | S22 foundation verified; desktop integration deferred |
| Phase 3: pending | Matched benchmark and safe export contracts | Running/pending | Do not mark S23/S24 done until green |
| Windows E2E 40814426273 | GGUF -> native file tool from WebView2 | **Failed in mock bootstrap**, before tool execution | Fix `Expected exactly one mock bootstrap turn` first |

## Controls

- Use separate `work/lu-phase*` branches and small commits, with draft PRs targeting the prior phase.
- Always test model permissions as host-owned; no model-origin elevation and no required MCP transport.
- JSON repair then schema validation belongs at model/external boundaries; native tool dispatch stays typed Protobuf.
- Preserve Jan Apache-2.0 attribution where reused; no protected-main or installed Windows AppData changes.
- Headless tests are necessary but cannot certify actual Windows GUI/native GGUF, installed worker discovery, or cancellation timing.
- On CI failure: record the exact failing step and root cause, fix it on the same phase, and rerun before promotion.
- On completion: update the status, exact commit SHA, run ID and outcome in this document and in the 31-task ledger.
