# LU-WIN-GUI-01 — actual installed Windows Lu native tool/chat acceptance

**Date:** 2026-10-31
**Source track:** `lu/windows-alpha-security-staging-20261031`
**Architecture:** Windows x86-64 Lu stable-alpha candidate; Cognitum Linux and experimental IPC branches unchanged.

## Purpose

Close the **installed GUI** evidence gap in the existing alpha ledger. Earlier native-only NSIS verification proved a real model and Lu-native Protobuf file tool inside a Rust test harness using the installed llama-server, while debug WebView2 verified real GGUF chat, message storage and UI rendering. Neither proves the *installed* `Lu-Desktop.exe` itself can send the model-generated read-only native tool, render the result, persist it, and restore it across a cold host restart.

## Implementation

`scripts/lu/verify-installed-lu-gui-tool.mjs` and `scripts/lu/run-installed-lu-gui-tool.ps1` target the **unchanged** Windows x86-64 native-only Lu NSIS artifact pinned by source `7fae3e19c42bf58d2223a4ea675690438a821e74` and SHA-256 `35acb87b602ed2a5313c70e8cadf79b77965dc6b91993c6820bcbfc64b6f9be3`. They require the official Qwen2.5 0.5B GGUF SHA-256 `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db` and validate the installed Lu-owned engine SHA against the signed-by-build manifest.

