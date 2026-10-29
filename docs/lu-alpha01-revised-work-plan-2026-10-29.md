# Lu Alpha 0.1 — revised engineering task list, phases and acceptance gates

**Decision:** 2026-10-29. **Release state:** REBASELINED / ALPHA POSTPONED (no ETA). **Target:** Windows x86-64. **Document state:** authoritative *plan*, not verification or release approval.

This is the **single working checklist** for the revised Alpha, reflecting the user's two binding changes:

1. **Alpha ships without Cowork and without any unapproved/non-inheritable Jan feature** in its compiled frontend/native runtime, registered commands, bundled installer or reachable execution paths. Any Jan-derived *foundation* that Lu deliberately inherits must be explicitly approved, Cowork-independent, validated and attributed under its applicable license. Git history and provenance records are not runtime features and need not be erased.
2. **Alpha has an end-to-end diagnostic fault-localization capability** that can identify the last confirmed and first failed/unconfirmed stage of an operation, give a bounded fault region, state uncertainty, and support safe next probes. A ring of extra log lines by itself is insufficient.

**Deliberately deferred:** throughput/TPS benchmarks, model comparisons, Cognitum matched benchmarks, performance rankings, automatic tuning, continuous heavyweight monitoring, remote Lu-to-Lu diagnostics, unapproved repair, DLC Workspaces, and Linux/macOS distribution. Purposeful, bounded *fault injection* to verify diagnostic accuracy is required and is not a benchmark.

## 1. Source of truth and scope

