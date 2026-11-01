# Lu Windows alpha — OS and native authority source verification

2026-11-01. Source-only workspace `work/lu-win-alpha-source-hardening-20261101` branched from the current `lu/windows-alpha-six-gates-20261031` candidate while the **unchanged binary** first-turn diagnosis was running independently. This branch imports **only the four Rustfmt changes** already proven on Windows and Ubuntu in [run 41256428557](https://github.com/vjmichael/jan_alt/actions/runs/41256428557), then runs focused pre-alpha negative/OS tests.

## Exact source checks
- Conversation-bound authority: forged/stale USER turns; tool output cannot mint authority; cross-chat, cross-turn, cross-scope and revoked grants deny
- Bundled Lu Protobuf file tool: relative-root containment, symlink/Windows escapes, invalid tools and request bounds
- Native cancellation/durable recovery: effects never silently replay; aborted/revoked tasks cannot continue
- Host resource permissions and account/project separation
- Canonical ULID and historical UUID conversation IDs
- Windows-only reparse-point and SQLite sidecar path guards
- Native-only Tauri/Jan bootstrap absence, no inherited Cowork plugin or remote WebView privilege
- `cargo fmt` and strict clippy with pinned Rust 1.98.0

The two OSes are **Windows Server 2025** and **Ubuntu 24.04**, not Windows 10 client or the user's AMD workstation. These tests DO NOT prove the installed Lu GUI native-tool path, model worker descendant-tree cleanup, an old-to-native upgrade, or Win10/physical GPU compatibility. No alpha gate is promoted without matching installed-product evidence. No Cognitum or experimental IPC work is included.

GitHub is an independent verification archive; source edits originate locally or through the narrow connected repository interface, not GitHub CI as a development hub.
