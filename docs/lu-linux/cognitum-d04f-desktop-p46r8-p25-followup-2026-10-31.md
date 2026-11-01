# Lu Linux D04F — Finished Desktop Integration and P46R8/P25 Follow-up

**Recorded local:** October 31, 2026 (Arizona); **test container UTC:** November 1, 2026.  
**Source:** Lu D04F source reconciliation against D04E; Cognitum P46R8 reconstructed full source; P23 user-provided receipt/journal.  
**Disposition:** **D04F developer desktop and P25 evidence-audit accepted; kernel containment and scientific efficacy not accepted.** No code changes in this follow-up. No Windows alpha or main branch changes.

## Desktop gate (previously incomplete)

- Offline Cargo GUI-feature type check: **passed**, terminal record `D04F_CHECK_END ... rc=0`.
- Offline Cargo desktop binary link: **passed**, terminal record `D04F_BUILD_END ... rc=0`; binary SHA-256: `d302a8eac85616b9cca27e8148241bffdf5868bb8ee09ed54bc99a063898cbb5`. This is a development binary, not packaged installer.
- Actual disposable graphical Linux host: owner-private AF_UNIX socket, private operator token, pinned Cognitum worker, real 415 MB Qwen2.5 0.5B Q2_K GGUF, CPU llama.cpp engine **Ready**, then unload.
- Same expression `9/14 + 5/21`: unapproved Qwen returned `149/142`, **zero** native calls; approved Lu-selected route returned **`37/42`**, exactly **one** Cognitum call, `HOST_ROUTE_SELECTED` audit event, and `TOOL_FEEDBACK` event. One paired example is not an accuracy study.
- Arbitrary client-supplied worker path, protection-tier override, and authority override rejected by the authenticated developer socket.
- Actual desktop strict profile (`kernel-required`) **denied** execution with `cognitum-dev-kernel-containment-not-ready`; CLI-supplied tier injection denied. The trusted supervised profile continued to execute.
- Host stop/restart: persisted route audit count remained one, old process token rejected, new token accepted, fixed worker again returned `1/2`, model remained Idle before load.
- Debug-only launch: Xvfb with container-specific WebKit settings that **must not** be copied into release profiles. No installer acceptance.

## P46R8 recovery and fault gates

- Reconstructed complete P46R8 Python recovery/containment suite, correct `PYTHONPATH=.:tests`: **123/123 passed twice** on separate runs (246 successful assertions as counted by unittest; not 246 unique cases). A prior attempt using incomplete source and an incorrect test import path failed at collection; it is **not** a production regression.
- Original P46 test-only 2,000 ms timeout variant: **20/20 process tests** passed; **23/23** compatibility/protocol tests passed. Historical unmodified 400 ms grandchild startup race is still an **open timing/acceptance issue**; 2,000 ms is not a production default change.
- Real `recovery_service --inspect-only` process test on a private state folder: concurrent process was denied (`ALREADY_RUNNING`, exit 2), first service killed with SIGKILL, replacement acquired lock and emitted `INSPECTION_ONLY`. This validates exclusive lock/restart for **inspection only**; it did not clean a worker or attest kernel state.
- Real kernel-required worker execution remains denied: cgroup2 mount is `ro`. No writable delegation, launch barrier, `cgroup.kill`, or independent cleanup of escaped descendants was demonstrated.

## P25 existing full benchmark evidence re-audited

Recovered original P23 FULL receipt and partial JSONL journal from the owner's file Library, then ran the **existing** P25 auditor and its 9 unit tests. The newly generated audit object is identical to the separately saved P25 full-paired analysis (receipt SHA-256 `270da33eddd9d0b83e2db7a6ad08bf69b8f22efb6436c4c93a6bdc3be522d519`). No new LM Studio/Qwen 27B requests or synthetic model results were generated in this audit.

| 12 matched scheduling cases | Cognitum OFF | Cognitum ON |
|---|---:|---:|
| Strict protocol + exact mathematical answer | 0/12 | 5/12 |
| Format-tolerant mathematical answer | 10/12 | 10/12 |
| Authorized solver invocations | 0 | 11 |
| Recorded total inference latency | 1917.619 s | 2227.028 s |

**Conclusion:** P25 artifact integrity / paired analysis is verified. This dataset does **not** show a net mathematical-accuracy benefit (one semantic gain and one semantic loss), and it is not a model-provenance-attested or statistically powered efficacy trial. The ON condition used more tokens and second calls. It cannot be combined with the separate Lu 0.5B fraction tests as though they were the same benchmark.

## Open acceptance gates

1. **Kernel-required P46:** actual delegated writable cgroup2; prelaunch membership; launch barrier; bounded real `cgroup.kill`; arbitrary escaped descendant + host-crash cleanup; independently supervised external recovery witness. This is tier-specific and cannot block trusted-supervised Cognitum.
2. **P46 original 400 ms fixture:** redesign startup synchronization (precondition guarantee) and keep bounded cleanup budget. Do not claim it passes unmodified.
3. **P25 efficacy:** independent model identity/settings, seeded repeated paired runs on more problems/models, matched output grading, per-arm confidence intervals, routing accuracy/latency/tool cost. The full receipt audit is done, general efficacy is not.
4. **Production:** Linux installer, signed third-party DLC isolation, Windows worker Job Objects and Windows alpha integration are not tested here.

## Portable evidence

The neighboring JSON ledger includes SHA-256 values of original local evidence files. The accompanying ZIP includes the follow-up source-free test scripts, sanitized logs, P25 derived audit, and this report. **No model weights, operator token files, personal absolute Windows paths or production secrets are in that package.**
