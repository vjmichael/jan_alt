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
