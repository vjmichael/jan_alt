# Lu Linux / Cognitum D04B — Graded Worker Containment, Parent-Death Guard, and Live Regression

**Date:** October 31, 2026  
**Repository:** `vjmichael/jan_alt`  
**Baseline:** Isolated reconstructed D04A Lu-Linux source (pinned Lu commit `68eab79e2799c02cec8949993cebd64215f00559` plus earlier Lu-Linux and D01–D04A developer overlays).  
**Disposition:** D04B **developer-local partial gate PASSED**. Kernel-enforced cgroup2 containment and durable escaped-descendant recovery are **NOT ACCEPTED**. No change to Lu Windows alpha, shared main, or production DLC admission.

## Executive result

Lu now distinguishes the only two supported experimental host-selected Cognitum worker protection intentions:

1. **`trusted-supervised` (default for the fixed first-party developer worker only):** run with the existing conversation-bound D03 ExecuteCode approval when model-originated, or the separate authenticated developer smoke route when operator-originated. Enforce fixed Python/root/source SHA-256, Protobuf shape, deadlines, process-group kill/reap and a **real Linux direct-child parent-death signal**. It is **not a kernel sandbox** and still reports `kernelConfined=false`.
2. **`kernel-required`:** **deny before worker launch**; never silently lower to a process group or a preflight mount check. This mode cannot be accepted until a genuine host-owned cgroup2 admission/recovery implementation exists and can be witnessed independently. It deliberately denies even on a writable cgroup2 host, because a writable mount alone is not proof of confinement.

Lu's D04B host setting `LU_COGNITUM_D04_PROTECTION` is selected by the trusted process environment at startup. Invalid values fail closed. Client/model JSON cannot set it. The developer socket now gives a distinguishable `cognitum-dev-kernel-containment-not-ready` error for the strict mode and reports the unconfined worker as unavailable in health. It does not leak paths or credentials.

## Source changes (D04A → D04B)

- `src-tauri/lu-core/src/cognitum_dev_native.rs`: host-only `WorkerProtectionTier` and a bounded `Cgroup2Preflight` diagnostic. Correctly interprets read-only cgroup2 **mount** options (before ` - `), even when superblock options say `rw` (after ` - `). It refuses fake cgroup-like directories and never mistakes preflight for containment. Native worker spawn uses new `spawn_with_parent_lifetime_guard` helper while retaining process-group cleanup.
- `src-tauri/lu-core/src/cognitum_model_tool.rs`: the model-native D03 registration honors the selected host protection profile. No authority is granted by discovery or argument content.
- `src-tauri/lu-model-linux-sys/src/lib.rs` and `Cargo.toml`: narrow, reviewed Rust unsafe boundary for Linux `PR_SET_PDEATHSIG(SIGKILL)` and immediate parent PID race check. The Lu Core crate's `#![forbid(unsafe_code)]` remains unchanged. Linux syscall unit tests read `PR_GET_PDEATHSIG` from a real child and kill a separate Lu-like test host to witness its protected direct child terminate.
- `src-tauri/src/core/lu_native_test_host.rs`: the authenticated direct developer smoke path honors the same protection tier; strict mode reports a specific denial instead of a generic worker-source error; health reflects the selected profile rather than mere feature presence.

The source delta is **a patch against reconstructed D04A**, not against `jan_alt/main` or the documentation-only GitHub branches. `git apply --check` passed against the D04A working tree.

## Local verification

