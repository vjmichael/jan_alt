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
