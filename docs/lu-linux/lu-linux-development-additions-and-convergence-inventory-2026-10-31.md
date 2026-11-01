# Lu Linux development additions and Windows convergence inventory

**Recorded:** 2026-10-31 (America/Phoenix; GitHub commits in UTC may be dated 2026-11-01)  
**Repository:** `vjmichael/jan_alt`  
**Documented Linux evidence head:** `lu/linux-p46-p25-next-gates-20261031` @ `099eeec91fdb23674bc295ac6c95125e676ded1d` (before this documentation commit)  
**Linux source ancestor:** `lu/linux-native-test-host` @ `f0238c63c9c0b18b689f60fa3ab3009ba83aaf48`  
**Local reconstructed source baseline:** `68eab79e2799c02cec8949993cebd64215f00559` plus L16/P0/Cognitum overlays; **not** a complete GitHub checkout at the current Linux branch head  
**Compared Windows alpha head:** `lu/windows-alpha-six-gates-20261031` @ `e130dcf53204078661cedf4581eed13e92c9aa93`  
**Common-transport prototype head:** `lu/ipc-common-af-unix-20261031` @ `75f79fa45ca4d7fd217ada7f1562a0ca92ff0a92`  
**Disposition:** source/evidence inventory and integration roadmap only; **NO merger, release, Windows alpha promotion, or Linux installer certification**.

## Executive decision: one Lu, not two apps

The Windows native-only alpha and the Linux/Cognitum developer host are different development *configurations* and at present divergent source histories. They are **not** intended to become separate products. The desired end state is one Lu application ID, data model, Protobuf definitions, host authorization policy, durable journal, model/provider service, native registry and frontend, with OS-specific model/worker/transport backends and optional feature-gated developer tooling.

Linux may continue to mature independently until its tested source is reproducible, but production convergence is by **audited source reconciliation into one shared Lu codebase**, with platform tests after every integration step. No broad merge, overwrite of Windows fixes, default Python prerequisite, always-on developer socket, or automatic release promotion is authorized by this document. GitHub remains a repository and optional verification/evidence archive; local development and testing are primary.

## The key repository-versus-runtime finding

A direct GitHub comparison of `lu/linux-native-test-host` to `lu/linux-p46-p25-next-gates-20261031` shows **29 commits ahead and 0 behind**, with **27 changed paths**. Every changed path is a `docs/lu-linux/` report, JSON ledger, or stored `.patch` overlay. There are **no directly integrated `src-tauri/**` Rust production-file changes** in that branch delta. The reports describe meaningful *locally reconstructed, compiled and executed* Linux work; they are not evidence that simply checking out this Linux branch produces the D04F binary or reproduces its current feature set.

The same comparison to the experimental common transport branch shows that `lu/ipc-common-af-unix-20261031` independently adds a real `src-tauri/lu-ipc-common/` crate, test fixtures and a CI workflow. That crate is **not linked into the existing Lu Tauri application or production worker manager**.

The current Windows six-gate branch has separately advanced `lu-core`, `lu_inference.rs`, native-only bootstrap and packaging, WebView/UIA acceptance, authorization and worker cleanup. The two branches share an earlier common ancestor, but **do not have a straightforward conflict-free production patch series**. As checked, the Linux-next branch is 31 commits ahead and 66 behind relative to the current Windows branch, with merge base `c84906528effbfeb1d3a19603de88d8f284727d4`. These are branch topology counts, not a count of usable features.

## Linux developer addition ledger

