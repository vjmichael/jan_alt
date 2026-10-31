# Lu-Linux D02 — Live Cognitum native worker, socket, and GGUF host verification

**Recorded:** 2026-10-31  
**Milestone:** D02 (local developer acceptance)  
**Repository:** `vjmichael/jan_alt`  
**Evidence branch:** `lu/linux-cognitum-d02-evidence-20261031`  
**Branch origin:** `lu/linux-native-test-host`  
**Scope:** Linux x86-64 experimental developer host only. **Documentation-only transfer; do not promote to main, Windows alpha, or release packaging based on this record.**

## Executive summary

A D01-equipped, locally reconstructed Lu desktop was compiled and **actually launched** in a disposable Linux/Xvfb graphical session. Lu's authenticated, owner-private AF_UNIX native test-host accepted a request for a fixed Cognitum rational arithmetic operation, launched the SHA-pinned Cognitum Python worker as a subprocess via the Lu Core Protobuf bridge, and returned the exact result `1/2` for `1/3 + 1/6`. The same running host later loaded a real 415 MB Qwen2.5 0.5B Q2_K GGUF with the bundled CPU llama.cpp runtime and completed one ordinary inference turn (`2 + 2` → `4`). A suite of socket-level adversarial controls passed; credentials rotated on process restart; the model engine was unloaded and reaped.

**Critical distinction:** The Cognitum request was an **operator-invoked developer test-host command**, not a model-initiated or conversation-authorized tool call. The Cognitum worker was **not kernel-confined**; this test grants **no production DLC admission**, no trusted Workshop distribution, and no assertion of cgroup2 isolation or autonomous agent tool-use.

## Source and reproducibility

- Lu base: pinned source snapshot `68eab79e2799c02cec8949993cebd64215f00559`, plus the archived L16 Preview7 overlay, Lu-Linux native test-host P0 overlay, and isolated Cognitum D01/D02 developer changes. These were assembled in the local runtime; do **not** infer the combined test tree already exists in the GitHub branch.
- Runtime and toolchain: Rust/Cargo 1.98.0, vendored offline Rust crates (989), private Debian 13 GUI development sysroot; bundled Linux inference runtime extracted from an earlier Lu Linux `.deb` as test-only input.
- D01 Cognitum worker source SHA-256: `f547294522d0b4416bdce76010ca273571ff4820f53f2e2d377ca1fcb1f9c507`. This is a **single worker source file digest**, not a complete Python dependency-tree attestation or signed package.
- Local test material: `/mnt/data/cognitum_d01/`, `/mnt/data/cognitum_d02/`, and `/mnt/data/build_d02/` during the session. These are **ephemeral local evidence locations**, not published repository resources or paths guaranteed on future hosts.
- Only the current report and sanitized machine-readable gate summary are placed on this branch; the D01/D02 source overlays and full runtime logs remain separate until explicitly reviewed/transferred. No change to Lu release config, Windows alpha, main, or Cognitum repo is implied.

## Observed acceptance results

| Gate | Outcome | Evidence / qualification |
|---|---|---|
| Lu Core `cargo test --features cognitum-dev-native --lib` | **71 / 71 PASS** | Includes real fixed Cognitum subprocess rational operation |
| Linux model syscall helper `cargo test --lib` | **2 / 2 PASS** (D01) | Immutable memfd and child FD inheritance contract; not a whole-runtime guarantee |
| Lu developer-feature Tauri library `cargo check --offline --features lu-cognitum-dev-native --lib` | **PASS** | Recreated GUI sysroot and isolated config, not an installer check |
| Lu developer-feature Rust desktop binary build | **PASS** | Local `target/debug/Lu-Desktop`, cargo dev profile, completed 2026-10-31 21:37:11 UTC |
| AF_UNIX D02 client fixture tests | **14 / 14 PASS** | Protocol and validator negatives; **not** the live host security test |
| Real socket Cognitum rational invocation | **PASS** | `1/3 + 1/6` → `1/2`; Lu process PID 30916; ~870 ms one local run, **not** a latency benchmark |
| Live host adversarial socket checks | **14 / 14 PASS** | Bad credentials, unauthorized arguments, malformed/oversized requests, private transport, worker while model loaded |
| Real GGUF model admission/load | **PASS** | Qwen2.5 0.5B Q2_K, 415,182,688 bytes; bundled CPU llama.cpp; reported Ready |
| Actual Lu model turn | **PASS** | `2 + 2` → `4`, status completed, model generations 1, tool calls **0** |
| Lu native diagnostic trace | **PASS, observed** | Ten checkpoints ending `native-turn-succeeded`; no dropped events reported |
| Model unload/process reaping | **PASS** | Engine PID 31466 reaped; model status `Idle`, PID null |
| Host restart/token rotation | **PASS** | Old token rejected; fresh token accepted; rational invocation succeeded after restart |
| Model-originated Cognitum request | **NOT TESTED** | The model turn had `toolCalls: 0` |
| Conversation-bound authorization to Cognitum | **NOT IMPLEMENTED IN THIS DEV ROUTE** | Worker result explicitly reports `luConversationAuthorized=false` |
| Native-worker kernel confinement and escaped descendant cleanup | **NOT ACCEPTED** | `kernelConfined=false`; cgroup2 writable containment evidence unavailable |
| Signed DLC/production extension admission, user installer | **NOT ACCEPTED** | Only disposable developer runtime tested |

