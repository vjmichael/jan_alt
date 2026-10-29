# Lu Windows x64 — model-originated native tool acceptance gate

> **Revised Alpha scope, 2026-10-29:** A valid tool result must originate
> from a **Cowork-free and non-inheritable-Jan-feature-free** Lu desktop.
> The existing source route documented here may still contain legacy Jan
> integration and is a migration/audit input, not accepted Alpha evidence.
> The new Alpha additionally requires end-to-end DX fault localization for
> dispatch, model return, native Protobuf, persistence and rendering. See
> [Alpha rebaseline](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
> Benchmarking is deferred.


Status: **not yet demonstrated end-to-end**. Keep this separate from Rust native-file security tests.

## Verified integration route in source (October 27, 2026)

1. `web-app/src/lib/custom-chat-transport.ts` obtains schemas from `getLuNativeToolSchemas(threadId)` and adds them to the chat model's tool schema list if tool support is enabled.
2. `web-app/src/routes/threads/$threadId.tsx` collects model-generated tool calls in `onToolCall` and executes the selected tool with `executeLuNativeTool(toolName, input, threadId, toolCallId)`, after chat approval logic.
3. `web-app/src/lib/luNativeTools.ts` performs the Tauri `lu_native_tool_execute` IPC call.
4. `src-tauri/src/core/lu.rs` creates a host-defined per-thread workspace, maps model-facing JSON to Protobuf, checks policy, and dispatches through `NativeToolRegistry`.
5. `src-tauri/lu-core/src/native_files.rs` provides capability-confined read/list implementations.

These source paths provide a plausible complete route. They are **not evidence** that a real GGUF reliably emits a tool call or consumes its result.

## Minimal real-model Windows acceptance experiment

- Disposable Windows runner; test-only Lu WebDriver build, verified packaged local worker, checksum-pinned GGUF with explicit tool-use support (not assume SmolLM2-135M is a reliable tool-calling model).
- Create a unique ordinary UTF-8 fixture inside the host-selected *thread scratch workspace*, not under the persistent conversation directory. The model does not choose the root.
- In the graphical chat, prompt the model to use `lu_files_read_text` on the relative fixture filename. Capture the raw local model request and require an emitted tool call, not a hardcoded synthetic invocation or assistant text that resembles one.
- Require the frontend to route this model call via `lu_native_tool_execute`, with the exact original tool call id, host-defined thread scope, Rust policy approval, Protobuf encode/decode, and a successful structured result.
- Require the next model step to explicitly incorporate an unpredictable fixture marker read *only through the tool*, and confirm the persisted UI transcript includes the tool event/result.
- Then test `../outside.txt`, absolute Windows paths, unknown tools, and an explicit user denial (when approval is required) with zero out-of-scope reads.
- Check that malformed arguments cannot be repaired into a broader filesystem authority, no UI-controlled root parameter exists, and Jan AppData/registration remain untouched.
- Stop/abort during a pending approval and during a slow tool operation; record one stable terminal outcome per call.
- Repeat any release-facing claims on a release-profile installed Windows build, not only the debug WebDriver binary.

## CI evidence requirements

Capture actual commit SHA, worker + model digest, Lu PID, tool call id, registered schema, native result code, UI state, authorized scope, denied scope, test assertions, and Actions run URL. Any failed or missing check leaves this gate **open**.

Do not equate an adapter unit test, a Rust dispatch test, or a scripted/mock provider tool event with real model-originated tool use.
