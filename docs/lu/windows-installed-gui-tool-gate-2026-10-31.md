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
6. Request regular Lu host exit. Launch a new instance of the **same installed executable**, without loading a model, restore the saved thread and verify identical assistant ID/content hash and rendered marker with no duplicate regeneration. Recheck journal. Close again and uninstall.

A `PASS` marker requires **every** stage. A successful headless Rust tool test, a standalone UI test, a failed GUI probe, a missing CDP target, or a forced shutdown alone cannot pass this acceptance.

## Local engineering verification

All harness source was authored locally in the ChatGPT Linux execution environment. `node --test scripts/lu/verify-installed-lu-gui-tool.test.mjs scripts/lu/verify-installed-lu-uia-evidence.test.mjs` passes **8/8** checks, including real-tool journal shape, exact conversation scope, saved JSONL proof, test-only input boundaries, and a fully written synthetic SQLite evidence ledger. Node syntax checks and workflow YAML parsing pass.

New entrypoint `scripts/lu/run-installed-lu-uia-full.ps1` drives the actual OS GUI and asks the model itself to call `lu_files_read_text`; `scripts/lu/verify-installed-lu-uia-evidence.mjs` independently verifies SQLite and JSONL. The tested preflight code is `scripts/lu/probe-installed-lu-uia.ps1`. A Linux container cannot run Windows UI Automation, so full execution remains unaccepted until a genuine Windows run proves it.

## Release status

**NOT YET ACCEPTED until native Windows run confirms all stages.** The CI workflow is a verification vehicle, not Lu's development hub. When it finishes, preserve exact run/job conclusions; if the installed Windows UIA model/tool flow fails, classify its exact stage and preserve false/unknown acceptance status rather than substituting a debug binary.

The existing LCX core chat route, inherited Jan plugin dependency tree, Windows 10/physical AMD validation, worker containment, and Guardian promotion must still be tracked separately. This test does not automatically promote a stable or alpha release.
