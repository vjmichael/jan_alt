# Lu Windows LCX-03A — native workspace path ownership

**Date:** 2026-10-31  
**Branch:** `lu/windows-alpha-security-staging-20261031`  
**Scope:** Windows alpha source-level extraction; Cognitum, Linux test-host, and experimental IPC branches untouched.

## Change

The ordinary Lu native GGUF -> saved USER turn -> read-only file-tool path previously called `tauri_plugin_agent_tools::workspace` to compute five paths (`permanent_store`, `threads_dir`, `sessions_dir`, `thread_workspace`, `session_workspace`). The new `lu_core::native_workspace_paths` module owns that logic without importing any Cowork or Tauri crate. `core/lu.rs` now calls the Lu-owned functions.

The on-disk paths remain `<profile>/agent-workspace/threads/<id>` and `<profile>/agent-workspace/sessions/<id>` for compatibility. This is **not permission to execute Cowork** and does not silently migrate or rename persisted user files. The Lu host still attests the saved turn, canonical conversation, directory ancestry, and a scoped read-only registry before model dispatch.

## Scope boundaries

This isolates five critical path computations but does NOT remove the `tauri-plugin-agent-tools` crate from the desktop dependency tree. The legacy plugin still supports compatibility and other Jan features; the separate Cowork quarantine remains necessary. A future Lu-owned namespace migration must have an explicit data migration/rollback plan.

The source-only test suite verifies paths, namespace separation, traversal denial, compatible IDs, and absence of file creation. Actual installed Windows GUI model-selected tool execution and cold restart remain independent alpha gates. The Linux Cognitum test host will be reconciled later, not altered by this change.

GitHub is a source/verification archive; this is not a stable release.
