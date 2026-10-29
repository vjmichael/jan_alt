# Lu Phase 5A — Jan dependency extraction audit (initial, source-verified)

Date: 2026-10-28/29. Scope: current Lu branch stacked on Phase 4G, Windows x86-64 first.
This is a **read-only architecture/inventory milestone**, not removal of Jan
and not a claim the Lu desktop can already operate without Jan.

## Decision and release rule

Lu should become independent of Jan's agent runtime, **without breaking the
first Windows GGUF/model/tool/installer acceptance**. The first cut must be
a thin, reversible compatibility seam. Never remove Jan components merely
because Lu has an analogous Rust contract. The existing desktop still needs
the Tauri shell, model/provider fallback, settings, and storage.

Jan provenance remains mandatory. The source of truth for known inherited
files is `docs/lu/jan-origin-inventory.json`; preserve the original
`LICENSE` (Jan / Menlo Research), `NOTICE`, and
`LICENSES/Apache-2.0.txt`. A Lu-only source path is not automatically
proof of independent authorship. Verify each moved/copied file individually.

## Actual dependency graph inspected

| Layer and file | Verified remaining dependency | Lu-owned seam or capability | Extraction decision |
| --- | --- | --- | --- |
| Desktop ordinary chat: `web-app/src/lib/custom-chat-transport.ts` (~1,995 lines) | Jan AI SDK/provider model factory, app hooks, llama.cpp plugin and legacy chat tool advertisement; `prepareMessages` routes to Jan providers by default | Explicit native model choice already bypasses providers via `sendLuNativeConversation` (~line 1438) | **Keep temporarily**; extract a small Lu-native chat transport only after GGUF WebView2 persistence/stream cancellation passes |
| Cowork client orchestration: `web-app/src/lib/coworkRunner.ts` (~641 lines) | JS `RunHandle`, abort groups and sequential tool dispatch; JS abort is not equivalent to killing a native shell/worker | Lu Rust `supervised_tool_generation`, `agent_tool_loop`, `conversation_authority`, `tasks`, `journal` | **Keep as legacy Cowork** until native task/worker resume, checkpoint and UI events are feature-parity tested |
| Cowork transport: `web-app/src/lib/coworkTransport.ts` (~192 lines) | Extends `CustomChatTransport`, relies on Jan model selection and Cowork prompt/tool signatures | Future thin Lu transport and native UI adapters | Do not unlink before routing parity tests |
| Cowork tool selection: `web-app/src/lib/coworkDispatch.ts` (~268 lines) | Dispatches TODO/ASK/TASK/MONITOR, native/web tools, and legacy `executeAgentTool`; session-specific writable path semantics | Already delegates `LU_NATIVE_TOOL_NAMES` to `executeLuNativeTool` (~line 193) | Split tool source selection first; do not delete legacy dispatch until per-tool replacements pass |
| Main-chat tool advertisement: `web-app/src/lib/agentTools.ts` (~540 lines) | `AGENT_TOOL_NAMES` for Cowork and `CHAT_AGENT_TOOL_NAMES = new Set(['shell'])` for ordinary chat; sandbox status remains Jan-dependent | Lu registry/catalog and Tauri schema adapter | Keep Jan shell optional; never advertise it without sandbox; replace catalogs per-surface, not by aliasing sets |
| Legacy native handlers: `src-tauri/plugins/tauri-plugin-agent-tools/src/tools/handlers.rs` (4,163 lines / ~166 KB) | `execute_builtin`, `execute_builtin_with_diff`, shell confinement, diff, hooks, file operations | Lu Protobuf `NativeToolRegistry`, read-only cap-std file tools and policy | First large Rust tool extraction candidate, but **do not delete monolith**; move one capability with new regression and provenance marker at a time |
| Legacy Tauri commands: `src-tauri/plugins/tauri-plugin-agent-tools/src/commands.rs` (2,373 lines / ~86 KB) | Workspace/session paths, permission prompts, file/shell commands, preview, monitors, and subagent artifacts | Lu `src-tauri/src/core/lu.rs` commands and Lu native dispatch | Preserve Jan commands for Cowork until consumers are enumerated and unregistered individually |
| Server-side orchestration: `src-tauri/src/core/agent/loop.rs` (12,232 lines / ~516 KB) | Headless/API-server agent loop and host tool interaction, provider requests and permission prompts | Lu owned native model tool loop exists but does **not** implement Jan's full server/CLI orchestration | **Do not change** in the first extraction. Audit consumers/feature gates separately; this is bigger than the Rust agent-tools plugin |
| Native legacy bridge: `src-tauri/plugins/tauri-plugin-agent-tools/src/lu_bridge.rs` (~270 lines) | Adapter registers `jan.legacy.*` in Lu registry, performs Jan gate plus Lu policy, denies prompts that require UI | A safe, separately testable compatibility adapter | Keep optional; currently explicitly not wired to desktop/Cowork, so this is NOT proof of Jan removal |
| Lu desktop native context: `src-tauri/src/core/lu.rs` | Still calls `tauri_plugin_agent_tools::workspace::{thread_workspace, threads_dir, session_workspace, sessions_dir, permanent_store}` (~lines 150–170); special Jan storage/metadata shapes | Native registry, model schema, policy, saved USER role and thread-scoped directory validation | **First low-risk cut**: clone path *contracts* into a Lu-owned workspace locator (not filesystem data). Test exact existing path equivalence, symlink rejection, profile A/B isolation before replacing call sites |
| Lu trusted model handler: `src-tauri/src/core/lu_inference.rs` | Still attached to Jan/Tauri app lifecycle and saved JSONL conversation metadata | Persistent GGUF supervisor, host user-turn authority, read-only native tools, cancellable durable journal added in 4G | Keep while Windows W01/W02/W04 are open; it is our strongest independence proof once E2E completes |
| Core Extensions: `src-tauri/lu-core/src/ce_broker.rs`, `ce_staging.rs`, `core_extension.rs` | Host-side grant and broker fences exist, **but no authenticated production Windows CE worker IPC/OS sandbox**; staging explicitly marks Windows external CE worker execution unavailable | Durable journal and cooperative Rust-native future cancellation now exist | Treat actual isolated CE worker launch, kill, bounded IPC, and permission revocation as a distinct security gate; never run arbitrary signed CE code just because a manifest validates |

