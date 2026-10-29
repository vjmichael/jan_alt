# Lu implementation and evidence register

Updated 2026-10-29 for [revised Alpha architecture](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
**Alpha postponed.** Baseline, not exhaustive audit. States: Proposed /
Implemented / Integrated / Tested / Accepted. A pass at one layer does not
satisfy the same gate in the installed Windows application.

| Component / gate | Current evidence | State / open verification |
|---|---|---|
| **AX-00/01/02 — Cowork-free Alpha extraction** | Existing Jan-derived Cowork TypeScript runner, dispatch/transport, Rust agent surfaces and compatibility wiring require actual call-graph and packaged-artifact inspection | **BLOCKING / not accepted**; no Cowork or unapproved Jan feature may remain in Alpha bundle/build/runtime |
| **DX-00..04 — causal diagnostic fault localization** | Passive Rust/UI checkpoint prototypes and synthetic test design exist on `work/lu-alpha01-diagnostics-priority-20261029` | **BLOCKING / not accepted**; trace across GUI/host/engine/tool/stream/persistence, deterministic fault interval and Windows evidence required |
| **Revised Alpha source/NSIS pin** | Earlier Alpha candidate pin was recorded for transitional build | Historical only; requires a new source SHA, installer hash and AX/DX evidence before release |
| Windows Lu desktop identity | Prior clean Lu-only install, startup and chat persistence shown by human tester | Demonstrated; current installer gate pending |
| GGUF Vulkan model load / replies | Qwen GGUF loaded and generated several user-visible replies | Demonstrated on Windows; refreshed artifact acceptance pending |
| Lu native file tools | `lu_files_read_text`, `lu_files_list_directory` successes and unsafe path rejection | Tool operations demonstrated; instrument complete model→native Protobuf→return chain |
| Native Protobuf supervisor/contracts | Lu Core Contracts and Desktop Integration Windows CI passed on prior PR #23 revision | Automated CI evidence; full physical tool chain not yet accepted |
| Model loading cancellation | [P4 validation](../lu-p4-cancel-001-validation.md), PR #23 | Source fix/tests; packaged Qwen/Vulkan worker and Play/Retry acceptance pending |
| Installer smoke validation | PR #23 successive path-verification corrections; inspect latest run | Not accepted until latest Windows CI green |
| ANSF + SQLite | Existing core/revision work described in project planning; Browse/Sync buttons observed nonfunctional | Core exists in some form; desktop integration incomplete, inventory needed |
| Jan licensing provenance | Nine source files individually compared to upstream Jan and marked; broader inherited source audit remains open. See [Jan-origin inventory](jan-origin-provenance.md). | Partial audit; Apache notices and distribution review mandatory |
| Jan code inheritance | Jan-derived UI and compatibility runtime still present; upstream README says Jan | **Alpha blocker:** explicitly classify and exclude every non-inheritable feature; retain only approved Cowork-independent foundations with provenance |
| Native tool suite beyond files | Multiple proposed tools, some inherited Jan Shell/Web paths previously observed | Function-by-function audit and Protobuf routing verification needed |
| PolicyEngine / trust | Conversation-scoped decisions and contracts established | End-to-end durable grant, revocation and restart tests required |
| Prompt queue / dual panes / task manager | User-approved UX plan | Integration/acceptance not established |
| Background durable tasks | Host-supervised worker design | Integration/acceptance not established |
| **Diagnostic fault localization** | [New DX requirements](../lu-alpha-diagnostics-fault-localization-2026-10-29.md); passive bounded tracing is a prototype, not complete diagnosis | **Mandatory pre-Alpha:** correlated evidence across user action → authority → worker/model/tool → UI persistence, controlled failure localization |
| Benchmarking / model comparisons | Historical benchmark contracts and design proposals | **Deferred to later revision**, explicitly excluded from Alpha diagnostic gate |
| IDE Workspace | Minimal useful development tool plan | v2.0 DLC, not v1.0 blocker |
| NVP Workspace | Major AI film production environment plan | v2.0 flagship, not v1.0 blocker |
| Cognitum CE | Independent research prototypes and test reports discussed | Independent validation/benchmarks and DLC packaging pending; do not conflate with Lu release |

## Open engineering actions
1. **AX-00:** audit Cowork/Jan dependency reachability, classify intentionally inherited Jan foundations, identify every forbidden build/UI/IPC/packaging path.
2. **AX-01/02:** replace the required Cowork and legacy Jan runtime/feature paths with Lu native equivalents and prove they are unshipped/unreachable in the NSIS artifact.
3. **DX-00..04:** implement and test end-to-end correlated fault localization, controlled boundary-failure evidence, redaction and host independence from the hung inference worker.
4. Reproduce W01 using the *Lu-only* chat/worker bootstrap; keep W02/W04 authorization/cancellation pass requirements and W05/W06 installed profile/upgrade/license checks.
5. Build a **new pinned Cowork-free Alpha** and rerun A01–A09 plus AX/DX on the same Windows source/binary hash; do not reuse old transitional candidate evidence.
6. Inventory ANSF and all native tools with concrete source/test links before declaring integration. Keep major v1.0 review and benchmarking deferred until after an operational Alpha.

## Evidence discipline
CI: https://github.com/vjmichael/jan_alt/actions ; PR: https://github.com/vjmichael/jan_alt/pull/23 . Update with **specific** run IDs, commit hashes, date and test result as verified. Never present screenshots, test doubles or proposal documents as stronger evidence than they provide.
