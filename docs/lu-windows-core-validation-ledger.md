# Lu Windows x86-64 core app — engineering validation ledger

Updated: 2026-10-27. Branch: `lu/windows-native-tool-gate`.
Scope: **core Windows x86-64 application only**. DLC/CE workspace work is deferred and does not gate core GUI, GGUF inference, native tools, installer, or restart acceptance.

## Confirmed completed CI evidence

| Gate | GitHub Actions run | Result / scope |
| --- | --- | --- |
| Lu Core Contracts | [40581688035](https://github.com/vjmichael/jan_alt/actions/runs/40581688035) | PASS: core contract tests |
| Windows native filesystem confinement | [40581688102](https://github.com/vjmichael/jan_alt/actions/runs/40581688102) | PASS: native registry/Protobuf, read, scope rejection |
| Lu frontend native adapter | [40583550581](https://github.com/vjmichael/jan_alt/actions/runs/40583550581) | PASS: adapter and model-to-IPC argument validation |
| Lu Desktop Integration | [40583550577](https://github.com/vjmichael/jan_alt/actions/runs/40583550577) | PASS: that workflow's defined desktop checks, **not** proof of actual model-initiated native tools |
| Windows custom model tool capability | [40589446178](https://github.com/vjmichael/jan_alt/actions/runs/40589446178) | PASS: frontend typecheck and adapter regression |

## Open / failing gates

| Gate | Most recent examined run | Blocker |
| --- | --- | --- |
| Windows WebView2 → Tauri native Protobuf IPC | [40598510114](https://github.com/vjmichael/jan_alt/actions/runs/40598510114) | FAIL before test execution, in `e2e yarn typecheck`: `lu-process-restart.e2e.ts` WDIO element collections and expectation types |
| Full genuine process restart with second worker continuation | [40576305333](https://github.com/vjmichael/jan_alt/actions/runs/40576305333) | Latest result needs refreshed verification independently; not substitute for model/tool gate |
| Real GGUF-generated Lu file-tool call | no passing run | NOT TESTED. An IPC test where the harness invokes a tool is **not** a model-generated tool call |
| Installed release-profile inference, tool calls, isolation | no passing run | NOT TESTED |

Windows IPC workflow at `.github/workflows/lu-windows-native-ipc-e2e.yml` builds a test-only Lu desktop with WebDriver and executes `e2e/specs/lu-native-ipc.e2e.ts` selected using `LU_E2E_NATIVE_IPC=1`. The fixture uses a mock chat provider **only to create a thread**; native tool execution is through actual app IPC, Rust policy and Protobuf. The entire E2E TypeScript project is checked before the spec runs, so failures in other specs also block execution.

## Current blocker — root cause and required action

CI log of run 40598510114 reports:
- `lu-process-restart.e2e.ts(63,49)`: `getElements` does not exist on a single `ChainablePromiseElement`
- `(97,36)`: array matcher applied to single-element selector
- `(99,51)` and `(105,63)`: `getElements` on single element

Fix these using WebdriverIO's array selector `$$` (rather than `$`) and the collection's supported typed methods. Verify exact file bytes at the new HEAD and rerun `e2e/yarn typecheck`. Do not claim the IPC gate green until the runner actually reaches and passes the spec. Earlier fixes did not fully resolve the failures.

## Executed work / code locations

- `web-app/src/lib/luNativeTools.ts`: first-party read-only native catalog, IPC execution and client-side model argument limits.
- `src-tauri/src/core/lu.rs`: Lu Tauri commands, registry, policy, Protobuf translation, confined host-owned thread workspace.
- `src-tauri/lu-core/src/native_files.rs`: capability-rooted files.
- `web-app/src/containers/dialogs/AddModel.tsx`: explicit opt-in for tool-capable local models.
- `e2e/helpers/provider.ts`: option for declaring an E2E test model tool-capable.
- `e2e/specs/lu-native-ipc.e2e.ts`: app's native catalog/read/reject gate, incomplete due to CI blocker.
- `e2e/specs/lu-process-restart.e2e.ts`: actual process restart gate, now in need of typecheck correction.
- `docs/lu-windows-model-native-tool-acceptance.md`: strict full-loop acceptance criteria and provenance requirements.

## Next sequential implementation and acceptance gates

1. Make E2E TypeScript compile on Windows, then **pass** WebView2 native IPC test. Keep test-specific logs and actual CI URL.
2. Pin a *tool-call-capable* GGUF and its SHA-256 (small SmolLM2 greeting model is not evidence of working tool calls). Use a verified Lu-packaged llama.cpp worker, a disposable Windows runner and scoped test profile.
3. Test genuinely model-emitted `lu_files_read_text` with an unpredictable file marker inside the native thread scratch root. Require evidence from the raw HTTP completion, matching native call ID, Tauri dispatch, structured Protobuf result, final model answer, and persisted UI transcript. Reject scripted/echoed tool calls.
4. Test invalid paths, unknown tool, denied call, abort and safe error reporting without scope escalation.
5. Repeat accepted behavior with installed **release-profile** Lu build and model import/load UI, then validate Windows installer/uninstaller and Jan-vs-Lu profile separation.

User already has local AI models but **no user-side download or action is necessary** for the automated Windows CI gates. Real PC hardware/model validation is subsequent, optional and must be explicitly user-directed.

## Operating constraints

- Changes on Lu feature branches; do not change `main`, push installer to users, or touch the user's Windows AppData.
- Internal native contracts are Protobuf; JSON only at supported model-facing/external boundaries.
- Do not interpret a mocked provider response, Rust unit test, or compile as a full real-model native-tool integration pass.
- Record every verification as PASS, FAIL, NOT RUN or BLOCKED with commit SHA and Actions run URL.

## October 27 follow-up — WebDriver typecheck repair

- Commit [`99d5130`](https://github.com/vjmichael/jan_alt/commit/99d5130abd590e233a5f4b19988ca6146095e3bf) changes singular WDIO selectors to typed collection selectors at lines 63, 97, 99 and 105 of `e2e/specs/lu-process-restart.e2e.ts`.
- The failing prior run [40598510114](https://github.com/vjmichael/jan_alt/actions/runs/40598510114) was blocked during E2E TypeScript compilation. This change is **committed but not yet verified by a completed matching-head run**.
- Keep the Windows native IPC gate and the genuine GGUF-generated tool-call gate OPEN pending direct CI evidence.

## October 27 — five-gate execution checkpoint

User requested execution of gates 1–5 in order. Latest source correction is [99d5130](https://github.com/vjmichael/jan_alt/commit/99d5130abd590e233a5f4b19988ca6146095e3bf). Windows native IPC integration run [40602955247](https://github.com/vjmichael/jan_alt/actions/runs/40602955247) was **in progress** when inspected. Do not claim its completion without checking the final run status.

Gate 1: E2E TypeScript compile — awaiting completed run evidence. Gate 2: WebView2 desktop IPC — not yet proven. Gate 3: repair any runtime errors — depends on executed gate 2. Gate 4: model-generated GGUF native tools — not yet proven; scripted or IPC-direct calls do not qualify. Gate 5: test ledger updated at this checkpoint; final evidence must be appended when verified.

## October 27, evening — completed CI and latest code fix

- Windows WebView2 native IPC [run 40602955247](https://github.com/vjmichael/jan_alt/actions/runs/40602955247) **FAIL** after successful desktop build, during independent E2E TypeScript typecheck; no WebView2 native IPC spec executed.
- Type errors in `lu-process-restart.e2e.ts` line 64 (array length treated as a promise), line 100 (promise length vs integer).
- [Commit 0d0d150](https://github.com/vjmichael/jan_alt/commit/0d0d15096fc6768e5a8fb1f60373690e1c683119) makes WDIO `$$` array resolution explicit via `.getElements()` before indexing/counting. This is **not yet validated** by a corresponding completed CI run.
- Next: check TypeScript compile in latest run; then inspect real WebView2 Tauri IPC assertions. Real GGUF-generated native tool call remains **NOT RUN**.

## October 27 — current development sequence started

- Latest completed IPC CI [40615847300](https://github.com/vjmichael/jan_alt/actions/runs/40615847300): **FAIL** during TypeScript typecheck on asynchronous `ChainablePromiseArray.length` in the independent WDIO restart spec; Windows desktop compile passed, native IPC spec was **NOT RUN**.
- [Commit 2cd569c](https://github.com/vjmichael/jan_alt/commit/2cd569ca729d56b61b739317b5e55171505bc51f) now explicitly awaits both array `length` accesses; this repair is **COMMITTED, NOT VERIFIED** by completed TS typecheck. `restoredReplies` uses collection indexing.
- Confirmed by source review: `lu_native_tool_catalog(thread_id,scope)` and `lu_native_tool_execute(thread_id,tool_name,call_id,arguments_json,scope)` map through Rust host session, Protobuf catalog and dispatch; WebView2 IPC E2E already asserts catalog and read/traversal rejection on an isolated workspace. Integration test must run before claiming a pass.
- Actual desktop IPC: **NOT RUN**; genuine GGUF-generated model tool call: **NOT RUN**; model-result persistence and recovery: **NOT RUN**; installer acceptance: **NOT RUN**. Do not conflate source review or CI desktop compilation with real runtime acceptance.

## October 27 — Windows IPC confirmed, Lu-owned GGUF preflight started

- **PASS**: [Windows native IPC run 40621153254](https://github.com/vjmichael/jan_alt/actions/runs/40621153254) on [commit 2cd569c](https://github.com/vjmichael/jan_alt/commit/2cd569ca729d56b61b739317b5e55171505bc51f). Verified completed steps: Windows desktop compilation, independent WebDriver harness installation/typecheck, and **WebView2 → Lu-native Protobuf IPC integration**. Previous historical pending statuses above are superseded for this gate.
- Lu-native inference migration begins as incremental **separation from Jan** rather than rewriting the entire desktop. Existing `lu-core::compute_runtime` provides backend selection and verification contracts, **not actual model loading**.
- **IMPLEMENTED, UNVERIFIED**: [GGUF header preflight](https://github.com/vjmichael/jan_alt/blob/lu/windows-native-tool-gate/src-tauri/lu-core/src/gguf_preflight.rs), first committed as `8013776`, exposed in `lu-core` as `0ab5873`. The bounded parser validates magic, version 2/3, file size, and conservative counts without allocating weights or trusting metadata. Unit tests included but **not yet run**.
- Remaining next-stage runtime tasks: host-authorized model path admission (canonical file identity and size/change detection), actual Lu-owned GGUF inference backend lifecycle, streaming generation and cancellation, GPU/CPU selection and diagnostics, then genuine model-generated native tool roundtrip and conversation recovery. All **NOT RUN** as end-to-end gates. Inference backend choice (e.g. audited llama.cpp integration) is provisional until implementation/benchmarks.
- Keep acceptance explicit: never equate 24-byte preflight success, compiled Rust code, mock provider, or external local worker with Lu-native model execution.

## Native Inference Runtime P2 — first implementation checkpoint

- [`ab3fff18`](https://github.com/vjmichael/jan_alt/commit/ab3fff18a1a921eeae9ad4dc7d349081c9296c54): new `lu-core/src/model_admission.rs` provides a host-owned, single-model admission manager. It restricts selected GGUF file names to one component inside an approved canonical model directory, rejects symlinked model files, uses the P1 GGUF header preflight, records canonical path, size and modification time, and allows explicit unload. Included tests cover host-root confinement, double admission, unload, mutation detection, and bad names. This is a **model admission contract**, not the weight loader.
- [`d001d46`](https://github.com/vjmichael/jan_alt/commit/d001d460d08620f28cd37e251d6c86f4ab21c574): exposes `model_admission` in `lu-core`.
- **VERIFICATION: NOT RUN** for these P2 tests in this checkpoint. The acceptance gate still needs an actual `cargo test` and a real Windows engine/backend integration.
- **Security limitation**: metadata recheck is not a race-free authorization for model execution. Before enabling inference, the trusted loader must hold a pinned verified file handle or import an immutable checked model copy; directory path admission must come from host UI/user authorization, never model text.
- **Next P2 increment**: develop Lu-owned inference engine host/ABI integration (initially CPU GGUF), attach validated backend load/unload with state transitions and cancellation; then measure real GGUF token output under Windows x86-64. Streaming, GPU backends and model-native tool calls must remain separate gates.

## P2 native inference engine host — implementation checkpoint

- [`da9ba1b`](https://github.com/vjmichael/jan_alt/commit/da9ba1b94e9151d8ce99de30007f7a10e8d0ad65): added `lu-core/src/inference_host.rs`. Lu-owned backend host defines Idle/Ready/Generating states, explicit load/unload, generation request limits, token chunk callback, cancellation signal, backend error handling, and unload on drop.
- [`5de789e`](https://github.com/vjmichael/jan_alt/commit/5de789eb4de4a96484e96a31a972c558bd8cbbbe): expose inference host module through `lu-core`.
- Unit tests use an explicitly fake backend to validate state transitions and streaming contract; **NOT RUN** at this checkpoint. These are NOT evidence of GGUF inference or model loading.
- **Critical outstanding work:** an actual Lu-owned llama.cpp or other GGUF backend must implement this trait, establish safe immutable model-file ownership, load weights, tokenize, decode and stream real tokens on Windows x86-64. Then integrate into desktop IPC and model GUI, verify cancellation/recovery, and test with a pinned real GGUF model. Protobuf-native wire message work is also outstanding for this host API.
- **Overall gate: OPEN.** The previously passing WebView2-to-native-tool IPC test is separate from inference. Do not claim an executable native inference backend from this commit alone.

## P2 GGUF backend work — multimodal companion admission

- User confirmed that selected local model families may supply **two GGUF artifacts**: base model and separate `mmproj` projector. Existing single-file admission did not support this.
- [`2c246cd`](https://github.com/vjmichael/jan_alt/commit/2c246cd9d6afcada4f2122fd68c486a92cc2f133): introduced explicit, host-authorized optional projector GGUF admission and mutation checking in `lu-core/src/mmproj_admission.rs`, including tests for safe-name validation and mutation. [`9d9cf58`](https://github.com/vjmichael/jan_alt/commit/9d9cf581e88597b6e6551277d002668d140a0ed4) exports module.
- **TESTS NOT EXECUTED**; no real llama.cpp adapter connected and no multimodal modality handling claims. The GGUF header check cannot establish projector/encoder compatibility; that must happen within the actual selected inference backend. Both base model and projector must be pinned or copied immutably before runtime activation.
- **P2 next execution**: implement and build a Lu-managed llama.cpp CPU backend with pinned dependency provenance; integrate with the inference host using real tokenizer/decoder, load/unload, cancellation and token streaming; then validate an actual GGUF sample under Windows, followed separately by mmproj-compatible multimodal smoke tests. Protobuf and UI integration still required.

## October 27 — P2 concrete CPU GGUF execution implementation

- [`c614caa`](https://github.com/vjmichael/jan_alt/commit/c614caacff183f21b2ae2af9c700ac7ae27ac9c2) and [`f329c79`](https://github.com/vjmichael/jan_alt/commit/f329c79129868852428fe82808d149000c72002b): implemented `lu-core/src/llama_cli_backend.rs`, a Lu-owned, hash-pinned, CPU-only `llama-cli` execution adapter. It invokes an explicitly chosen trusted executable without a shell, retains a GGUF file handle, manages per-request process state, streams UTF-8 output with byte limits, stores prompts in a host-supplied private scratch directory, enforces deadlines, and kills a child on cancellation. On Windows its model file handle restricts writing/deletion while admitted. Importantly, this bootstrap **reloads weights per generation** and does not claim native in-process inference or persistent KV state.
- [`c76c6d2`](https://github.com/vjmichael/jan_alt/commit/c76c6d2f148ece7b73ed191e223accbee1d40acb) exposes the real backend; [`ee1c7ed`](https://github.com/vjmichael/jan_alt/commit/ee1c7ed32e463e6ead88b2a61d99b4b32c85b5c5) adds a real GGUF inference smoke example. [`03919cc`](https://github.com/vjmichael/jan_alt/commit/03919cc5f9cfd798f10e9658f164abcf4ff0f7e0) tightens base-model filename validation.
- [`0aa425d`](https://github.com/vjmichael/jan_alt/commit/0aa425d3ee7f203ad2869a295ca6a905e6707e31) introduces disposable Windows CI that builds SHA-pinned upstream llama.cpp commit `7fe450e19305b828c199d602c23a8337aaa1f03b`, downloads and checksum-verifies an existing SmolLM2 135M GGUF fixture, runs Rust unit tests and asks Lu's own backend for generated output. CI run [40630464840](https://github.com/vjmichael/jan_alt/actions/runs/40630464840): **IN PROGRESS when recorded; real generation NOT YET VERIFIED**.
- Previous Lu Core Contracts workflow failures [40628546134](https://github.com/vjmichael/jan_alt/actions/runs/40628546134) occurred at `cargo fmt --check` on recently added modules. This style gate must be repaired; failure is not an inference test outcome.
- [P2 backend design and limitations](https://github.com/vjmichael/jan_alt/blob/lu/windows-native-tool-gate/docs/lu-native-inference-cpu-p2.md) documents trusted executable SHA-256, private prompt handling, process cancellation, side-by-side library provenance, and outstanding release concerns.
- **Remaining: NOT RUN/NOT IMPLEMENTED**: successful real-model CI result, production package verification, long-lived model residency, Protobuf inference wire commands, desktop GUI integration, verified mmproj projection/media execution, runtime model tool call and transcript persistence.

## P2 CPU backend follow-up — compiler, process supervision, current test gates

- [Windows real GGUF run 40630464840](https://github.com/vjmichael/jan_alt/actions/runs/40630464840) **FAIL** at Rust test compile: `E0502` in new UTF-8 chunk test because the callback retained a mutable borrow while the assertion read the collected chunks. No GGUF inference was exercised in this failed run.
- [`8c8e247`](https://github.com/vjmichael/jan_alt/commit/8c8e247879cd2257acc5041fab8dea644aba965f) fixes that test borrow; [one-shot format recovery run 40630644913](https://github.com/vjmichael/jan_alt/actions/runs/40630644913) **PASS** and committed Rust formatting as `6558a276`.
- Core Contracts run [40630723349](https://github.com/vjmichael/jan_alt/actions/runs/40630723349) reached and passed the Lu core test suite, but strict Clippy then reported unused imports in the earlier inference host and CLI backend before the run was cancelled by subsequent work. The CLI `Child` import is now used by the process guard; [`f97dfaf`](https://github.com/vjmichael/jan_alt/commit/f97dfaf41e1cfd72af121571a00fb4b39122d816) removes the stale host import.
- [`c536391`](https://github.com/vjmichael/jan_alt/commit/c536391ce35b1a68fbdd55a66b8fd9c289269ce2) adds a child-process RAII kill guard (including callback panic/early error), hidden Windows console creation, and distinct generation-deadline diagnostics, so background tool launch does not resemble the repeated visible batch windows failure seen with other local assistants.
- Latest exact-head core and real-model smoke runs: [Lu Core Contracts 40630864083](https://github.com/vjmichael/jan_alt/actions/runs/40630864083) and [Lu CPU real GGUF 40630864077](https://github.com/vjmichael/jan_alt/actions/runs/40630864077): **PENDING** at this checkpoint. Keep Windows real-model result **NOT VERIFIED** until an exact-run PASS includes `LU_NATIVE_GGUF_INFERENCE_PASS`.
- The concrete CPU backend runs an independently built and SHA-verified `llama-cli` binary directly, not an in-process llama.cpp binding or a persistent engine. The host-owned production packaging, full executable/DLL provenance, native Protobuf inference APIs, GUI routing and mmproj execution remain future work.

## October 27/28 — resident-model inference implementation

- **PASS**: Lu Core Contracts [40630864083](https://github.com/vjmichael/jan_alt/actions/runs/40630864083) on `f97dfaf`. The tested revision predates the persistent engine.
- **FAIL BEFORE INFERENCE**: Real-model Windows run [40630864077](https://github.com/vjmichael/jan_alt/actions/runs/40630864077). Of 25 library tests, 23 passed, including GGUF admission, fake host streaming and UTF-8 tests; two unrelated CE tests failed due to Windows-invalid temporary directory names containing test names. Fixed by [`cc433427`](https://github.com/vjmichael/jan_alt/commit/cc433427e431458598a38abe66618e7c88e6c328).
- **IMPLEMENTED, UNVERIFIED**: [`9fcbf93`](https://github.com/vjmichael/jan_alt/commit/9fcbf93cef0b2b09ef2d8c0a93df61da48ecb39c) creates a distinct Lu-owned `PersistentLlamaBackend` using a supervised, pinned llama.cpp server on authenticated loopback, CPU-only, resident model weights, bounded streaming event parser and explicit unload. [`aaaf9f7`](https://github.com/vjmichael/jan_alt/commit/aaaf9f77717847e91e16f05f2c4ce9c2fa527ddf) exports it. Persistent **two real generation turns** and stable worker PID are asserted in [`c7383ee`](https://github.com/vjmichael/jan_alt/commit/c7383ee6730b4a0bba1f8e3119be43b7073b8594) and [`c29b03d`](https://github.com/vjmichael/jan_alt/commit/c29b03d396509335d67759330fd8e5a598981eae).
- [`a64826e`](https://github.com/vjmichael/jan_alt/commit/a64826e25e372355667f77183e94b29802b8986d) extends disposable Windows GGUF CI to compile pinned `llama-server`, generate ephemeral bearer credentials, run the one-shot baseline, then prove two turns with an unchanged server PID. `485f6b3` documents release limitations and process/port trust risks. Format-recovery run [40632516675](https://github.com/vjmichael/jan_alt/actions/runs/40632516675) was in progress when checked.
- **GATES REMAIN OPEN** until completed passing CI on the latest implementation: real one-shot output, persistent two-turn output, verified server process identity and crash recovery, Tauri/GUI and Protobuf integration, mmproj inference and installer acceptance.

## October 28 — Windows real-GGUF validation progress

- [Windows real-inference run 40632499809](https://github.com/vjmichael/jan_alt/actions/runs/40632499809) **FAIL** at llama.cpp native build. **27 Lu library tests passed, zero failed**, and both real-inference smoke binaries passed Rust typecheck. CMake successfully configured pinned upstream llama.cpp; MSBuild failed because selecting a nested `llama-cli.vcxproj` target from the root did not resolve the project, before model download or token generation.
- [`82d1d1c`](https://github.com/vjmichael/jan_alt/commit/82d1d1c1cb8f92d8c6a3892b0699a3a1f5e28223) enables the `llama-server` build and switches to building the generated Visual Studio solution, avoiding incorrect subproject target paths. [New run 40632817332](https://github.com/vjmichael/jan_alt/actions/runs/40632817332) **IN PROGRESS** when recorded.
- Actual generated tokens and two-turn stable PID remain **NOT VERIFIED**. Keep proof separate from successful compilation and framework unit tests.

## October 28 — **P2 persistent inference breakthrough**

- **PASS — real one-shot GGUF generation and persistent two-turn generation:** [Windows run 40634678273](https://github.com/vjmichael/jan_alt/actions/runs/40634678273), commit `f9d01bbb641f73340926d9938425f8be87cb14c3`. Pinned llama.cpp and checksum-verified SmolLM2 GGUF compiled and ran on Windows. Lu library tests: **28 passed**. One-shot adapter: `LU_NATIVE_GGUF_INFERENCE_PASS bytes=1026`. Persistent llama.cpp adapter: `LU_PERSISTENT_GGUF_TWO_TURNS_PASS pid=5328 turns=2 bytes=294`; distinct prompts completed with the **same process PID**. This is a genuine runtime execution and residency smoke test; not a benchmark of response quality or memory allocation.
- Previous [run 40632817332](https://github.com/vjmichael/jan_alt/actions/runs/40632817332) failed only at the persistent text generation step, after one-shot generation succeeded. Corrections included canonical SmolLM2-compatible ChatML prompt framing in [`e5b01e5`](https://github.com/vjmichael/jan_alt/commit/e5b01e50b6cf3685abe05fb71b30fc07d3daef28), no-content metadata diagnostics in [`74b100e`](https://github.com/vjmichael/jan_alt/commit/74b100e7e515fb32b5ebfd2019ce83d6af8225a0), and chunk-boundary SSE regression coverage in [`f9d01bb`](https://github.com/vjmichael/jan_alt/commit/f9d01bbb641f73340926d9938425f8be87cb14c3).
- **Resilience acceptance added, pending completed run:** [`3831788`](https://github.com/vjmichael/jan_alt/commit/383178842fea7fac26ae28f09b168b66915705d6) tests in-flight cancellation triggered by the first received output callback, explicit unload, Windows killing the known supervised PID, observed backend failure, and successful reload/re-generation. [`65eca94`](https://github.com/vjmichael/jan_alt/commit/65eca94302950214e806921f24d2a1926d4232e2) wires the example into the Windows inference CI. Keep these gates **NOT VERIFIED** pending its exact run.
- **Scope boundary:** P2 acceptance covers the Lu-owned CPU GGUF execution backend and long-lived process. It does not imply Lu Desktop is already routed to this backend, that Lu has native inference Protobuf messages, or that mmproj/GPU/installer/security hardening is complete. Those remain later integration and release gates.

## October 28 — **P2 CPU inference runtime acceptance: PASS / phase closure**

P2 is **complete at the Windows x86-64 standalone backend acceptance level**. This is not a claim that the GUI has switched from Jan's existing inference integration.

- **PASS:** [Windows run 40635612318](https://github.com/vjmichael/jan_alt/actions/runs/40635612318), implementation SHA `65eca94302950214e806921f24d2a1926d4232e2`. The same reproducible test builds pinned upstream llama.cpp CPU, hashes both binaries, checksum-verifies a real SmolLM2-135M-Instruct Q4_K_M GGUF, and runs independent Lu-owned adapters without Jan inference management. All **28 Rust library tests passed**.
- **PASS:** One-shot baseline `LU_NATIVE_GGUF_INFERENCE_PASS bytes=1026` (stdout smoke output; not a response-quality benchmark).
- **PASS:** Resident model `LU_PERSISTENT_GGUF_TWO_TURNS_PASS pid=3112 turns=2 bytes=294`. Two different ChatML prompts produced text while the server process ID stayed unchanged. This proves *process residency*, not measured OS memory residency or per-token KV reuse.
- **PASS:** `LU_PERSISTENT_GGUF_RESILIENCE_PASS cancel=inflight unload=pass crash=detected reload=pass`. The dedicated smoke test cancels after the first streamed nonempty chunk, explicitly unloads, kills only the Lu-supervised Windows engine PID, verifies failure detection, and explicitly reloads before successfully generating again.
- **PASS:** [Formatting recovery 40635699609](https://github.com/vjmichael/jan_alt/actions/runs/40635699609) normalized the latest inference source and resilience smoke. A separate native host callback cancellation regression was added in commit [`3c7c4fe`](https://github.com/vjmichael/jan_alt/commit/3c7c4fe4ce32225d72b4ce7f67aca531a333943a); [Lu Core Contracts 40636507400](https://github.com/vjmichael/jan_alt/actions/runs/40636507400) is **PENDING** at this ledger checkpoint, not yet certified.
- **Explicit remaining boundaries**: P3 will implement Lu-native Protobuf inference lifecycle/events, Tauri desktop integration and independent GUI model loading; later acceptance gates cover pinned complete engine/DLL packages and signing, Windows Job Object descendant supervision, protected API-key transport, port/engine attestation, high-confidence cancellation acknowledgment, memory admission control, GPU backends, mmproj multimodal execution, installer reliability, benchmark fidelity, and authentic model-issued tool calls. These are **not** claimed to pass by closing the P2 backend milestone.

This supersedes older historical P2 pending/failure checkpoints but preserves them for provenance.

## Final P2 source-quality gate — GREEN

- **PASS:** [Lu Core Contracts run 40636648008](https://github.com/vjmichael/jan_alt/actions/runs/40636648008), source commit `9bbc581a9bbfb2d1999d36c84c41283fea473d76`. All four jobs passed: Rust formatting, `cargo test --all-targets`, strict `cargo clippy --all-targets -- -D warnings`, Jan headless native bridge, Linux signed CE confinement, and Windows CE worker isolation.
- The preceding run [40636507400](https://github.com/vjmichael/jan_alt/actions/runs/40636507400) reached Clippy but found two nested `format!` calls in Windows-safe CE test directory names (unrelated to model inference). Commit [`9bbc581`](https://github.com/vjmichael/jan_alt/commit/9bbc581a9bbfb2d1999d36c84c41283fea473d76) corrected both without changing the inference backend. The exact-head core gate is now **PASS**.
- The original complete P2 real-model demonstration and real cancellation/crash recovery remain verified as **PASS** by [40635612318](https://github.com/vjmichael/jan_alt/actions/runs/40635612318). A redundant rerun of that Windows workflow [40636648034](https://github.com/vjmichael/jan_alt/actions/runs/40636648034) was automatically triggered by the CE test lint fix and was **IN PROGRESS** at documentation time; do not mislabel its pending result as another pass.
- **P2 backend phase CLOSED. Next active work: P3 Lu-native Protobuf inference API and Windows desktop integration**, while explicitly retaining the production security and packaging gates documented above.

## P3 started — native Protobuf inference boundary (P0)

- [`6b10a35`](https://github.com/vjmichael/jan_alt/commit/6b10a35a7083cda83fddded584934b980ab85aec) extends the generated `lu.v1` Protobuf schema with typed, versioned inference load/generate/cancel/unload/status requests and typed, correlated streaming/terminal/diagnostic events. No JSON is used as the internal inference contract.
- [`307aeb9`](https://github.com/vjmichael/jan_alt/commit/307aeb97104b5a7517c091bc2e86b26826faaaf2) adds canonical Protobuf inference frame encoding/decoding with strict message/version/size/reference validation, rejecting unknown/duplicate wire fields, oversized prompts and unbounded token requests.
- [`a3b09fb`](https://github.com/vjmichael/jan_alt/commit/a3b09fb98ab97456f3bc88479618cf4648aecdea) introduces the Tauri-independent inference-to-Protobuf bridge with sequenced streamed text, state, success and sanitized error events. [`186198b`](https://github.com/vjmichael/jan_alt/commit/186198b19a4720a4dfa4c32768ca8ec77b505084) requires host-bound catalog model identity and host-controlled context size; unauthorized sessions and unsupported mmproj requests are rejected. [`44c3fcb`](https://github.com/vjmichael/jan_alt/commit/44c3fcb974aaff3deef8193e9f30ef9a79b15522) adds nonblocking, ID-checked cancellation signaling through the generation token.
- Test coverage includes valid round trips, noncanonical unknown/duplicate fields, invalid references and limits, model context mismatches, event sequences and cancellation identity. [`1592a4c`](https://github.com/vjmichael/jan_alt/commit/1592a4ce2e7663f2cb53dc269a925e4e5ba19577) fixes an outdated bridge-test constructor discovered by Rust CI. Rustfmt recovery ran successfully at [40638178353](https://github.com/vjmichael/jan_alt/actions/runs/40638178353).
- **P3 P0 gate:** [Core Contracts run 40638267265](https://github.com/vjmichael/jan_alt/actions/runs/40638267265) is **PENDING** when this entry was recorded. Until the exact revised code passes, do not claim verified Protobuf integration. P2's standalone real-GGUF generation and resilience proof remains the prior verified milestone.
- **P3 remaining:** verified core CI; host-owned engine package and model catalog binding; actual Windows Tauri IPC/supervisor, cancellation registry and desktop UI; real WebView2-to-native inference acceptance. These are NOT implemented by schema or adapter code alone.

[Detailed P3 phase gates](https://github.com/vjmichael/jan_alt/blob/lu/windows-native-tool-gate/docs/lu-native-inference-p3.md).

## P3 P0 protocol gate — verified core checks

- **PASS — contract tests and strict lint:** [Lu Core Contracts run 40638413415](https://github.com/vjmichael/jan_alt/actions/runs/40638413415), commit `2bf0f298b2fe3c9289e22725eada165fcb86e68f`. At verification, the Rust core contracts job completed successfully: `cargo fmt --check`, `cargo test --all-targets`, and `cargo clippy --all-targets -- -D warnings`. This includes the native Protobuf inference contract and bridge tests. The Jan native bridge and Linux CE confinement jobs also passed; the Windows CE worker job was still in progress at the final core-status check.
- [`2bf0f2`](https://github.com/vjmichael/jan_alt/commit/2bf0f298b2fe3c9289e22725eada165fcb86e68f) addressed the single Clippy `len_zero` warning on the new inference reference validator. The preceding compile issue from an outdated test constructor was fixed in [`1592a4c`](https://github.com/vjmichael/jan_alt/commit/1592a4ce2e7663f2cb53dc269a925e4e5ba19577), and P3 Rust formatting recovery passed [40638178353](https://github.com/vjmichael/jan_alt/actions/runs/40638178353).
- **Scope remains P3 P0:** typed and validated native Protobuf inference messaging, host-bound model and context checks, session-aware event bridge and cancellation signaling. This passing crate test is **not** Windows GUI inference acceptance. Host catalog, verified packaged runtime, desktop Tauri IPC, WebView events and end-to-end test remain P3 work.