- Architecture and release decision: [Cowork-free Alpha rebaseline](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
- Detailed diagnostic contracts and fault-localization acceptance: [DX specification](lu-alpha-diagnostics-fault-localization-2026-10-29.md).
- Exact installed-release evidence and A01–A09: [Windows Alpha release gate](lu-alpha-0.1-windows-release-gate-2026-10-29.md) and [Alpha acceptance](lu/alpha-acceptance.md).
- Existing extraction ownership and source inventory: [Batch 4G handoff](https://github.com/vjmichael/jan_alt/blob/work/lu-batch4g-jan-extraction-handoff-20261029/docs/lu-batch-4g-jan-dependency-extraction-work-handoff-2026-10-29.md).
- Existing passive diagnostics prototype: [D0/D1 branch](https://github.com/vjmichael/jan_alt/tree/work/lu-alpha01-diagnostics-priority-20261029). **Prototype does not satisfy DX-00..04.**
- Historical phase/test ledger: [prior phased engineering CI](lu/independent-engineering-phases.md). Earlier passing CI is reusable component evidence, not acceptance of the newly scoped Alpha.

**No existing AX or DX gate is accepted simply because this document exists.** As of this plan, the task checkboxes below begin OPEN; independent prior work may be reused only after its actual source and test evidence are inspected. The old Alpha candidate SHA/installer hash remain historical, not the new pinned candidate.

## 2. Phase-by-phase execution roadmap

| Phase | Focus | Required deliverables / exit condition | Required gates | Scheduling |
| --- | --- | --- | --- | --- |
| **0 — Inventory and classification** | Establish which Jan/Cowork pieces are build-reachable and which Lu owns | Audited TypeScript/Rust/IPC/worker/UI/NSIS dependency graph; explicit inheritance vs replacement/exclusion classification; prioritized replacement seams | AX-00; extraction 4G-A | **First**; also informs DX instrumentation |
| **1 — Diagnostic contracts and Lu-owned replacements** | Establish typed end-to-end observation and independent chat/tool paths | Versioned Protobuf trace schema and span correlation; Lu-owned chat bootstrap and tool dispatch equivalent; scoped authorization | DX-00, DX-01 (initial), AX-01; 4G-B | Can run DX and extraction **in parallel** after inventory |
| **2 — Durable execution and fault isolation** | Correctness of native turns, worker recovery and localization engine | Cancellation/revocation and effect journal parity; cross-boundary events; deterministic stage graph with uncertainty; synthetic fault localization | 4G-C, DX-02, DX-03 | Parallel vertical slices, with explicit integration gates |
| **3 — Cowork / non-inheritable Jan exclusion** | Remove prohibited dependencies, not merely hide them | No Cowork UI/runner/transport/registry, no Jan fallback, no rejected Jan feature in compiled chunks, native registrations or NSIS package; static and dynamic negative evidence | AX-02; 4G-D | After replacement parity for affected seams; iterate incrementally |
| **4 — Installed diagnostic and regression qualification** | Prove DX diagnoses actual failure cases without changing normal Lu execution | Targeted fault injection for each boundary; privacy/overhead/authority noninterference; real Windows W01–W06 regression evidence | DX-01 through DX-04, W01–W06; 4G-E | Incremental until all revised paths pass |
| **5 — New candidate and Alpha qualification** | Build, pin, install and verify one Cowork-free Windows Alpha | New immutable source SHA, NSIS installer hash, engine/model manifest, licensing audit, A01–A09 + AX + DX evidence against the **same installed artifact** | AX-03, AX-04, A01–A09 plus all AX/DX | **Release blocker** |
| **6 — Post-Alpha v1.0 review** | Major code/architecture review and v1.0 roadmap | File-grounded review, security/reliability register, prioritized Alpha → beta → v1.0 work | Operational Cowork-free Alpha prerequisite | **BLOCKED until Phase 5 succeeds** |

**Interpretation:** Phases 0–5 are the six pre-release phases. Phase 6 is a separate *post-Alpha* activity. They are dependency groups, not a demand to stop all parallel engineering.

## 3. Canonical task checklist

**Status legend:** OPEN = required, not yet accepted in this revised program; IN PROGRESS = actively assigned with linked source evidence; BLOCKED = waiting on a named predecessor; VERIFIED = implementation plus exact test evidence; ACCEPTED = release gate passed on the pinned installed Alpha. **Default here: OPEN.** Change only with dated commit/run proof.

| Task | Phase | Work to deliver | Gate / objective check | Initial state |
| --- | --- | --- | --- | --- |
| **T01** | 0 | Trace Cowork TypeScript and Rust callers from desktop entry points and native dispatch into production build | AX-00; dependency graph with exact paths, symbols, import edges | OPEN |
| **T02** | 0 | Classify Jan-origin modules: approved foundation / replace / exclude / review-required; preserve notices | AX-00, AX-04; signed-off disposition ledger; unknowns block | OPEN |
| **T03** | 0 | Map Lu conversation/tool/IPC/worker/engine and compiled/NSIS resource reachability | AX-00; diagram plus executable/bundle extraction boundaries | OPEN |
| **T04** | 1 | Define typed versioned diagnostic span stages, clock domains, causal parentage, failure classes and redaction | DX-00; schema validity/size/unknown-stage tests | OPEN |
| **T05** | 1 | Implement Lu-owned chat orchestration, durable user-turn bootstrap and response handling | AX-01, W01; genuine GGUF reply and persisted assistant, no Jan bootstrap | OPEN |
| **T06** | 1 | Replace Cowork native-tool dispatch with Lu registry, Protobuf and host-owned authority | AX-01, W03; model → Lu tool → validated result → persisted reply | OPEN |
| **T07** | 2 | Connect native task/cancel identity, permission revocation, worker termination and effect journal reconciliation | 4G-C, W04; no effect replay, live cancellation and restart proofs | OPEN |
| **T08** | 2 | Instrument GUI → durable user turn → IPC → host → engine/model/tool → stream → assistant persistence/render | DX-01, DX-02; correlated real-Windows traces, not anonymous logs alone | OPEN |
| **T09** | 2 | Implement deterministic fault-region localization and explicit dropped-event/clock/truncation uncertainty | DX-03; injected failures yield correct adjacent boundary and next safe probe | OPEN |
| **T10** | 3 | Remove Cowork components, imports, routes, commands, feature flags and bundled resources | AX-02; no Cowork source import in Alpha build graph or installed runtime | OPEN |
| **T11** | 3 | Replace/exclude remaining non-inheritable Jan features and compatibility fallbacks | AX-01/02; no legacy runtime fallback; approved foundation ledger complete | OPEN |
| **T12** | 3 | Audit optimized frontend chunks, native command/feature registry, worker dependencies and NSIS package | AX-02, AX-04; static reachability + real Windows negative probes | OPEN |
| **T13** | 4 | Fault-inject boundaries: message save, IPC, authority, runtime/tool, cancellation, response, persistence and render | DX-02/03; accurate last confirmed/first unconfirmed localization | OPEN |
| **T14** | 4 | Verify redaction, bounded memory/overhead, diagnostic isolation from hung worker and no new permission | DX-04; no secrets/prompts/paths, no authorization or tool side effects | OPEN |
| **T15** | 4 | Rerun actual installed Windows GGUF/tool/denial/cancel/profile/NSIS tests using Cowork-free path | W01–W06; real result records, no synthetic substitute | OPEN |
| **T16** | 5 | Build and pin a fresh Cowork-free Windows NSIS installer and sealed model/engine inventory | AX-03; exact source commit + EXE SHA-256 + manifest/artifact | OPEN |
| **T17** | 5 | Execute A01–A09 plus AX/DX and license/upgrade acceptance on the same pinned candidate | AX-03/04, A01–A09; every mandatory gate passes or release blocked | OPEN |
| **T18** | 6 | Major post-Alpha code/security/architecture review and v1.0 roadmap | Starts **only after** the rebaselined Alpha is operational and accepted | BLOCKED |

**Existing completed work is not discarded.** For example, 4F worker/cancellation tests, 4H W02/W04 and six support-batch tests can be linked as *component-level* verification after replay against the new source. They do not turn T07, T14 or T15 into an accepted release gate without Cowork-free installed runtime evidence.

## 4. Architectural acceptance gates (AX)

| Gate | Pass condition |
| --- | --- |
| **AX-00 — inventory** | Complete, reviewed module/caller/feature/resource graph with explicit Jan inheritance/exclusion decisions; no unknown build-reachable module |
| **AX-01 — replacements** | Production chat, native tools, worker/engine lifecycle and permissions use Lu-owned routes; model input is not host authority |
| **AX-02 — exclusion** | No Cowork or unapproved/non-inheritable Jan runtime, route, tool, feature, command or asset is imported, compiled, bundled, registered or dynamically reachable in Alpha |
| **AX-03 — installed new Alpha** | New immutable Windows source/NSIS/engine pin; genuine Lu GGUF replies, native Protobuf tool and all W/A regressions pass |
| **AX-04 — attribution** | Review intentionally inherited Jan/third-party code and installed LICENSE, NOTICE, modified-file labels, manifest and source/binary provenance |

**A disabled Cowork toggle is not AX-02 completion.** Git history can retain Cowork for provenance; the compiled and installed Alpha cannot.

## 5. Diagnostic acceptance gates (DX)

| Gate | Pass condition |
| --- | --- |
| **DX-00 — contract** | Typed Protobuf event/span schema, bounded sequence, clock mapping and correlation, sanitized UI projection, explicit error/unknown states |
| **DX-01 — observation** | An actual Windows Lu operation spans frontend, Tauri/host, engine/worker/model, tool loop, response stream, durable assistant write and UI render |
| **DX-02 — lifecycle** | Tool effects, permission denial, cancellation, process exit/relaunch, journal/recovery, session/retry boundaries and persistence events traced with finite outcomes |
| **DX-03 — localization** | Deterministic fault graph reports last confirmed + first failed/unconfirmed stage, bounded culprit region, cause classification, uncertainty and next safe probe; validated by injected failures |
| **DX-04 — containment** | No prompts, raw model JSON, paths, thread IDs or secrets; no new authority, extra unapproved model invocation, long-running listener, material regression or unbounded collection |

A timeout without a later checkpoint is **not** proof that the last checkpoint's subsystem caused the failure. Diagnostic outputs must identify missing evidence, dropped records, truncated traces, unaligned clock domains or low-confidence conclusions.

## 6. Retained Windows W01–W06 gates

| Gate | Real Windows acceptance (new Cowork-free build) |
| --- | --- |
| **W01** | Lu-owned GGUF chat produces visible, durably saved assistant replies, with no Jan mock/provider bootstrap in positive acceptance |
| **W02** | Deny forged/missing/wrong-role saved-turn and invalid session/scope authority before effects |
| **W03** | Real installed tool-capable GGUF → Lu native Protobuf file read/tool result → model continuation and persistence |
| **W04** | Stop generation and native work, revoke permissions, observe worker termination and safe relaunch/recovery |
| **W05** | Installed profile A → B → A startup/restart preserves isolation, canaries and proper worker ownership |
| **W06** | Exact independent NSIS upgrade/replacement/uninstall, profile data and Jan Apache-2.0 LICENSE/NOTICE preserved and verified |

Retain all **A01–A09** release acceptance gates documented in the Windows release matrix. The original nine-gate schema by itself **cannot** waive AX/DX gates. A new combined evidence validator/ledger must fail closed if new architectural/diagnostic evidence is absent.

## 7. Dependencies, concurrency and immediate next batches

~~~text
                   Phase 0: AX-00 inventory
                            |
                +-----------+-----------+
                |                       |
     Phase 1/2: AX-01 extraction     Phase 1/2: DX-00/01/03
       Lu chat + tools + workers       Correlation + localization
                |                       |
     Phase 3: AX-02 exclusions      Phase 4: DX-02/04
         built + installed            validation + containment
                +-----------+-----------+
                            |
                 Phase 4: W01–W06 qualification
                            |
                  Phase 5: New Alpha pin
                       A01–A09 + AX/DX
                            |
               Operational Cowork-free Alpha
                            |
                  Phase 6: v1.0 code review
~~~

**Recommended first three independent work batches:**

1. **T01–T03 / AX-00:** map the real Cowork/Jan call/build graph, origin classes and Lu replacement seams. Keep this review focused; the broad v1.0 audit remains deferred.
2. **T04 + T08 + T09 / DX-00/01/03:** use existing passive trace prototypes but implement causal correlation, persistent-UI completion observation and a deterministic bounded localization result. Verify in a disposable Windows instance; do not claim the prior ring buffer is complete DX.
3. **T05–T06 / AX-01/4G-B:** replace ordinary-chat orchestration/tool dispatch with independently operating Lu paths, running DX alongside each replacement. Do not delete legacy code blindly before parity is verified.

**Parallel guardrails:** coordinate active 4G and diagnostic branches; preserve 4F/4H regression safeguards; no changing protected main, forced history rewrite, user Windows AppData, old Alpha candidate hash or installer artifact. Changes to a shared runtime seam require owner coordination and exact source SHAs.

## 8. Release decision and task bookkeeping

Each completed task must record: task/gate ID, owner branch and commit SHA, test command, Windows run URL, exact observed assertion, sanitized artifact, evidence limitations, status (implemented/tested/installed accepted), and the next blocker. A CI run from a different SHA, a mock, a doc-only commit, or a passing old preview cannot close a new Alpha gate.

**Alpha releases only after:** AX-00..04 + DX-00..04 + required W01..06 + A01..09 pass on the pinned Cowork-free Windows installer, with provenance and license checks; any open mandatory failure blocks release.

**Post-Alpha (T18):** [major code review and v1.0 planning](lu-post-alpha-v1-code-review-backlog-2026-10-29.md) begins only once the *newly scoped* Alpha is actually built, installed, working and accepted. Benchmarking is separate later-revision work, not a hidden DX gate.
