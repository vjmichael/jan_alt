# Lu native-only app-command IPC allowlist (source-stage)

Date 2026-10-31. Separate disposable branch; **does not change the running native-only NSIS compiler source**, and is not yet Windows Tauri compiled or installed.

Review found that switching off Jan's agent-tools and MCP *plugins* left Jan's full **app-level `tauri::generate_handler!` command table** exposed to Lu's WebView, including:
- legacy `core::mcp::commands::call_tool` and server enable/configuration;
- inherited `core::agent::*` skill/plugin execution surfaces;
- raw path-based `core::filesystem` read/write/delete/move handlers;
- local provider-secret, server startup, arbitrary launcher, and update primitives.

For Lu, a different `#[cfg(feature="lu-distribution")]` handler macro now allowlists only user-mediated file dialogs, minimal settings, native inference and conversation-authorized Protobuf tools, thread CRUD, diagnostics, consent and theme, while ordinary Jan retains the original full handler table under `#[cfg(not(feature="lu-distribution"))]`.

This **reduces main-WebView attack surface**, but cannot be called accepted until Rust/Tauri Windows compile, real WebView authority and native GUI chat/tool workflow pass. Basic Jan-derived Settings pages may require additional reviewed commands before functional parity. No arbitrary-path file operations should be restored merely to fix a missing frontend command; use Lu-native authorized tools and explicit host-mediated operations.

The alpha's actual legacy-runtime removal is being separately built/tested in [run 41234053997](https://github.com/vjmichael/jan_alt/actions/runs/41234053997). Do not merge this IPC branch into its source mid-run. Git remains a repo/evidence archive; user-approved Guardian promotion remains distinct.