| Milestone | Local addition / demonstrated behavior | Actual verification | Not yet established |
| --- | --- | --- | --- |
| L16 / P0 Linux native host | Reconstructed native Linux `Lu-Desktop`, offline Rust/Debian GUI dependencies, Qwen GGUF runtime, opt-in owner-private AF_UNIX test host, model lifecycle, saved-turn diagnostic client | P0 branch 13/13 fixture/security client checks; the older P1 checkout itself failed initial protected-model API compilation. Later reconstructed D02+ desktop completed genuine runs | Base `lu/linux-native-test-host` is not a ready-to-build record of all L16/P0 source; clean install / release GUI remains separate |
| D02 direct Cognitum bridge | SHA-pinned fixed Python worker, canonical Protobuf rational operation, owner-private development socket, real CPU GGUF load, model unload and token rotation | Local 71/71 feature tests, 14/14 socket fixtures and 14/14 live adversarial checks; direct `1/3 + 1/6 = 1/2` | Operator invoked Cognitum directly. **Not** model-originated; no conversation authorization or kernel confinement |
| D03 model→native tool | `lu_cognitum_rational`, `ToolEffect::ExecuteCode`, one-use SQLite approval tied to saved USER turn / worker digest, scoped authority, model JSON→Protobuf→tool feedback→final | 77/77 feature-on and 69/69 default tests; live approved Qwen tool round trip `9/14+5/21=37/42`; unapproved tool rejected before dispatch | Experimental socket approval is not production consent; untrusted package admission and OS confinement not accepted |
| D04A lifecycle | Fixed-worker Linux process-group kill, cancellation and grandchild tests, `setsid` escape negative control | 80/80 feature-on, 69/69 default; explicit routing 6/6 on prior D03 host; **neutral matched prompts 0/6 tools** both arms | Process group can be escaped; older D04A binary was not fully linked |
| D04B graded protection | Host-selected `trusted-supervised` vs fail-closed `kernel-required`, immediate-child `PR_SET_PDEATHSIG`, own syscall helper and cgroup mount diagnostics | 82/82 feature-on, 69/69 default, 5/5 syscall tests; fresh Linux desktop, socket, GGUF, real worker; explicitly instructed 6/6 routing | Parent-death is direct child only; no writable cgroup or external watchdog; no general untrusted worker acceptance |
| D04C host capability routing | Restrictive host-reviewed fraction predicate; automatically host-chosen *authorized* exact operation via **existing** native bound dispatcher; `hostRoutedCalls` distinguishes provenance. Fixed worker has `no_new_privs` and RLIMIT caps | 88/88 feature-on, 74/74 default, 7/7 Linux syscall tests; real desktop, neutral approved 6/6 exact and six host-selected calls vs unapproved 0/6 | The model independently selected **zero** of those routed calls; rule is narrow, first-party and not a generic DLC router |
| D04D reviewed route catalog | Binds public name, native ID, effect, exact Protobuf types, argument schema and published turn schema; rejects forged/ambiguous or no-tool routes | 90/90 feature-on, 76/76 default; offline desktop `cargo check`; denial fixtures pass | Fresh D04D link/real-GGUF run not accepted at that stage; D04C successes are not D04D runtime results |
| D04E durable route provenance | Distinct `HOST_ROUTE_SELECTED` journal event **before** dispatch, transactional migration of old SQLite CHECK constraint, rollback/fail-closed durability tests | 90/90 feature-on, 76/76 default, 3/3 migration tests, 11/11 supervised tests; fresh linked desktop, live Qwen six matched pairs, real restart/audit | Selection event is **not** execution/effect proof; third-party signed routing and kernel cleanup still open |
| D04F / P46R8 | Strict host-only P46 recovery report parser; graded `TrustedSupervisedOnly` versus `KernelRequiredUnavailable`; diagnostics cannot grant tool authority | Local 95/95 feature and 76/76 default Core; 123/123 P46 Python; two unsuccessful **earlier** desktop check windows were later superseded by a **successful** offline desktop check/build and real live Qwen host test | Actual writable delegated cgroup, cgroup.kill and host-surviving escaped descendant recovery **not accepted** |
| P46/P25 next | Repaired a 400ms test’s startup precondition without changing production timeout; repeated process/race tests; fresh real 9-case Qwen holdout (2 repeats per case, matched OFF/ON) | 158/158 combined P46/P45 tests; 18/18 ON exact vs 6/18 OFF exact; ON 18 host routes/feedback, OFF 0; 7/7 independent verifier tests | Small-model results are **host-selected routing**, not spontaneous model selection, broad Cognitum efficacy or production security |
| AF_UNIX IPC (separate branch) | Cross-platform Linux `UnixStream` / native Windows Winsock AF_UNIX Protobuf byte carrier; host-scoped single-use proof; independent Windows Job Object and Linux process-group/cgroup prototypes | Native Ubuntu 24.04/Windows Server 2025 isolated tests and Clippy PASS; job hard-host-death and ordinary descendant teardown witnessed | Crate **not shipping or integrated**. Windows atomic job assignment, ACL/peer identity, Linux positive writable cgroup, live Lu authority/dispatcher wiring OPEN |

