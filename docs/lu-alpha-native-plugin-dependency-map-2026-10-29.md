# Lu Alpha native plugin dependency map — October 29, 2026

Scope: Windows x86-64 Lu distribution, `tauri-plugin-agent-tools` registration and the selected `lu-default` main-window capability. This is a source and build-configuration audit, not installed desktop acceptance. Jan's separate desktop build retains its original handlers. The native Lu conversation tool path is `lu_native_tool_execute` with host-attested turn and Protobuf contracts, outside this plugin's legacy JSON execution IPC.

| Runtime surface | Lu state after the stacked AX batches | Remaining decision |
| --- | --- | --- |
| Legacy `execute_tool` and streaming execution | Not registered; denied by Lu ACL | Implementations and Jan tool core still compile from the shared plugin. Do not infer binary absence from handler omission. |
| Cowork session workspace (3), subagent result (2), blackboard (1), monitor (5), preview commands (2), attachment import (1) | Jan-only registration; all denied by Lu main-window ACL. `preview://` protocol and root state are Jan-only. | Windows WebView2 direct denial is pending; audit generated permissions and other windows before declaring absence. |
| Thread workspace path/delete/sweep and workspace path (4) | Still registered and allowed | Shared `agentWorkspace` and thread cleanup call these; classify which UI functions Alpha inherits before replacing them. |
| Skill list/read/write/delete (4); invoke (1) | Management commands remain registered and allowed. `skill_invoke` is Jan-only and denied by Lu ACL. | The excluded Cowork route is the only production UI caller of skill invocation. Settings/chat may use management calls; preserve user-facing skill data when replacing them. |
| Memory list/read/write/catalog/delete (5) | Still registered and allowed | Shared chat's `agentWorkspace` uses memory management. Preserve data and migration semantics if replaced. |
| `tool_schemas`, `sandbox_status`, `cancel_thread_bash` (3) | Still registered and allowed | `custom-chat-transport`, `agentTools`, and `ChatInput` retain shell display/stop behavior. Coordinate changes to shared conversation and inference files with the DX workstream; Lu must not regain legacy execution IPC as a fallback. |
| `opener:allow-open-path` | Broad inherited `**` scope | Cowork artifact justification is obsolete in Lu, but Settings still opens the logs folder. Replace with a host-controlled logs action, then run Windows regression and remove the broad scope. |
| NSIS `resources/bin/` | Shared Jan worker, Bun, uv and llama.cpp runtime files mapped into Lu | Existing installed startup and replacement tests require the Jan worker; do not strip these until a Lu-owned worker/package path passes real GGUF and installer recovery. Audit the actual installed file list. |

The first five rows total **33 plugin commands**: 17 Jan-only and 16 still registered in Lu. The source-to-permission checker validates the split against `build.rs`; the optimized frontend inventory rejects Cowork/Artifacts-named source modules. Neither check establishes absence of generic Jan modules, Rust implementations, runtime-loaded assets, or an executable fallback. All retained Jan-derived source and notices remain subject to Apache-2.0 provenance review.

Next gates: pass the locked Windows host build and WebView2 denial probe on the current SHA; inspect installed NSIS files and direct IPC; then migrate one shared UI management boundary at a time. Keep the DX-01/DX-02 fixes in their assigned workstream and compare shared interfaces before integration.
