# Lu Windows Alpha acceptance — revised architecture gate

**Status: NOT ACCEPTED. REBASELINED 2026-10-29; Alpha release postponed (no ETA).**
Windows x86-64 only. This is a release criterion, not a report of installed Alpha.

**Binding design:** [Cowork-free Alpha decision](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md)
and [end-to-end diagnostics gates](../lu-alpha-diagnostics-fault-localization-2026-10-29.md).
The prior "Jan-compatible transitional Alpha" policy is **superseded**.

**Execution and status tracking:** [revised Alpha phases, T01–T18 task checklist and AX/DX/W/A gates](../lu-alpha01-revised-work-plan-2026-10-29.md). This task list is a planning ledger, not a release-pass record.

## Mandatory Alpha outcomes

1. **Independent desktop and build:** Lu installs, starts and works without a separately installed Jan; more strictly, the Alpha build graph, packaged binaries/JS, registered commands, UI and runtime routes contain **no Cowork and no non-inheritable Jan features**. No hidden fallback, off-by-default Cowork module or Cowork bootstrap. Jan-derived *foundation* code is permissible only when consciously inherited, audited, Cowork-independent, necessary and licensed.
2. **Real Lu-native GGUF:** the installed Windows x86-64 Lu-owned engine loads an admitted model and produces substantive visible, durably persisted answers from Lu chat **without Jan provider/Cowork path**. Two consecutive turns must retain session and engine identity where expected.
3. **Real Lu-native tool loop:** a tool-capable GGUF requests a Lu native tool; a trusted host verifies persisted USER role and conversation/task scope; typed Protobuf dispatch returns the tool result to model/conversation and persists it. No model-origin permission, Jan dispatch or mandatory MCP route.
4. **Security, reliability, install and provenance:** W02 host denials, W04 cancellation/worker exit/recovery, W05 A/B/A profile isolation, W06 independent cross-version NSIS install/upgrade/uninstall and Jan Apache-2.0 attribution all run on the actual candidate. Do not relax negative tests.
5. **Accurate fault-localization diagnostics:** a correlated, host-owned trace identifies last confirmed/first failed (or unknown) stage through user action → saved turn → IPC → policy → worker/engine/model/tool → response stream → assistant persistence → UI render; bounded, redacted local report and controlled failure-injection checks. A passive frontend export or event ring alone is not enough. DX-00..DX-04 are mandatory.
6. **Cowork and non-inheritable Jan removal:** classify all build-reachable Jan code and dependencies, replace essential functionality and verify absence of prohibited runtime, UI, IPC/registry and NSIS artifacts with static **and** installed Windows runtime tests (AX-00..AX-04).

## Evidence requirements

- Use one **new** exact source commit, NSIS binary SHA-256, manifest and sealed GGUF/backend, Windows runner, test artifact and run URL for all qualifying gates. A mock provider/Jan bootstrap in a test harness, an old preview installer, source-only smoke, or user-observed older build is not the new Alpha proof.
- Existing A01–A09 functionality tests **remain required but are no longer sufficient**. DX and AX gates must be independently checked; a passing old nine-gate schema cannot waive them.
- Reject unknown or unclassified Jan dependencies by default; treat a missing or inconclusive build-graph audit as **blocked**, not passed.
- Preserve modifications/attribution on Jan-derived source that Lu intentionally inherits. Excluding Cowork does not revoke Apache-2.0 LICENSE/NOTICE obligations.
- A cancelled/pending workflow, an artifact from another source SHA, or a handwritten report cannot qualify as pass.
- The previous `docs/lu-alpha01-candidate-pin-2026-10-29.json` is **historical, superseded for release eligibility**, and must not be rewritten as if it was built for this new architecture. Generate a separate pin for the new candidate.

## Existing component evidence (NOT release acceptance)

Earlier user-observed Qwen GGUF replies and native file operations show useful components. Earlier 4F Windows AppContainer/worker cancellation and 4H W02/W04 security tests showed isolated correctness. The six Alpha support batches supplied synthetic evidence, privacy and native contracts. None of those demonstrates that **a Cowork-free Alpha binary** boots, works and explains failures through the new DX system. Re-run the relevant tests on the new architecture.

## Excluded / deferred

Performance benchmarking, throughput/model-score comparisons, matched WITH/WITHOUT model evaluations, experimental GPU profiling unrelated to a fault, automatic repair, remote diagnostic/Lu-to-Lu bridges, continuous user-data collection, DLC Workspaces, NVP, Cognitum integration and Linux/macOS. Some advanced UX and memory functions remain v1.0 work if not required for an independent usable Alpha.

**Independent post-Alpha activity:** the comprehensive v1.0 code review remains deferred until *this revised Cowork-free Alpha* has been built, installed and demonstrated to work. Focused pre-Alpha extraction audits and DX fault analysis are required engineering, not that comprehensive review.
