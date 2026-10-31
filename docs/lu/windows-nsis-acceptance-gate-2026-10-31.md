# Lu Windows x86-64 NSIS — major installed-distribution acceptance gate

Date: 2026-10-31
Pinned input: e1b1a860e65ecf8089f244dc419859dccd4eabf0, merging the passed DX-15E chat baseline with Windows-tested runtime redirection and SQLite WAL/SHM guards.

## Planned live installer verification

Run the existing pinned Vulkan NSIS workflow only once on the preview branch, using an isolated Windows runner. Preserve immutable installer SHA-256 provenance, perform actual silent install/replace/uninstall, check licensing and Jan profile/registry isolation, verify the Lu-owned engine package and host startup, attempt the **real model-generated Lu Protobuf tool turn**, and exercise multi-profile restarts.

The selected real model for the existing smoke is Qwen2.5-0.5B-Instruct Q4. Such a small GGUF may not reliably generate a valid tool JSON request; any failure remains an **unpassed native tool gate**, not grounds to synthesize a tool call.

## Independence reporting

This preview still bundles `jan-llama-worker.exe`, Bun and UV under the inherited Jan bootstrap compatibility path; the startup smoke even requires the directly owned legacy worker and checks an empty MCP config. That startup test is **not** Cowork independence. Its successful result must never satisfy the Lu alpha requirement for Cowork/Jan extraction.

The installed smoke now writes a bounded, content-free `lu-alpha-boundary-audit.json` identifying bundled legacy worker/runtime presence with `alphaAccepted:false`, and uploads it alongside the real NSIS artifact. A future worker-free payload still needs source/capability extraction and native restart/tool acceptance before changing the alpha verdict.

## Acceptance evidence boundaries

Prior real GGUF native chat, persistence, shutdown and cold-restart PASS: https://github.com/vjmichael/jan_alt/actions/runs/41224161266 on d0593a2.
Windows-native junction guard PASS: https://github.com/vjmichael/jan_alt/actions/runs/41225920359 on 4b912e7.
Neither replaces the installed NSIS run. Installer run ID and status are to be recorded after GitHub reports the result. GitHub remains source repository/milestone verification, not the development workspace.
