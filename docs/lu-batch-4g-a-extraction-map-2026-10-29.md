# Lu 4G-A: Jan dependency and first dispatch extraction map

Baseline: handoff `b7dbcb731cb4894eed6441533f6f4fe457f46587`, whose parent is the closed 4F head `5578b0ad7699c6d447818cfa58c0be2ca8c6b371`. Line references below describe that baseline unless noted. This is a Windows x86-64 source inventory, not an installed-desktop acceptance.

## Call graph

```text
ordinary chat (custom-chat-transport.ts)
  ├─ Lu opt-in model → luInference.ts:sendLuNativeConversation
  │  → lu_inference_native_turn → saved USER turn check
  │  → NativeToolTurn → model JSON boundary → Protobuf catalog/registry
  │  → read-only thread scratch → journaled model turn → persisted chat reply
  └─ legacy model factory → Jan/remote model + MCP/web/shell schemas
     → Jan compatibility tool dispatch (Lu native schemas were advertised
       here, but no Lu executor was registered in this transport)

Cowork → coworkTransport → coworkRunner → coworkDispatch
  ├─ executeLuNativeTool → lu_native_tool_execute (session scratch)
  └─ executeAgentTool → execute_tool → Jan Rust gate/handlers

separate Rust agent loop → host_tools / MCP / genai bridge / Jan llama state
```

## Extraction matrix

| Edge and baseline reference | Class / effect | Authority, cancellation, telemetry and test | Decision |
| --- | --- | --- | --- |
| `custom-chat-transport.ts:1437-1440` → `luInference.ts:98-176` → `lu_inference.rs:533-650` | Existing Lu replacement; read-only scratch and model generation | Main-window and recovery checks; saved USER message and canonical thread verified in `lu.rs:60-124`; host creates task/grants; cancellation signal at `lu_inference.rs:654-674`; model-turn audit SQLite; `luInference.test.ts`, native chat IPC and Windows WebView2 gates | Preserve as the sole ordinary-chat Lu native dispatch route. Real installed app still unverified. |
| `custom-chat-transport.ts:1238-1268` → `luNativeTools.ts:24-103` → `lu.rs:227-252` | Replaceable, read-only schema advertisement; legacy model transport cannot dispatch these names | Direct IPC previously admitted thread scope without saved USER turn; registry policy confined to scratch, but no conversation-bound grant or native turn cancellation. `luNativeTools.test.ts`; new transport test | First extraction: remove misleading legacy advertisement, reject direct thread execution; Lu opt-in route retains model→tool→feedback. |
| `custom-chat-transport.ts:1190-1254` → model factory and MCP/websearch/Jan shell | UI/compatibility fallback; external read and possibly effectful shell | Jan shell schema gates via `agentTools.ts:76`; MCP and websearch have distinct controls. Jan stream cancellation and existing chat tests. | Keep for existing models; no silent Lu fallback. Audit each tool before migrating. |
| `coworkTransport.ts:185` → `coworkRunner.ts:411,580` → `coworkDispatch.ts:198,241` | Compatibility fallback; mixed read/write/process effects | JS abort at `coworkRunner.ts:112` does not attest OS exit; `coworkDispatch` session adapter uses direct native IPC and Jan `executeAgentTool`. Cowork tests and Jan plugin command tests. Session scope is not a host-attested conversation grant. | Keep explicit; migration blocked by origin and durable-write parity. |
| `agentTools.ts:258-300` → `tauri-plugin-agent-tools/src/commands.rs:739,835` → `tools/handlers.rs` | Jan native implementations, read/write/shell | Jan gate/sandbox and `execute_tool` checks, separate from Lu `ConversationAuthority`; existing command tests cover Jan behavior. Effect journal and task origin do not cover all calls. | Inventory per capability; no blanket removal or write promotion. |
| `lu-core/src/agent_tool_loop.rs:249` → `ConversationAuthority::dispatch_bound` | Lu bridge, read-only currently in desktop; potential effectful risk | Conversation-bound authority checked, but non-durable dispatch. `dispatch_bound_durable` exists separately in `conversation_authority.rs:243`. Model-turn journal tracks model turns, not arbitrary filesystem effect receipts. | Block write-capable tools until production effect journal integration and fault tests. |
| `src-tauri/src/core/agent/loop.rs:78-90` → host tools, MCP, provider bridge, llama state | Separate Jan/Rust agent surface; mixed effects | Own permissions/registry and session lifecycle, not the Lu native turn; inspect `host_tools.rs:107-168` for pending call cancellation. | Indispensable for compatibility until individual call sites and host ownership are mapped. |
| `tauri-plugin-llamacpp/src/engine/worker.rs` and `lu_inference.rs` | Jan model-worker compatibility and Lu-owned GGUF path | Jan worker still supplies other desktop models; Lu host pins its packaged runtime and admission. 4F worker tests are diagnostic, not installed first-run acceptance. | Keep Jan worker for existing provider; verify Lu installed load separately. |
| `src-tauri/src/lib.rs:40-128,283` | Jan desktop command registration and compatibility setup | Includes filesystem, app, server, agent and tool commands with disparate policy and telemetry. | Indispensable for current desktop; no broad command deletion. |

## Provenance and remaining work

`docs/lu/jan-origin-inventory.json` individually classified nine Jan-derived files at baseline; this batch adds the modified upstream chat transport test as a tenth. `custom-chat-transport.ts`, its shell-switch test, `coworkRunner.ts`, `coworkTransport.ts`, `coworkDispatch.ts`, `agentTools.ts`, and Rust `handlers.rs` carry `JAN-UPSTREAM-PROVENANCE` plus Menlo Research/Apache-2.0 notices. `commands.rs`, `src-tauri/src/core/agent/*`, and `engine/worker.rs` are in candidate zones but have not been individually classified by that register. Preserve all upstream rights and retain `LICENSE`, `NOTICE`, and `LICENSES/Apache-2.0.txt`; run the provenance gate for changed inherited source.

4G-B in this slice changes only schema routing and direct thread-scope access; it does not claim Cowork origin parity, production write durability, CE worker Stop integration, a new installed GGUF run, or Jan-free desktop status. The next candidate is a host-verified Cowork read-only operation with a persisted USER origin and task identity. That requires a separate session-origin contract; do not infer one from the webview's `threadId`.

## Follow-up read-only desktop fence

The production `lu_inference_native_turn` now constructs `NativeToolTurn::new_read_only`. It checks the selected registered tool effects before advertising them and again immediately before non-durable dispatch. An effectful capability granted by mistake cannot run through this desktop turn; the separate test-only/general constructor remains available for durable-effect fixtures. This is a safety boundary for the existing read-only route, not a production write journal or Cowork origin contract. The next 4G-C batch must supply host-owned journal lifecycle and a distinct durable production entry before advertising any write capability.
