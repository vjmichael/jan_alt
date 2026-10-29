# Lu Batch 4G — Jan-dependency extraction | handoff for ChatGPT Work

**Prepared:** 2026-10-29  
**Target:** Existing ChatGPT Work project **"Work - DX'ing Lu"**; previous Codex task/thread reference `01a1789f-44d0-7240-8a95-6ab3554c4059` (reference only, not a delivered message).  
**Repository:** https://github.com/vjmichael/jan_alt  
**Start here:** `work/lu-batch4g-jan-extraction-handoff-20261029` (documentation-only branch, forked from closed 4F head `5578b0ad7699c6d447818cfa58c0be2ca8c6b371`).  
**4F source baseline:** `work/lu-phase4f-bound-durable-dispatch-20261029`, closure commit `5578b0ad7699c6d447818cfa58c0be2ca8c6b371`.  
**Product priority:** Windows x86-64 installer, first usable Lu experience that loads a real GGUF and answers; Linux/macOS deferred.

## 1. User-approved design constraints / nonnegotiables

- **Lu is a modular personal AI application, not an OS.** Incrementally replace Jan dependencies while keeping the desktop usable. Avoid large simultaneous rewrites and blocking the Windows x64 installer. First extraction is **Cowork/tool-dispatch and agent-loop dependencies**, not a redesign of the entire app.
- **Native tools are first-party auto-registered Rust capabilities.** Internal tool contracts and CE workers use **Protobuf-native IPC**. JSON is allowed at **model/external boundaries**, repaired only as a candidate and validated against typed schemas; do not reintroduce MCP as a mandatory internal transport.
- **Models can request actions but cannot grant authority.** Trust host-persisted user-message identity, conversation ID, task ID, workspace/resource scope and durable authorization. Never use LLM-supplied role, token, path, or permission claims as authority. Revocation must prevent new effects and cancel outstanding work.
- **Effects need durable replay protection.** A restarted/aborted write cannot be silently executed twice; APPLIED receipts may be reused only after current authorization, EXECUTING/UNCERTAIN must be reconciled, and failures stay explicit. Cancellation acknowledgments must not be mistaken for effect rollback or verified OS worker exit.
- **Preserve Apache-2.0 license attribution and Jan provenance in derived files.** See `docs/lu/jan-origin-provenance.md` and `JAN-UPSTREAM-PROVENANCE` comments in Jan-derived TS. Do not remove upstream copyright notices merely because the dispatch path changes.
- **User-facing baseline has no CLI requirement and no Docker/WSL2.** Keep GUI behavior compatible; use Rust/CLI tools for engineering tests as needed. Preserve Jan-compatible behavior behind a controlled fallback while Lu route is being validated.
- **Do not touch the user's installed Windows AppData or silently overwrite their installer.** Do not reset, clean, force-push, or bypass branch protections. Use an independent implementation branch and PR; coordinate with other Lu branches/active CI. Do not label tests or installers passed without evidence.
- **Work scope here is Lu only.** Do not modify the separate Cognitum project, NVP Film Studio, or deferred DLC initiatives.

## 2. Verified completed baseline — Batch 4F, not the installed app

Closure record: `docs/lu-batch-4f-native-worker-closure-2026-10-29.md`. It explicitly closes only the native-worker/journal **regression** milestone.

- Windows x64 AppContainer worker build, file/network denial and process-tree termination: https://github.com/vjmichael/jan_alt/actions/runs/40829009532 — passed.
- Windows worker relaunch after cancellation and second termination: https://github.com/vjmichael/jan_alt/actions/runs/40829413930 — passed.
- Windows worker + durable startup recovery regression: https://github.com/vjmichael/jan_alt/actions/runs/40829431926 — passed.
- Lu desktop native chat IPC boundary: https://github.com/vjmichael/jan_alt/actions/runs/40828465987 — passed.
- Final 4F Rust effect replay / revoke / recovery / formatting gate: https://github.com/vjmichael/jan_alt/actions/runs/40829941594 — passed.

**Do not infer from those gates:** a shipped installer passed a complete application exit/relaunch; every production CE worker is cancellable; Windows OS descendant-exit acknowledgment is universally proven; every filesystem write flows through durable dispatch.

## 3. Exact current implementation / coupling to inspect first

