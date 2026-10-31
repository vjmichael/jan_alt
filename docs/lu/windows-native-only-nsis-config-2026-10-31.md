# Experimental native-only Windows NSIS config

Date: 2026-10-31. Base: 2c84053bf711b0de15d8c38c755376685ab81b5e.

Remove the `resources/bin/` mapping from the Lu-branded NSIS configuration. Retain the Lu-owned, digest-sealed `lu-inference/` engine and Apache-2.0/Jan provenance notice resources. The parent commits already quarantine legacy agent-tools IPC, remove unsafe Lu main-window legacy plugin permissions, and stop initializing the inherited Jan llama-router and agent-tools Tauri plugins in the Lu distribution. This creates a **candidate** with no legacy Jan/Bun/UV sidecars from the Lu resource map, subject to full build/inspection.

The current compatibility Windows NSIS workflow 41227420821 is **not** changed and remains an important baseline. It still deliberately builds and requires `jan-llama-worker.exe`; its startup smoke cannot certify native-only Lu.

Before using this configuration to ship an alpha, modify the future installer workflow to stop building/downloading the legacy Jan worker, Bun and UV; replace inherited worker/MCP startup probes with Lu-native host checks; compile the branded Windows Tauri app, verify the exact final NSIS inventory, install/launch, run a real GGUF model and native tools, restart and uninstall. The compile-free Node guard catches accidental legacy sidecar reintroduction but is NOT runtime acceptance. Preserve upstream notices and do not disturb the passing DX-15E reference.
