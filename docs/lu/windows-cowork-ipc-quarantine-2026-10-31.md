# AX: Lu distribution agent-tools IPC quarantine

Date: 2026-10-31. Base: 5c99b8ab99b583812e305acd2acfa3fa96b5b62b (includes restricted Lu main WebView capability).

## Change

For `lu-distribution`, the inherited agent-tools plugin no longer registers *any* of its Tauri command handlers (the previous `agent_tools_handler![]` still exposed workspace, skills, memory, schema and bash-cancellation commands). The legacy Jan desktop's full handler table remains unchanged behind `#[cfg(not(feature="lu-distribution"))]`. The handler macro itself is unavailable to a Lu-distribution build. Lu's separately hosted, conversation-authorized Protobuf file-tool dispatcher is not modified.

This is runtime **IPC registration quarantine**, not binary-size proof or full removal of linked Jan source and resources. No Tauri/Cargo build has been run for this new revision. Feature-specific Windows host compilation and actual WebView native-chat/native-tool tests are mandatory before merging. It must not interrupt the currently running NSIS compatibility preview, and the installed Jan bootstrap worker remains a blocker for alpha independence.

## Next verification

1. Compile with `--features lu-distribution` on Windows and inspect the Lu capability table; no inherited agent-tools commands must be invokable from any window.
2. Confirm Lu native model loading, actual GGUF assistant persistence, and native file tools continue to operate.
3. Confirm Jan non-Lu build retains the original handlers without regressions.
4. Remove the inherited Jan worker and Bun/UV payload through separate packaging and startup extraction gates; do not treat this isolated change as completed alpha.

GitHub remains repository/verification, not dev environment.