| Source | Present concern / extraction role |
| --- | --- |
| `web-app/src/lib/custom-chat-transport.ts` | Large Jan-derived ordinary chat transport (~76 KB). Contains the regular tool selection and Lu native schema path; preserve chat behavior while routing suitable tools through Lu. |
| `web-app/src/lib/agentTools.ts` | Defines `AGENT_TOOL_NAMES` for Cowork and `CHAT_AGENT_TOOL_NAMES = new Set(['shell'])` for the separate Jan ordinary-chat built-in path. **Important nuance:** Lu native read-only tools are also advertised independently in the ordinary chat transport; do not describe regular chat as exclusively shell-only. |
| `web-app/src/lib/coworkRunner.ts` | Jan-derived standalone TypeScript Cowork agent loop, including continuation/cancellation/budget semantics. It is **not** all inside Rust `handlers.rs`. |
| `web-app/src/lib/coworkDispatch.ts`, `coworkTransport.ts`, `coworkTools.ts` | Cowork tool routing and UI/session coupling. `coworkDispatch.ts` already imports Lu native tool adapters alongside Jan's legacy tools. Map each dispatch edge before removing it. |
| `web-app/src/lib/luNativeTools.ts` | Existing TS adapter for Lu Tauri tools. Identify ownership/auth boundaries and which calls bypass the newer conversation-bound native-turn path. |
| `src-tauri/plugins/tauri-plugin-agent-tools/src/commands.rs` | Large Jan-derived Tauri command and tool bridge. Extract a narrow dependency, not a blanket deletion. |
| `src-tauri/plugins/tauri-plugin-agent-tools/src/tools/handlers.rs` | Large Rust built-in handlers; many tools are already native Rust, but this is not equivalent to a Lu-only trusted registry/dispatcher. Inventory actual callers and pure implementations. |
| `src-tauri/plugins/tauri-plugin-agent-tools/src/tools/ce_worker.rs` | Existing host-owned diagnostic CE worker supervisor with `task_id`, `cancel_task`, `wait_task_drained` and Windows AppContainer process-tree test. Diagnostic launch is not a general signed-production-CE execution path. |
| `src-tauri/lu-core/src/agent_tool_loop.rs` | Lu model JSON boundary and typed native turn; currently calls `ConversationAuthority::dispatch_bound` (non-durable). Critical production migration gap for effectful tools. |
| `src-tauri/lu-core/src/conversation_authority.rs`, `durable.rs`, `journal.rs` | Trusted origin grant, opt-in `dispatch_bound_durable`, SQLite effect receipts and uncertain replay prevention. |
| `src-tauri/lu-core/src/tasks.rs`, `recovery.rs` | Task progress/interruption and combined task/effect startup reconciliation. |
| `src-tauri/src/core/lu_inference.rs` | Lu persistent GGUF Tauri entry points. `native_turn` verifies saved conversation user turn and allows read-only tools; `cancel_native_turn` currently signals the model-turn cancellation but should be audited for real CE-worker coverage. |
| `src-tauri/src/core/lu.rs`, `lu_recovery.rs`, `src-tauri/src/lib.rs` | Lu read-only tool registry/context and desktop startup lock/recovery gate. App still contains numerous Jan commands and compatibility integrations. |
| `src-tauri/src/core/agent/loop.rs`, `session.rs`, `commands.rs`, `host_tools.rs`, `genai_bridge.rs` | Additional Rust agent/desktop surfaces requiring dependency and ownership classification. |
| `src-tauri/plugins/tauri-plugin-llamacpp/src/engine/worker.rs` and Lu persistent inference backend | Distinguish Jan legacy inference worker and independent Lu-hosted llama.cpp runtime; don't regress model loading while reducing Jan dependency. |

Repository history may evolve concurrently. Compare the above against branch HEAD and any active Lu PR before editing. **Jan is a legacy provenance label, not a warrant to remove existing Apache-2.0 source notices.**

## 4. Proposed execution sequence (small gated engineering slices)

### 4G-A — Dependency inventory and extraction map (first deliverable)
1. Inspect import/call graphs from ordinary chat and Cowork through their TS adapters, Tauri commands, Rust handlers, and Lu native registry. Include `src-tauri/src/core/agent` and inference worker dependencies.
2. Classify each Jan edge: (i) indispensable for Windows first-run, (ii) replaceable with existing Lu native capability, (iii) UI/compatibility fallback, (iv) blocked by missing Lu equivalent. Record path, symbol, caller, authority check, effect type, cancellation, telemetry and test.
3. Audit current Jan provenance/notice coverage. Do not touch licensing banners if unsure.
4. Produce a concise dependency graph and prioritized extraction matrix with actual line/commit references. Choose **one** lowest-risk first extraction seam.

**Exit gate:** accurate dependency map, call graph checked, no production behavior changed, no guessed "Jan-free" claims.

### 4G-B — Trusted ordinary-chat native dispatch bridge
1. Select the smallest existing ordinary-chat native route for proof of replacement (prefer read-only file/stat/search) and keep Jan/Cowork fallback isolated behind explicit routing.
2. Derive task origin from trusted persisted USER message + host-owned scope; reject forged/expired origin. Do not trust webview-supplied workspace roots, LLM-provided IDs, or cached grants.
3. Reuse Lu's canonical Protobuf codec/registry/model JSON boundary; preserve frontend tool result shape and cancellation presentation.
4. Route only operations that have complete scope and authorization validation. Keep write-capable migration disabled until journal integration is proven.

