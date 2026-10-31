# LCX — Lu Chat Runtime Independence (RFC-LU-CHAT-001)

**Status:** Proposed and source-audited, 2026-10-31. **No change to Lu Stable.** This is not a claim that the chat route has been extracted or that Windows alpha is accepted. Development should be local-first; GitHub records source/evidence.

## Decision

**Lu owns chat execution from the first user event to the persisted final result.** Jan may remain a properly attributed source for reusable React components, visual styling, icons, UI primitives and carefully evaluated data formats. Jan's model factory, provider-selection runtime, Cowork transports, MCP orchestrator, old llama worker and its app-level tool dispatch must not participate in a native-only Lu chat turn.

Separate **source provenance** from **runtime ownership**. A Lu file still derived from Jan is not automatically an architectural dependency; a live import, IPC handler, process, service hub or provider path that controls Lu chat is.

We will use a strangler extraction: introduce a Lu-owned chat path, prove its semantics, switch Lu-only entry points at build time, then remove Jan chat graph from the Lu bundle. Keep ordinary Jan branches and Apache-2.0/NOTICE attribution intact. Deleting modules wholesale is disallowed before replacement passes.

## Source audit of the current Windows candidate

| Source | Current observation | Disposition |
|---|---|---|
| `web-app/src/routes/threads/$threadId.tsx` (~2,710 lines) | Jan-derived thread UI uses `useChat`, provider/app state, RAG/MCP and an onToolCall handler including a legacy MCP dispatch path | Split Lu chat controller from presentation; eventually `LuThreadRoute` with shared views |
| `web-app/src/hooks/use-chat.ts` | Always instantiates `CustomChatTransport`; subscribes to `mcpToolNames`/`ragToolNames` and refreshes tools | Replace on Lu with `useLuChat`, no Jan service hub subscriptions |
| `web-app/src/lib/custom-chat-transport.ts` (~2,000 lines) | Jan `ModelFactory`, plugin llama router, MCP orchestration and Cowork legacy logic. Existing fail-closed Lu check prevents **sending** through legacy routes, but Jan transport still exists/initializes for Lu | Move to Jan-only bundle/route; do not create Lu subclass or compatibility shim over Jan transport |
| `web-app/src/stores/chat-session-store.ts` | Session transport is typed `CustomChatTransport`, coupling SDK chat sessions to Jan | Use Lu-owned typed session state or a transport-neutral session interface without importing Jan |
| `web-app/src/lib/luInference.ts` | Already calls `lu_inference_load`, `lu_inference_native_turn`, `lu_inference_native_turn_cancel` and streams host result as AI SDK chunks | Retain/rehome as nucleus of new Lu chat transport; host reconstructs history; no client authority escalation |
| `src-tauri/src/lib.rs` and `src-tauri/src/core/lu_inference.rs` | Independent Lu-native Tauri commands and model supervisor available; separate restricted IPC allowlist compiles on Windows | Integrate restricted, audited handlers only after GUI compatibility gate |
| `src-tauri/lu-core` | Lu native tool dispatcher, authorization, journal/checkpoint and model continuation contract | Authoritative tool execution; JS must not create new tools or grant permissions |

