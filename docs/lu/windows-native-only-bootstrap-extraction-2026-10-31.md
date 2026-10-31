# Lu native-only bootstrap extraction (Windows x86-64)

**2026-10-31 — staging source, not an accepted Windows alpha.**

This change builds upon the earlier native-only branch which already excludes the inherited `resources/bin/` payload map, disables the Jan llama-router and agent-tools Tauri plugin initialization, and restricts the Lu main WebView authority.

The `lu-distribution` feature now also **does not**:
- initialize Jan's legacy MCP server/bootstrap;
- import/migrate Jan MCP settings as an implicit startup dependency;
- install Jan's updater plugin or its Lu WebView permissions;
- register Jan agent-tools filesystem hooks;
- sweep Jan's legacy llama-router engine processes on Lu startup.

All those paths remain available in the ordinary upstream Jan build via `#[cfg(not(feature = "lu-distribution"))]`. The independent Lu native inference supervisor and conversation-scoped Protobuf dispatcher remain untouched.

**Not yet removed:** source-linked Jan utilities, the main legacy IPC command inventory used by the Jan-derived GUI, selected RAG/frontend libraries, and any compatibility-only paths that are not automatically initialized. The runtime must be compiled and exercised on Windows, and the final **installed** NSIS contents must prove there is no Jan worker, Bun or UV in *any* installed location. A source config alone is not a release gate.

The first native-only acceptance will test: Lu x86-64 Windows compile/package; installed app boot with zero Jan worker; no Jan profile/registry damage; A/B/A profile isolation; hash-pinned native llama-server, model-generated Protobuf tool invocation and continuation; clean uninstall. The later GUI/WebView tool path remains a separate acceptance gate, as does Windows 10 host compatibility.

The release/rollback Guardian is defined by ADR-LU-DRC-001 but is not implemented by this extraction. Neither a success in CI nor a model-written report constitutes final user-approved promotion.

## Windows preflight fault localization, 2026-10-31

Windows source/permission checks passed; the initial Rustfmt check failed because it recursively scanned hundreds of pre-existing, unrelated Jan modules. The preflight now passes `skip_children=true` and checks only the touched Tauri root file. The three source-format diffs (import grouping and two `cfg` attributes) were corrected. This is a formatting gate adjustment, not a relaxation of the exact Windows installed/runtime acceptance. All inherited Jan files are left unchanged.