**Important experimental attribution:** D04C/D04E/D04F exact arithmetic improvement comes from Lu's **reviewed, host-selected** computation on approved turns, then the LLM's answer using trusted feedback. Do not describe it as the model autonomously choosing Cognitum. The P25 archived Qwen 27B scheduling audit is independent: format-tolerant mathematical correctness **10/12 OFF versus 10/12 ON**; strict output formatting **0/12 OFF versus 5/12 ON** is not a demonstrated semantic accuracy gain. No new 27B inference was made in that Linux follow-up.

## Local assets, source completeness and provenance

1. **Existing GitHub patch carriers** on this branch: `docs/lu-linux/overlays/Lu_Linux_Cognitum_D03_Source_CANONICAL.patch` (8 changed file paths), `Lu_Linux_Cognitum_D04A_Source.patch` (1), `Lu_Linux_P46R8_Graded_Supervisor_Reconciliation.patch` (4), and `P46_P45_400ms_Start_Precondition_Test_Fix.patch` (Cognitum test fixture only). These are **not** a complete replayable D01→D04F production series; e.g. the intermediate D04B/C/D/E source transitions are documented but are not individually stored as GitHub overlays on this Linux branch.
2. **Local reconstructed source:** reports cite a pinned Lu source snapshot, L16/P0 overlays, D01/D02 and accumulated Cognitum developer source. The actual linked D04F Linux developer binary has SHA-256 `d302a8eac85616b9cca27e8148241bffdf5868bb8ee09ed54bc99a063898cbb5`, but that binary and its full tested source tree are **not represented as one checked-in release candidate**.
3. **Model evidence:** the D04F host tested a 415 MB real Qwen2.5 0.5B Q2_K GGUF (SHA-256 `9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8`), CPU llama.cpp, authenticated private socket, one-use approvals, protected telemetry and Idle after unload. Not a production Windows model result.
4. **Linux packaging:** earlier L16/Linux preview work included Debian `.deb` artifacts and development GUI checks; D04F's current reported binary is a **local development binary, not a newly accepted Debian installer**. Do not use an old Linux `.deb` receipt as proof that D04F's routing, recovery or current frontend is packaged.
5. **Raw evidence:** main reports and bounded JSON summaries are in this branch, with some raw logs/binaries retained in separate local archives or owner Library. Before integration, reconstruct source from **real bytes** and independently verify hashes/patch preimages; do not infer omitted source from prose or copy generated text as canonical code.

## Proposed common Lu architecture (review target, not already merged)

```text
One Lu desktop frontend + durable conversation/storage schema
           |
Lu-owned native chat host / model provider manager
           |
Persisted USER-turn verification -> per-turn ConversationAuthority
           |
Published authorized capability catalog + optional reviewed host router
           |
Model JSON boundary -> policy/effect decision -> canonical Protobuf registry
           |                                      |
Host-selected route journal                Native tool execution
           |                                      |
   TOOL_FEEDBACK / model continuation -> durable final assistant -> UI
           |
OS-specific supervised worker and inference transport adapters
    Windows: worker Job Object; named/native AF_UNIX only if fully vetted
    Linux: trusted supervised process; kernel-required cgroup only if proven
           |
Optional first-party Cognitum CE; NO mandatory Python/installer dependency
```

**Single-authority invariants:** (a) capability discovery ≠ authorization; (b) no model/tool/DLC/client can mint a grant, choose a worker executable, or select a weaker protection tier; (c) `ExecuteCode` remains honestly classified; (d) `HOST_ROUTE_SELECTED` records selection, not successful execution; (e) cancellation/revocation/cleanup and report provenance must remain durable and reconciled; (f) tools are Lu-native with optional MCP compatibility, never MCP-required; (g) development-only sockets/unsafe Xvfb WebKit flags are **OFF** in shipping builds.

## Integration collision map — reconcile, do not bulk cherry-pick