| Gate | Actual outcome | Scope/limitations |
|---|---|---|
| Lu Core (Cognitum developer feature enabled) | **82/82 passed** | Includes actual pinned Cognitum Python subprocess and negative policy tests |
| Lu Core with default features | **69/69 passed** | No change to regular Lu Core acceptance |
| Linux syscall helper | **5/5 passed** | `PR_GET_PDEATHSIG` returned `SIGKILL`; killing separate host terminated direct child; not descendants |
| Tauri desktop developer-feature `cargo check --offline --lib` | **Passed** | Uses isolated offline GUI sysroot/type-check-only config |
| Fresh D04B `Lu-Desktop` executable build | **Passed** | Local Rust debug/development binary; actual link finished after 43.78 seconds on final build |
| Fresh D04B executable launch and AF_UNIX socket | **Passed** | Disposable Xvfb/DBus profile and owner-only socket; test-only WebKit compatibility settings |
| `kernel-required` + direct Cognitum call | **Denied** | `cognitum-dev-kernel-containment-not-ready`; health unconfined-worker flag `false` |
| `trusted-supervised` + direct Cognitum call | **Passed** | Real native Protobuf subprocess; `1/3 + 1/6` → `1/2`, kernelConfined `false` |
| Client-supplied profile, Python path or argv | **Rejected** | Unexpected developer socket fields cannot downgrade the profile |
| Live Qwen2.5 0.5B Q2_K admission and load | **Passed** | Real 415,182,688-byte GGUF, CPU llama.cpp, Ready state |
| Model-originated Cognitum explicit-routing suite | **6/6 correct, 6/6 tool calls** | Fresh final D04B binary; *explicit* tool instruction; six distinct rational expressions; median entire turn **3,019 ms** |
| Approved different-wording model turn | **0 tool calls; placeholder-style final** | One separate prompt was answered `your answer`, not scored as correct. Demonstrates routing sensitivity |
| Model engine unload | **Passed** | Idle, no session PID; engine process exited/reaped or zombie |
| Writable cgroup2, `cgroup.kill` descendant test | **Unavailable / NOT ACCEPTED** | Container's cgroup2 mount is read-only |
| Durable independent post-host-crash escaped-descendant recovery | **NOT ACCEPTED** | Direct-child parent-death guard is insufficient |
| Windows alpha or signed DLC release | **NOT TESTED** | Linux developer only |

## Why the parent-death result does not replace cgroups

Linux `PR_SET_PDEATHSIG(SIGKILL)` is a useful defense for **the immediate Cognitum worker**: it receives `SIGKILL` when the initiating Lu process dies. The helper also checks the parent PID after installing the signal, closing the immediate pre-exec death race. But the signal does **not** automatically cover arbitrary children or grandchildren, is cleared on fork, and can be changed by code executing in the worker. D04A already reproduced a deliberately escaped `setsid()` descendant that survived ordinary process-group kill. This gap remains open.

`kernel-required` is intentionally fail-closed until there is a host-owned delegated, writable cgroup2 tree; admission into it *before* untrusted execution; independent membership and cleanup evidence; a host-surviving watchkeeper; and safe durable restart reconciliation. Cgroup management is process-tree/resource supervision, **not** filesystem/network security isolation by itself.

The important DLC design lesson is that **not every DLC needs to demand the highest containment level**. Trusted first-party functions can use supervised execution with transparent limitations. Higher-risk or untrusted executables should require stronger, verifiable isolation rather than allowing a silent downgrade. No arbitrary third-party DLC is admitted by this experiment.

## Cognitum small-model lesson

The six explicit requests on the fresh final D04B host all invoked Cognitum successfully. A separately worded approval/prompt completed with **zero tool calls**, yielding `your answer`. Thus, the compelling evidence remains **tool-use feasibility**, not dependable spontaneous tool selection. These are small, unseeded diagnostic runs on one quantized 0.5B model. They do not establish general capability gains, statistical significance, or a fair matched-prompt accuracy advantage.

Next controlled work should test host-originated capability routing on identical user prompts, with/without approval, across multiple seeds/models and varied tasks; report exact accuracy, tool-use rate, false triggers, latency, and Cognitum backend faults separately. Do not mix the explicit-prompt condition with the neutral condition as though it were a fair causal comparison.

## Remaining gates

1. **D04B kernel path:** host-owned delegated cgroup2, pre-exec worker admission, independent cgroup.kill and escaped-descendant witness, durable watchkeeper/recovery; never enable strict mode without evidence.
2. **Protection hardening:** verify whole worker Python interpreter, dependency graph, and package provenance; consider stronger OS filesystem/network controls for nontrivial DLCs.
3. **Router study:** introduce a host-approved capability-routing policy that affects tool *availability* or model hints without changing user intent or skipping per-turn ExecuteCode authorization; compare same prompts fairly on more models.
4. **Platform work:** Linux production installer and Windows alpha remain independent acceptance tracks; reconcile only audited shared Lu changes.

## Reproducibility and source ownership

Evidence artifacts in the D04B bundle: `Lu_Linux_Cognitum_D04B_Source.patch`, `D04B_Test_Evidence_2026-10-31.json`, `tier_matrix.json`, `live_gate.json`, `explicit_routing_results.json`, `unload.json`, scoped Cargo test/build logs, `build_patch.py`, and the fixed launch/test scripts. A final SHA-256 manifest binds included files. The bundled source patch and GitHub commit are development records; not a reproducibly signed app release.

**Decision:** D04B graded-tier admission, direct-worker parent-death defense, and real D04B live model-regression gates accepted for *isolated developer testing*. Kernel-contained DLC execution and durable descendant recovery **remain blocked**. Keep Lu Windows alpha unaffected.