## Actual Linux execution path

1. Restore the Lu, Linux host, and Cognitum D01 developer source overlays into an **isolated** working directory; enable both `lu-native-test-host` and `lu-cognitum-dev-native` features. This documentation-only branch does not itself contain those source overlays.
2. Build `Lu-Desktop` offline with pinned Rust dependencies and the separately mounted Debian GUI sysroot. A **local type-check-only** Tauri JSON config excluded missing packaging resources; a subsequent actual linked **development binary** was built and executed. Do not call that an installer validation.
3. Run Lu in a disposable profile with `LU_TEST_HOST_ENABLE=1`, fixed developer-only worker root/Python and worker SHA-256 supplied as **host** environment variables, and a private AF_UNIX socket/token directory. The local test environment used Xvfb and disabled certain WebKit sandbox/compositing functions solely for container compatibility; those settings are not acceptable release defaults.
4. `health` returns `lu.native-test-host.v1`, host PID, `local-test-only`, profile isolation, Unix domain transport, and `nativeAuthorizationBypass=false`. Owner/private directory and token are checked. The socket caller cannot select an arbitrary Python binary, worker path, argv, worker-root path, or SHA-256.
5. `cognitum_dev_rational` invokes the fixed, pinned worker. Protobuf request and response are validated in Lu Core, and the result is marked `kernelConfined=false`, `luConversationAuthorized=false`, `productionAdmission=false`. This is an honest developer bridge, not production tool authority.
6. Real model path: `models` → `load` → `model_status=Ready` → `start_turn` → `turn_status=completed` → diagnostics → `unload`. The small GGUF's protected runtime handle was observed as `/proc/self/fd/…`; the large-model (>1 GiB) fs-verity branch remains unaccepted on this overlay filesystem.
7. Restart the Lu process. The prior token no longer works; the new token can request the same bounded Cognitum calculation.

## Security and assurance controls

- **Separate authorities:** Owner-private AF_UNIX token authenticates a **developer operator** to the test host. It is *not* the conversation-bound authority required to allow a model or CE to execute a Lu tool.
- **Fixed worker only:** No client-supplied executable, environment, root, or arbitrary arguments. The host selects one pinned Cognitum worker; canonical Protobuf and fixed-operation validation reject deviations.
- **No kernel isolation claim:** The D01/D02 developer worker is unconfined. The P46R series Cognitum lifecycle/cgroup/watchkeeper work is an independent security track. A closed/terminated process or success marker does not establish escaped-descendant kernel containment.
- **No broad extension admission:** The route is opt-in and intentionally isolated; it does not register third-party DLC as production tools or create a general-purpose shell/exec facility.
- **Perceptual negatives:** A valid socket result and a successful ordinary model turn occurring in the same process **do not** demonstrate a model deciding when to call Cognitum. `toolCalls=0` is decisive for that distinction.
- **Filesystem and packaging:** Existing authorization, model-protection, cancellation, worker hash, and policy surfaces must remain fail-closed. No weakening of fs-verity, test-host opt-in, host credentials, or user-turn permissions to secure a green build.

## Observed negative-control examples

The live 14-case suite rejected `python_path`, `worker_path`, `worker_root`, `worker_sha256`, extra `argv`, unexpected fields, invalid/missing token, missing expression, malformed request IDs, and oversized expressions. It also checked model readiness, private transport permissions, and a second Cognitum call while the GGUF model remained loaded (result `5`). The credential restart case independently confirmed **old token denied / new token accepted**.

## Remaining D03 engineering gates (not yet accepted)

1. Bind Cognitum as a typed Lu Core **native capability** in the real model tool-selection loop, not as an operator-only test-host endpoint.
2. Require a **verified persisted USER turn**, scoped per-turn user approval, replay-resistant capability token and host-only authorization before invoking any fixed worker. Tool discovery must never imply authorization. Negatives must reject forged conversation IDs, stale permission, different turns, cancellation races, and model-authored instructions attempting to escalate authority.
3. Preserve fixed-function Protobuf, worker/root/hash pinning, resource/time/output budgets, host-controlled cancellation, and fail-closed cleanup; separately prove descendants cannot escape when claiming kernel containment.
4. Add paired **WITH / WITHOUT Cognitum** runs on the same local GGUF/model settings with exact-checked answers, hallucination/tool-routing classification, latency, and clear separation of Lu routing failures from Cognitum backend failures. Use more than one arithmetic prompt; later extend to C05/C10/C14.
5. Recheck full Linux installer/runtime resource packaging (including missing `uv` asset), desktop UI pathway, and regression of Windows alpha independently. Keep debug/Xvfb/WebKit test-only knobs out of distributable builds.

## Traceable local evidence

Machine-readable report: `docs/lu-linux/evidence/cognitum-d02-gate-summary-2026-10-31.json`.

Source local evidence files (ephemeral): `build_d02/d02_live_gate.json`, `d02_live_negatives.json`, `d02_model_load.json`, `d02_model_turn.json`, `d02_restart.json`, `d02_unload.json`, `cargo-tauri-check-3.log`, `build_binary.log`, `lu-core-all-tests.log`, and `d02-client-tests.log`.

**Disposition:** D02 **developer-local/live host** integration accepted as recorded. D03 conversation-bound tool execution and production containment **not accepted**. This report is documentation, not a substitute for the local source artifacts, complete logs, release CI, or a signed reproducible build.