| Shared or Linux-added module | Linux development behavior | Convergence action |
| --- | --- | --- |
| `lu-core/src/lib.rs`, `Cargo.toml`, `Cargo.lock` | Feature-gated Cognitum modules and Protobuf/test dependencies | Rebase against Windows **current** Lu Core and preserve its newer auth, model boundary, Rustfmt and license/provenance gates |
| `lu-core/src/cognitum_dev_native.rs`, `cognitum_model_tool.rs`, `cognitum_dev_approval.rs` | Fixed Python worker; typed rational tool; one-use journaled `ExecuteCode` grant | Import only verified complete source, keep feature-off builds clean on both OSes; separate desktop/operator consent from dev token |
| `lu-core/src/capability_router.rs`, `model.rs` | Host-reviewed exact routing, schema/tool/effect match, ambiguity and explicit-no-tool denials | Generalize only via reviewed trusted descriptors; do not allow DLC-provided policy or arbitrary code routing |
| `lu-core/src/supervised_tool_generation.rs` | Optional pre-generation authorized host route, typed feedback, provenance | **High conflict risk**: Windows alpha recently added bounded unknown-tool retry/fail-closed handling. Ensure retry cannot double-run a host-selected call |
| `lu-core/src/model_turn_journal.rs` | Transactional `HOST_ROUTE_SELECTED` migration and failure-before-dispatch | Merge with Windows current audit, preserving historical rows, sequence and migration idempotence; never count a selection as committed effect |
| `src-tauri/src/core/lu_inference.rs` / `lu_native_test_host.rs` | Linux model admission, dev-only socket, approved start-turn and `hostRoutedCalls` result | Preserve Windows installed GUI first-response/assistant save/restart fixes; secure dev feature flag and shared result contract |
| `lu-model-linux-sys` helper (Linux-only) | Parent-death syscall, no-new-privs and resource caps for the fixed worker | Keep isolated and OS-gated, Rust `unsafe` minimized; do not apply all worker limits indiscriminately to inference/film workloads |
| `lu-core/src/cognitum_p46_recovery.rs` | Strict P46 diagnostic decoding, deny escalation to containment grant | Keep tier decision host-owned; independent post-host-death cleanup is still a platform-specific release gate |
| `lu-ipc-common` (separate prototype) | AF_UNIX framed bytes, one-use host scope and OS-specific worker launch | Treat as optional common transport candidate, not mandatory runtime migration. Reconcile canonical Protobuf once; validate Windows ACL/reparse and atomic Job Object before wiring |
| Desktop configs, Windows NSIS and Debian packaging | Windows native-only exclusion of Jan/Bun/UV; Linux dev GUI and earlier previews | One app/product and shared UI, separate `cfg`/platform targets, accurate Apache-2.0/Jan attribution. New Windows and Linux installation/restart evidence required |

**Especially do not overwrite Windows** `native_chat_ids.rs`, path/reparse protections, native-only package overlay, live GUI UI Automation tests, unknown-tool retry, or the current assistant-delivery diagnostic path when reconstructing old Linux source.

## Ordered convergence gates (all must be independently evidenced)