The current Lu-branded fail-closed routing patch [#41237119995](https://github.com/vjmichael/jan_alt/actions/runs/41237119995) and branded frontend test [#41237269429](https://github.com/vjmichael/jan_alt/actions/runs/41237269429) have passed. **These do not remove Jan's transport construction or its graph from Lu's frontend bundle.**

## Required end state

```text
Lu-only thread route and reused presentational widgets
    |
    v
useLuChat / LuChatSessionStore / LuChatTransport
    |    No Jan ModelFactory, ServiceHub, Cowork, MCP, llama plugin imports
    |    Only UI messages, status and cancellation
    v
Lu host IPC (scoped conversation_id, turn_id, saved_user_message_id)
    |    Host reconstructs trusted persisted conversation; treats text as data
    v
Lu Conversation Runtime (Rust, Protobuf)
    +-- Model Broker / Lu-owned GGUF supervisor
    +-- Conversation-bound authorization + native tool registry
    +-- Durable memory, thread persistence and checkpoint/effect journal
    +-- Diagnostics, cancellation, recovery and safe failure
```

**Model input does not authorize native tools.** The WebView does not supply arbitrary filesystem roots, model-server credentials or tool execution code. The host enforces per-conversation and per-turn permissions, writes journal checkpoints before acknowledging effects, and returns a typed result. Tool discovery is not authorization.

The same native runtime can later serve the disposable headless Lu Dev and any DLC UI clients through a separately authenticated broker, without a second resident model or a second owner of authority.

## Staged extraction and acceptance

### LCX-00 — Dependency inventory and freeze
- Record live graph from route → hook → transport → providers/tools, and corresponding Rust handler surface.
- Keep compatibility build unchanged; freeze verified NSIS/model baseline.
- Source audit must report unresolved Jan paths as **BLOCKED**, never label a simple existence check as passing independence.

### LCX-01 — Native Lu transport
- Introduce `LuChatTransport` (AI SDK stream adapter) built on Lu's existing host-owned `lu_inference_native_turn`; it must import no `ModelFactory`, Jan plugin API, MCP, Cowork or Jan ServiceHub.
- Require persisted user-turn identity; host-owned history and tool dispatch; cancellation by typed turn identity; no client-manufactured tool JSON or fallback.
- Unit tests: load unavailable, missing native selection, unauthorized tool, abort mid-tool, resume-after-crash and malformed host receipts.

### LCX-02 — Native hook/session store
- Create `useLuChat` and `LuChatSessionStore` independent of `CustomChatTransport`.
- Keep UI SDK message chunks and stable thread/message IDs; do not migrate user conversations destructively.
- Avoid frontend model-factory/RAG/MCP subscription. Lu native memory/search becomes an authorized host capability, not a Jan tool.
- Preserve existing chat sending, stop/queue, regenerate and durable read receipts; unsupported actions fail visibly.

### LCX-03 — Lu-only route boundary
- Split Jan's 2,710-line `$threadId.tsx` responsibilities into a narrow Lu controller plus reusable presentational components. A Lu-specific route composes those components with `useLuChat`.
- The Jan route remains separately built for upstream compatibility. Do not put a branded runtime `if` inside Jan's main tool loop as the permanent solution.
- No `onToolCall` JS dispatch for Lu-native tools; the host performs actual execution. UI renders typed tool events/evidence only.

### LCX-04 — Build-time graph elimination and WebView IPC authority
- Lu frontend entry point and modules must compile without **runtime imports** of Jan `CustomChatTransport`, `ModelFactory`, Cowork transports, `mcpOrchestrator`, llama plugin adapter or Jan service hub for chat.
- Guard the output **bundle graph**, not only source strings. A package is blocked if banned chat-execution modules reach Lu's main window chunk.
- Tauri Lu app-level handler allowlist and capability map must exclude inherited MCP, Jan agent, arbitrary path I/O, updater and provider-secret commands while preserving required Lu native commands.
- Ordinary Jan remains unchanged; retain provenance notices and licenses.

### LCX-05 — Real installed end-to-end acceptance
- On an installed native-only NSIS package, select GGUF in Lu UI, load it, send a turn, have the model itself request a host-authorized native Protobuf tool, then continue, display and persist the answer.
- Restart process and recover identical thread; verify interrupted tool/cancellation, process descendants, checkpoint contradictions and zero unauthorized side effects.
- Verify **zero** Jan worker/Bun/UV executables and no Jan MCP or model child process during Lu chat.
- Verify install/upgrade/uninstall and user-data canaries, Windows x86-64 host. Windows 10 requires a separate compatible host.
- User-visible screen/control test and Rust host evidence must agree; no self-verified promotion.

### LCX-06 — Remove old chat glue from Lu distribution
- Delete or quarantine unreferenced Jan chat-specific compatibility glue from Lu build only once LCX-05 is green.
- Unused Jan-origin code can remain in repository where required for ordinary Jan builds/attribution; it must not be accessible through Lu binary/IPC/runtime.
- Independent Lu Guardian/user approval for later safe release upgrades; not implemented by this RFC.

## Related 2026-10-31 native-only NSIS evidence

[Native-only NSIS run #41235830176](https://github.com/vjmichael/jan_alt/actions/runs/41235830176) built and uploaded its Windows x64 installer with digest `35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3`. On the installed tree, `LU_NATIVE_ONLY_INSTALLED_PAYLOAD_PASS legacy_executables=0`, Lu-owned engine manifest validation, lazy startup with zero Jan workers, and three-profile A/B/A restart/isolation passed. The independent GGUF-to-native-tool integration failed: `incomplete durable model/tool/final journal`, observed **6 versus expected 7 records**, and the smoke runner also failed to locate `scripts/lu/check-installed-smoke-verdict.mjs`. Those are separate blockers, not evidence that Jan's old worker is required. Treat the actual model/tool and receipt gates as failed until retested against the immutable installed artifact.

The requirement to remove Jan chat orchestration is **additional** to removing legacy executables. Absence of binaries alone is not complete Lu chat independence.

## Non-goals and compatibility policy

- Do not rewrite Tauri/React, the AI SDK, icons, basic UI components or preserved conversation format merely because they originated in Jan.
- Do not grant Lu WebView unrestricted filesystem access to replace a removed Jan API.
- Do not make MCP required for native tools. A future optional MCP adapter must be explicit, scoped and off by default.
- Do not auto-install a self-modified Lu build. Disposable development, local versioning, independent release attestation and Guardian-controlled rollback remain separate development/release gates.