**Verification update:** The original attempt to attach to WebView2 via local CDP failed both with process-local `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` and with a temporary per-app WebView2 policy. The unchanged installed Lu process stayed alive but published no debug port ([run 41247874172](https://github.com/vjmichael/jan_alt/actions/runs/41247874172)). No successful GUI tool result was claimed. The local driver was replaced by **Windows UI Automation** using Windows PowerShell STA, built-in .NET `UIAutomationClient`, and genuine keyboard/button interactions. No injected JS, direct tool IPC, CDP or replacement debug executable is required for the new path.

The UI Automation **preflight passed** on an independently installed exact NSIS binary ([run 41248206286](https://github.com/vjmichael/jan_alt/actions/runs/41248206286)): `window=true picker=true editor=true`. It intentionally ran no model, tool or chat; those remain independently required below.

1. Validate immutable NSIS artifact and real GGUF checksums; install Lu into a random runner-temp directory. Ensure no Jan worker, Bun or UV binaries remain, and check the installed Lu-native GGUF engine SHA.
2. Launch that exact `Lu-Desktop.exe` under a new disposable Windows profile. Select and load real GGUF using the visible model picker and select the native Lu chat checkbox.
3. Send an ordinary greeting using the installed GUI first-turn control; wait for a real assistant response and new saved conversation UUID. A test-only `notes.txt` is placed under that conversation's Lu-owned read-only scratch root, containing a unique random marker **not included in the user's prompt**.
4. Send the instruction to use `lu_files_read_text` through the installed GUI composer. Require a generated assistant message including the marker and the GUI's native-tool count.
5. Independently inspect saved JSONL and the Lu Core-owned SQLite audit: the model's raw tool request must name `lu_files_read_text` and `notes.txt`; the native feedback must be successful and contain the marker; a second real model output and final answer must be durable. Refuse rejected/failed journal entries, missing/duplicate assistant records, and other threads' audit entries. Never upload model content or profile data.
6. Request normal Lu host exit. Launch a second process of the **same installed executable**, without loading a model. Revalidate exact saved message identity/content through the SQLite and JSONL evidence, and require no new model generation. **The current PowerShell UIA harness verifies cold storage recovery, not rendered assistant content in the second WebView**; an independent GUI-render readback is still an open alpha requirement.

A source-level or preflight `PASS` marker is not this gate. A successful headless Rust tool test, a standalone UI test, a missing WebView2 debugger, or a forced shutdown alone cannot pass installed native-tool acceptance; visual cold-process display acceptance remains distinct even after native journal and saved storage pass.

## Local engineering verification

All harness source was authored locally in the ChatGPT Linux execution environment. `node --test scripts/lu/verify-installed-lu-gui-tool.test.mjs scripts/lu/verify-installed-lu-uia-evidence.test.mjs` passes **8/8** checks, including real-tool journal shape, exact conversation scope, saved JSONL proof, test-only input boundaries, and a fully written synthetic SQLite evidence ledger. Node syntax checks and workflow YAML parsing pass.

New entrypoint `scripts/lu/run-installed-lu-uia-full.ps1` drives the actual OS GUI and asks the model itself to call `lu_files_read_text`; `scripts/lu/verify-installed-lu-uia-evidence.mjs` independently verifies SQLite and JSONL. The tested preflight code is `scripts/lu/probe-installed-lu-uia.ps1`. A Linux container cannot run Windows UI Automation, so full execution remains unaccepted until a genuine Windows run proves it.

## Release status

**NOT YET ACCEPTED until native Windows run confirms all stages.** The CI workflow is a verification vehicle, not Lu's development hub. When it finishes, preserve exact run/job conclusions; if the installed Windows UIA model/tool flow fails, classify its exact stage and preserve false/unknown acceptance status rather than substituting a debug binary.

The existing LCX core chat route, inherited Jan plugin dependency tree, Windows 10/physical AMD validation, worker containment, and Guardian promotion must still be tracked separately. This test does not automatically promote a stable or alpha release.

## Final recorded source analysis and blocker (2026-10-31)

The first full installed-Windows UIA attempt, [run 41248511003](https://github.com/vjmichael/jan_alt/actions/runs/41248511003), passed real GGUF load and native chat UI selection but failed at `first-user-turn`; UIA could select the accessible label instead of the actual editable control. This driver issue was fixed locally.

The next full installed-Windows UIA attempt, [run 41249002699](https://github.com/vjmichael/jan_alt/actions/runs/41249002699), got past first typed message and Send, but **no qualifying saved assistant** appeared by the 200-second deadline. Do not infer a successful model/tool call or a specific runtime cause from this timeout alone.

**Independent source discrepancy identified:** `web-app/src/hooks/useThreads.ts` creates new Lu chats via `ulidx::ulid()` (26-character canonical uppercase Crockford IDs). In contrast, `src-tauri/src/core/lu.rs` previously used `uuid::Uuid::parse_str(thread_id)` and required exact lowercase UUID spelling before admitting a saved chat to `read_only_turn_context`. The prior UIA verifier also searched UUID-only directories. A normal new-chat ULID could therefore be invisible to the test and refused by the trusted native tool host. This is a concrete host/frontend identity incompatibility; it is not yet an independently proven explanation for every failed GUI turn.

**Source correction:** [commit 1d869d4](https://github.com/vjmichael/jan_alt/commit/1d869d4d6b35d7f01d27c080e96b0b6c7f14e3d4) adds Lu-owned, Tauri-free canonical ULID/UUID validation in `lu-core` and uses it at the host conversation authority check without weakening saved USER-turn verification. [Run 41249455181](https://github.com/vjmichael/jan_alt/actions/runs/41249455181) passed native Lu Core workspace/identity tests and strict Clippy on **Windows Server 2025 and Ubuntu 24.04**. GUI harness source was updated to accept both canonical ID formats, with 8/8 local JavaScript tests passing.

**Crucial artifact boundary:** The previously tested NSIS binary is pinned to source `7fae3e19c42bf58d2223a4ea675690438a821e74` and predates this host ULID fix. It cannot certify a corrected runtime. Until a **newly built native-only Windows NSIS from the fixed source** is installed and tested through the actual GUI model-generated Protobuf tool, **LU-WIN-GUI-01 stays OPEN**. Windows 10, installed full GUI cold render, normal engine shutdown, and overall Lu alpha promotion also stay OPEN. The historical binary remains unmodified; no changes to the user's machine or the independent Cognitum Linux branch were made.

To prevent needless resource consumption and false promotion evidence, the historical-NSIS GUI acceptance workflow is now **manual-only** until it is repinned to a new independently verified installer. GitHub is source storage and an optional verification archive, not the local Lu development hub.