1. **CV-00 / source audit:** Freeze/pin Windows alpha and Linux D04F evidence heads; recover all local Linux source bytes plus L16/P0/D01–D04F patch chain and related Cognitum worker package. Verify SHA-256, `git apply --check` and dependency/Apache provenance; classify each change as upstream, Linux-only, portable core, Cognitum CE, test-only, or experimental IPC. Keep a reversible integration branch, not a second Lu product.
2. **CV-01 / shared core build:** Replay portable auth/Protobuf/route/journal changes against the latest Windows core, using Rustfmt/Clippy and **default feature-off tests on both Windows and Linux**. No automatic approval, path-downgrade or duplicate host/model route effects.
3. **CV-02 / authority + audit migration:** Test saved USER identity, one-use consent, effect scope, cross-profile denial, expiration/replay, route ambiguity/no-tool, cancellation and idempotent SQLite migration with old production profiles; prove selection-before-feedback chronology and no effect on failed journal append.
4. **CV-03 / shared host lifecycle:** Keep Windows NSIS/native-only chat working; enable Linux developer socket only under explicit dev feature/owned profile; preserve one conversation/message format and model/provider interface. No direct shortcut around Lu native registry or permission broker.
5. **CV-04 / platform worker and IPC:** Verify Windows atomic Job Object creation/assignment, host death and descendant drain; Linux trusted-supervised worker with disclosed limits and **separate** kernel-required writable-cgroup/escaped-descendant/watchkeeper acceptance. AF_UNIX is a candidate backend, **not** authorization by itself. No change in declared worker protection until OS evidence exists.
6. **CV-05 / one UI, two installers:** Rebuild Windows NSIS and Linux Debian artifacts from the same integrated source revision with platform configurations; actual installed real GGUF, tool round trip, assistant persistence, visible cold restart, cancellation, clean uninstall, and inherited Jan/Cowork exclusion. No Docker or forced separate Python distribution for normal users.
7. **CV-06 / Cognitum attribution and regression:** Repeat actual controlled WITH/WITHOUT trials, count `hostRoutedCalls` separately from model-selected `toolCalls`, include latency and negative controls. Benchmark model/router/backend failures separately; do not infer broad efficacy from fraction smoke runs.
8. **CV-07 / release decision:** Require both OS acceptance matrices, ownership/security review, upgrade/rollback and documentation, then explicit human release approval. The Windows alpha can be accepted for its defined narrower target without claiming Linux kernel-sandbox or third-party DLC release readiness.

## Immediate next actions / no-merge posture

- Continue current Windows six-gate installer and GUI acceptance independently. This document does **not** alter its source or CI run.
- Make the Linux D04F tested **complete source tree and missing intermediate overlays** reproducible; confirm a clean clone builds the developer binary and that its hashes match local proof.
- Perform a path-level three-way review of the shared Rust modules above, especially `supervised_tool_generation.rs`, `model_turn_journal.rs`, `model.rs` and `lu_inference.rs`. Stage portable logic behind feature gates with tests before any installer integration.
- Keep `lu/ipc-common-af-unix-20261031` isolated pending live host authority and OS security gates; keep Cognitum a Lu extension rather than a competing application.
- Preserve each milestone's negative results and undecided OS gates rather than turning a successful source test into an installer or sandbox claim.

## Evidence and related records

**Linux:** [D02](cognitum-d02-native-integration-2026-10-31.md) · [D03](cognitum-d03-model-tool-execution-2026-10-31.md) · [D04A](cognitum-d04a-lifecycle-routing-2026-10-31.md) · [D04B](cognitum-d04b-tiered-worker-and-parent-death-2026-10-31.md) · [D04C](cognitum-d04c-host-routing-containment-2026-10-31.md) · [D04D](cognitum-d04d-reviewed-capability-routing-2026-10-31.md) · [D04E](cognitum-d04e-durable-route-audit-2026-10-31.md) · [D04F](cognitum-d04f-p46r8-graded-supervisor-reconciliation-2026-10-31.md) · [D04F desktop](cognitum-d04f-desktop-p46r8-p25-followup-2026-10-31.md) · [P46/P25 next](p46-p25-next-startup-precondition-holdout-2026-10-31.md) · [machine-readable ledger](evidence/p46-p25-next-gate-ledger-2026-10-31.json).

**Shared transport prototype:** [cross-platform handoff](https://github.com/vjmichael/jan_alt/blob/lu/ipc-common-af-unix-20261031/docs/lu/ipc/common-af-unix-cross-platform-handoff-2026-10-31.md) · [Job Object/cgroup boundary](https://github.com/vjmichael/jan_alt/blob/lu/ipc-common-af-unix-20261031/docs/lu/ipc/worker-containment-ipc04c-2026-10-31.md).

**Windows:** [six-gate alpha acceptance](https://github.com/vjmichael/jan_alt/blob/lu/windows-alpha-six-gates-20261031/docs/lu/alpha-acceptance.md) · [same-source installer and GUI gates](https://github.com/vjmichael/jan_alt/blob/lu/windows-alpha-six-gates-20261031/docs/lu/windows-six-gate-candidate-2026-10-31.md).

**Evidence standard:** independently observed desktop/installer > live local developer test > compile/unit checks > paper design. A documented patch or test result belongs to its exact source/configuration; it is not a transferable pass for a different branch or installer.