The row counts are approximate, from current source inspection; do not use them
as an API/ABI compatibility promise. The path and ownership conclusions are
specific to this branch, not an upstream-wide licensing determination.

## Recommended execution order

1. **A0 — Freeze interface snapshots (no code deletion).** Record native GGUF
   model/turn command fields, Jan path resolver outputs, Cowork tool names, and
   reversible feature flags. Baseline W01–W06 real Windows tests must remain
   visible. Do not treat a headless passing harness as a desktop pass.
2. **A1 — Replace Lu's remaining Jan workspace *path helper* calls.** Add
   Lu-owned, host-only `workspace_paths` with the same canonical thread and
   session storage layout. Test path equivalence against Jan fixtures, escaped
   roots, Windows reparse-point rejection, cleanup invariants and Jan profile
   canaries. Keep legacy plugin installed for Cowork.
3. **A2 — Extract read-only capability implementation.** Confirm the existing
   Lu cap-std `read_text`/list/stat/search implementations provide the expected
   schema, error and size handling; move each Cowork compatibility call behind
   a registry-specific adapter only after tests verify same results.
4. **A3 — Attach Lu host cancellation and durable effects to all *approved
   write-capable* native calls.** Current ordinary Lu desktop native turn
   deliberately advertises only `ToolEffect::ReadWorkspace`. Phase 4G
   provides a cancellable durable dispatcher but does **not** create a user
   grant or a production native worker execution sandbox. Do not enable writes
   before consent, effect fence, idempotency and real Windows cancellation E2E.
5. **A4 — Replace JS Cowork dispatch one family at a time.** Do not break
   interactive ASK/TODO, monitors, background Bash cancellation, subagent
   pings, or diff/artifact preservation; preserve Jan's behavior behind
   isolated compatibility adapters while migration is reversible.
6. **A5 — Remove old Cowork/agent source only after all call sites are gone.**
   Run static import/IPC discovery, real desktop model/tool acceptance,
   profile restart, installer attribution, and uninstall tests. Mark removed
   modules with exact license provenance (do not erase Jan rights notices).

## Security and recovery constraints that block wholesale extraction

- **Authority:** model outputs cannot mint task IDs, persistent user turn
  roles, device access or workspace roots. Native Protobuf input/output and
  trusted host policy are non-negotiable.
- **Cancellation:** dropping a Rust future is not guaranteed OS worker
  termination. Effect states in `EXECUTING` or `UNCERTAIN` cannot be
  automatically replayed; a durable `APPLIED` Protobuf receipt can be
  reused only after reauthorization. An already completed write is not
  rolled back by cancellation.
- **Recovery:** `EffectJournal::reconcile_interrupted` requires proof that
  the prior owner is gone; do not run it indiscriminately on each GUI request
  while another Lu process might still be active. Normal desktop installs
  use a single-instance guard; the E2E build explicitly disables that guard.
- **Distribution:** do not remove Jan branding/license notices from copies
  of old source until per-file provenance and licenses have been verified.
  Old Jan assets may have separate third-party licenses.
- **Windows first:** do not make Linux/macOS CI or Docker/WSL prerequisites
  of the Windows x86-64 usable installer.

## Milestone gates and ownership

| Gate | Required evidence | Current disposition |
| --- | --- | --- |
| Native Lu model/tool | W01 WebView2 persistent GGUF -> host-authorized Protobuf tool -> model continuation | Open until real Windows pass |
| Native denial and cancellation | W02/W04 real host denial and GGUF cancel; new 4G in-flight Rust future cancellation | Rust gate separate from Windows gate |
| Installed desktop | W03/W05 NSIS worker identity and profile A/B/A | Open until real Windows pass |
| Release integrity | W06 cross-commit NSIS replacement, notices and uninstall | Open until actual installed CI pass |
| Lu core worker effect safety | Phase 4F 13 tests; Phase 4G cancellable durable dispatch and test-only crashes/aborts | Core CI may pass without OS worker kill |
| Jan extraction A1 | Lu workspace path helper parity, no existing Jan files edited | Not begun; this audit authorizes only a proposed next branch |

## First extraction patch specification (A1)

The next code branch should implement a **pure Lu `workspace_paths` module**
with a single host-selected Lu data root and a `scope_kind` enum for
`thread` / `session`. It must reject path traversal and noncanonical
identifiers; must not create a folder during mere resolution; and must compare
old and new path strings on Windows with a disposable fixture. Only then
replace the five `tauri_plugin_agent_tools::workspace` calls in
`src-tauri/src/core/lu.rs`. Keep the rest of the plugin loaded.

**Stop condition:** if the A1 PR changes the on-disk workspace layout,
re-imports Jan profile data, weakens reparse-point guards, loses
conversation-bound authority, or breaks the installed Windows smoke, revert
A1 without rolling back the 4F/4G worker-fence improvements.
