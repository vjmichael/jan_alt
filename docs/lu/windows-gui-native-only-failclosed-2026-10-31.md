# DX-LU-GUI-01 — Native-only Lu GUI must never fall back to Jan's model factory

**2026-10-31; isolated experimental source patch, not shipping GUI acceptance.**

## Fault

On branded Lu desktop, `CustomChatTransport.prepareMessages` routes a thread through `sendLuNativeConversation` when its session is explicitly selected or its durable thread provider is `lu-native`. But when a known, persisted Lu thread was **not** marked native, it previously continued into Jan's `ModelFactory`, local `llamacpp` provider/MCP, and inherited agent execution. The native-only NSIS intentionally removes the Jan worker, so this represented an erroneous unsupported execution route and possible unexpected authority.

## Bounded fix

Immediately after native dispatch and the existing still-hydrating thread check, branded Lu rejects any non-native thread with: *Select a Lu GGUF model and enable Use Lu for this chat before sending.*

This is **fail closed**, not silent auto-selection and not a second model load. The original unbranded Jan build retains its historical `ModelFactory` route, while persisted `lu-native` threads continue through host-owned Protobuf inference, preserving cold-restart ownership. No source is touched in the running native-only installer build. Tests guard the exact dispatch dominance order and reject eight safety-breaking mutations.

## Necessary later evidence

1. Test the Lu native model picker and persisted `lu-native` thread selection in the **actual installed** Windows WebView.
2. Prove normal Lu chat + Protobuf tool + assistant persistence, cancellation and restart still work after this change.
3. Verify the alternate 'not selected' path presents an understandable error and creates **no Jan/MCP child process**, no model factory call and no tool authority.
4. Retain ordinary Jan frontend behavior; no assumption that a native-only Lu NSIS source edit is an alpha pass.

The independent restricted host IPC branch compiles on Windows in [run 41235464533](https://github.com/vjmichael/jan_alt/actions/runs/41235464533). The ongoing native-only NSIS [run 41235830176](https://github.com/vjmichael/jan_alt/actions/runs/41235830176) is pinned to its own different source revision and is not modified or promoted by this work.
