# LU-WIN-6G: integrated Windows native-only candidate

Date: 2026-10-31. Branch `lu/windows-alpha-six-gates-20261031`; based on the Windows alpha staging branch after ULID/UUID correction.

This is one isolated Windows integration candidate; not a second Lu product or stable release. It imports only the audited native-only Jan bootstrap/IPC exclusion, NSIS resource/capability changes, Windows target overlay fix, profile smoke scripts, and six/seven-entry model audit test from the prior Windows native-only branches, preserving the more recent Lu Core identity and workspace-path repairs. The Cognitum Linux dev and IPC experimental branches are untouched.

## Six gates to close, with independent verdicts

1. **Build** a new Lu-only x86-64 NSIS package from the current commit; verify immutable SHA-256 and zero bundled Jan worker, Bun and UV.
2. **Install/model** the actual NSIS binary in a disposable Windows runner; use the bundled Lu-owned engine and checksum-verified real Qwen GGUF.
3. **Installed GUI tool**: the model must generate a legitimate Lu read-only tool request via the installed application GUI, with Protobuf dispatch and model continuation.
4. **Cold restart**: a second genuine Lu desktop process must restore the identical assistant content, message identity and audit after normal exit, without regenerating.
5. **Safety/cleanup**: reject inherited app/tool authority and unsafe payloads, preserve profile boundaries, terminate owned processes and uninstall cleanly.
6. **Provenance**: record source revision, real executable/installer/engine/model digests, exact Windows version, and tool GUI vs headless scope.

## Build composition and verification

The validation harness `scripts/lu/run-installed-lu-gui-tool.ps1` accepts explicit `-ExpectedCommit` and `-ExpectedInstallerSha256` parameters; the new NSIS workflow must pass the *freshly built* values. Historical test defaults remain immutable for older preflight runs. It never accepts an unpinned or repacked test binary. The on-disk directory layout remains unchanged. `src-tauri/tauri.windows.conf.json` is rewritten **only in a disposable build checkout** using the validated Lu overlay to suppress automatic Jan worker/Bun/UV reintroduction.

This branch's source commitments are NOT evidence that an installer, model, GUI, tool or persistence actually passed. Record each result from the exact Windows run. A successful installer build is only gate 1, not the other five gates. GitHub is an optional source and independent verification archive, not the Lu development hub.
