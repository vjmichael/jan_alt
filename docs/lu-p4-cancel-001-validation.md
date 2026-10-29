# LU-P4-CANCEL-001 validation

Date: 2026-10-28. Status: GUI/request-state fix implemented and locally tested;
packaged Qwen/Vulkan acceptance remains outstanding. No installer was installed
and no application profile or Windows AppData was used for validation.

## Source provenance

- Repository: `vjmichael/jan_alt`.
- Existing local checkout was clean on `lu/core-contracts-native-registry` at
  `11b2e7e8c5370d512a8f8815d5aaaf9e682e04df`; it was only inspected.
- Isolated checkout: `lu/p4-cancel-001`, based on the latest Lu Windows branch
  `lu/windows-native-tool-gate` at `0d1e657c033cb90ef4180ac8eb04a0852fd512d5`.
  Its starting working tree was clean and the remote base was rechecked before
  committing. Main is the inherited Jan branch, not the Lu development base.
- Fix commit: `09c46ca5678cfe9253608f0716d0f9a0e2ad0433`.

## Findings and change

Before the first assistant chunk, AI SDK cancellation leaves the saved user
message as the last turn. The GUI only offered Continue/Regenerate on an
assistant turn. Normal chat therefore had no action for that unanswered prompt.
The model-creation catch also bypassed stream onError/onFinish cleanup, leaving
`currentStreamThreadId` set. Its global loading-state writes could clear the
state of a different conversation which had since started loading.

The fix offers Play/Ask again on an unanswered saved user turn and calls the
existing regeneration/branching path with its original message ID. It does not
append a duplicate user prompt. An older unanswered turn also remains actionable
when another user turn and response follow it. No transient cancelled flag is
needed after rehydration. The message memo comparator includes this state.

Pre-stream rejection now uses the same request-state cleanup as stream failure
and completion. Cleanup is fenced by transport generation and global owner;
thread-local loading/progress is cleared without resetting another thread.
Already aborted requests and Stops during preparation do not start a fresh
model load. Cancellation identity is preserved, including DOMException aborts.
The Lu-native Protobuf supervisor's production code and authority checks are
unchanged; its deterministic lifecycle regression was extended.

## Verified results on Windows

Frontend command (from repository root):

```text
corepack yarn workspace @janhq/web-app exec vitest run src/lib/__tests__/custom-chat-transport src/hooks/__tests__/use-chat.test.ts src/stores/__tests__/chat-session-store.test.ts src/containers/__tests__/MessageItem.test.tsx 'src/routes/threads/__tests__/$threadId.test.tsx' src/lib/__tests__/luInference.test.ts src/lib/__tests__/coworkTransport.test.ts
```

Result: **13 files, 280 tests passed, zero failed**. Includes eight delayed-load
transport tests, 33 message-item tests, 79 thread-route tests, 22 session-store
tests, native adapter and Cowork transport regressions. The transport tests use
the real AI SDK Chat and real app-state store with a controlled model factory.
They cover Stop before creation, during the model probe and during load,
load/unload rejection, retry without prompt duplication, A/B recovery, late
completion of an abandoned load and rehydration into a fresh SDK session.

With only the two production files restored temporarily to the base revision,
the new focused tests produced **7 failed / 34 passed**, detecting missing Play,
stranded request state and cross-conversation loading-state corruption. The fix
was restored automatically in a finally block. Subsequent final suite: 280/280.

```text
cargo +stable test --manifest-path src-tauri/lu-core/Cargo.toml --lib --offline
cargo +stable test --manifest-path src-tauri/lu-core/Cargo.toml --test p2_inference_lifecycle --offline
```

Results: **36 unit tests passed** and **1 integration test passed**. The extended
supervisor test verifies zero text chunks after pre-token cancellation, cleared
generation reservation, immediate next-generation success, unload calls,
reload with a new session, old-session rejection, and unload on supervisor drop.
This uses a deterministic backend, not a real GPU worker or desktop relaunch.
Stable Rust/Cargo was 1.96.0. The pinned 1.98.0 local installation was incomplete;
repair failed with a `bin/cargo.exe` component conflict. The added Windows CI
gate uses the repository's pinned 1.98.0 toolchain.

Also passed: ESLint on all three changed production frontend files,
`tsc -b --pretty false`, `rustfmt` on the changed supervisor source, and
`git diff --check`. Dependency installation and linked core/API builds completed.
Existing React act warnings and dependency peer warnings were observed; they
did not fail these checks. No full application or installer build was performed.

## Remaining release gates and known limits

- This is not verified Qwen GGUF / Vulkan hardware acceptance. An isolated
  packaged Windows run must still cancel at several load stages, verify owned
  worker PID exit/resource release, complete a second conversation, reopen the
  original saved prompt, and verify real shutdown/relaunch persistence.
- The inherited compatibility route still requests a best-effort
  `unloadLlamaModel(modelId)` on Stop. There is no per-request model-load lease
  or cancellation acknowledgment. `ModelFactory` awaits model service and
  extension startup; extension `loadingModels` coalesces model-wide loads;
  Rust `engine/http.rs::load_model` holds the registry lock during the blocking
  load, so unload may wait for initialization. The GUI fix does not prove that
  this path immediately frees GPU resources or settles every late startup race.
  A resource-level change needs a host-owned load-attempt identity and tests
  against the actual compatibility worker; blindly killing a shared worker could
  interrupt another conversation and is deliberately not added here.
- The inherited worker supervisor's graceful shutdown timeout is **15 seconds**
  before the platform fallback. The reported approximately ten-second delay
  has not been reproduced or timed here; no timeout was changed.
- The configured GPG key `D04103399ECFFFB9` has no available secret key. Commits
  are unsigned, with no persistent signing-setting change. Signature acceptance
  is a separate outstanding merge gate.
- The added Windows cancellation workflow is reproducible automation; its
  existence is not a claim that a remote CI run has passed.

The secondary diagnostics work begins with `lu-p4-diagnostics-design.md`.
It is a disabled-by-default, human-approved host-runner design; no runtime
diagnostic feature, benchmark, listener or Lu-to-Lu capability is activated.