**Exit gate:** equivalent read-only chat result on real GGUF -> model request -> Lu tool -> feedback -> conversation persistence; negative tests for forged ID, wrong workspace, revoked task; Windows CI green.

### 4G-C — Durable write-path and cancellation parity
1. Identify current call sites using non-durable `dispatch_bound` and legacy `execute_tool`. Introduce production journal ownership and route effectful native operations through `dispatch_bound_durable` or a safer equivalent (not just test fixtures).
2. Bind host task IDs to active CE workers and actual desktop Stop events; audit existing `lu_inference_native_turn_cancel` and Cowork cancellation. Ensure launch/revocation/cancel/shutdown are supervised.
3. Preserve APPLIED receipt replay, UNCERTAIN on uncertain completion, explicit permission-revocation fences and startup task recovery. Do not treat registration-drain as verified OS descendant exit.
4. Add fault-injection tests for crash after effect/before receipt, revoke during tool, stop/close while worker runs, repeat call ID, restart without double write.

**Exit gate:** source + tests for production effectful path, Windows worker/harness tests, and an honest report of GUI/OS evidence.

### 4G-D — Incremental Jan reduction and installed acceptance
1. Replace individual legacy dispatch edges only after Lu parity tests and authorization audit pass. Preserve old UI/session history, original memory/workspace behaviors and feature-flag fallback where still needed.
2. Verify first-run Windows x86-64 GGUF load and response, native tool call, Stop, exit/relaunch, model persistence and reliable error behavior against a real installed build. Do not reuse the 4F diagnostic harness as a substitute.
3. Update source provenance labels and extraction map; tally **remaining** Jan edges with reasons. Do not declare fully Jan-free until the dependency graph proves it.
4. Report exact commit SHAs, branch, tests, Windows run URLs, blockers and any unchanged legacy seams.

**Exit gate:** narrowly scoped extraction PR(s), passing relevant tests, current remaining-Jan dependency inventory; installer claims only with real installed-app evidence.

## 5. Operating constraints for Work

- **Own a separate implementation branch** based on this handoff branch or its closure SHA; work in small reviewable commits. Avoid the protected `main` and previously closed 4F branch, and avoid overwriting concurrent development.
- Before every high-risk edit, search repository for current call sites and tests. Maintain a change log and precise acceptance evidence; do not mask an unavailable Windows runner by calling unit tests an installer pass.
- Run Rust format/test/lint and TS tests relevant to touched surfaces. Windows CI is required for Windows-specific process, COM, AppContainer and installer code.
- Keep untrusted model JSON only at its boundary and typed Protobuf for Lu native dispatch. No mandatory external MCP server or shell-based installer dependencies.
- No modification of local user files or `AppData`; no Docker/WSL2 or Linux/macOS build work for this milestone. No force-push or bypassing branch rules. Seek user approval before destructive repository operations or shipping an installer.
- Prefer completing 4G-A and one vertical slice of 4G-B in the initial Work session; proceed in batches with explicit, reproducible results. Clearly separate code-complete, CI-pass, Windows runtime-pass and installed-desktop-pass.

## 6. Start instruction to ChatGPT Work

> Take ownership of **Lu Batch 4G — Jan-dependency extraction** in `vjmichael/jan_alt`. Read this handoff and the 4F closure record first, confirm current branches/PRs, produce the actual Jan dependency and provenance map, then implement the smallest safe ordinary-chat native dispatch extraction on a new branch with tests. Keep Windows x86-64 first-run/installer priority, preserve Apache-2.0 provenance, use host-scoped Protobuf-native capabilities and durable effect/cancellation safety, and do not silently modify or remove Jan compatibility code. Report commits, test URLs, remaining Jan edges, and all acceptance limitations. Do not assert installed-desktop success from 4F diagnostics.

## 7. Verification links

- Repository: https://github.com/vjmichael/jan_alt
- 4F baseline branch: https://github.com/vjmichael/jan_alt/tree/work/lu-phase4f-bound-durable-dispatch-20261029
- 4F closure record: https://github.com/vjmichael/jan_alt/blob/work/lu-phase4f-bound-durable-dispatch-20261029/docs/lu-batch-4f-native-worker-closure-2026-10-29.md
- Handoff branch: https://github.com/vjmichael/jan_alt/tree/work/lu-batch4g-jan-extraction-handoff-20261029

**Transfer status:** This handoff is committed to GitHub so Work can retrieve it. It is **not** evidence that a message was sent to or accepted by an existing Work task, nor that implementation work has started.
