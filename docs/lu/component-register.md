# Lu implementation and evidence register

Updated 2026-10-28. **Baseline, not exhaustive audit.** States: Proposed / Implemented / Integrated / Tested / Accepted. A reported pass at one layer is not a pass at all layers.

| Component / gate | Current evidence | State / open verification |
|---|---|---|
| Windows Lu desktop identity | Prior clean Lu-only install, startup and chat persistence shown by human tester | Demonstrated; current installer gate pending |
| GGUF Vulkan model load / replies | Qwen GGUF loaded and generated several user-visible replies | Demonstrated on Windows; refreshed artifact acceptance pending |
| Lu native file tools | `lu_files_read_text`, `lu_files_list_directory` successes and unsafe path rejection | Tool operations demonstrated; instrument complete model→native Protobuf→return chain |
| Native Protobuf supervisor/contracts | Lu Core Contracts and Desktop Integration Windows CI passed on prior PR #23 revision | Automated CI evidence; full physical tool chain not yet accepted |
| Model loading cancellation | [P4 validation](../lu-p4-cancel-001-validation.md), PR #23 | Source fix/tests; packaged Qwen/Vulkan worker and Play/Retry acceptance pending |
| Installer smoke validation | PR #23 successive path-verification corrections; inspect latest run | Not accepted until latest Windows CI green |
| ANSF + SQLite | Existing core/revision work described in project planning; Browse/Sync buttons observed nonfunctional | Core exists in some form; desktop integration incomplete, inventory needed |
| Jan licensing provenance | Nine source files individually compared to upstream Jan and marked; broader inherited source audit remains open. See [Jan-origin inventory](jan-origin-provenance.md). | Partial audit; Apache notices and distribution review mandatory |
| Jan code inheritance | Jan-derived UI and compatibility runtime still present; upstream README says Jan | Audit required; classify deliberately retained vs undesired coupling |
| Native tool suite beyond files | Multiple proposed tools, some inherited Jan Shell/Web paths previously observed | Function-by-function audit and Protobuf routing verification needed |
| PolicyEngine / trust | Conversation-scoped decisions and contracts established | End-to-end durable grant, revocation and restart tests required |
| Prompt queue / dual panes / task manager | User-approved UX plan | Integration/acceptance not established |
| Background durable tasks | Host-supervised worker design | Integration/acceptance not established |
| Self-diagnostics / benchmarking | [Design proposal](../lu-p4-diagnostics-design.md) | Design only; off by default, human activation/security prompt |
| IDE Workspace | Minimal useful development tool plan | v2.0 DLC, not v1.0 blocker |
| NVP Workspace | Major AI film production environment plan | v2.0 flagship, not v1.0 blocker |
| Cognitum CE | Independent research prototypes and test reports discussed | Independent validation/benchmarks and DLC packaging pending; do not conflate with Lu release |

## Open engineering actions
1. Finish latest Windows installer CI, repair path/provenance issues if any.
2. Obtain exact-build proof of real model→Lu-native Protobuf tool→result→conversation persistence, including permissions.
3. Verify cancellation-before-first-token retry and restart with packaged Windows Qwen/Vulkan; file regression evidence.
4. Audit Jan-derived modules and document required inheritance/fallbacks.
5. Inventory ANSF and all native tools with concrete source/test links before moving entries to Integrated/Accepted.
6. Start v1.0 phases only after alpha gate is accepted, or in separately isolated branches.

## Evidence discipline
CI: https://github.com/vjmichael/jan_alt/actions ; PR: https://github.com/vjmichael/jan_alt/pull/23 . Update with **specific** run IDs, commit hashes, date and test result as verified. Never present screenshots, test doubles or proposal documents as stronger evidence than they provide.
