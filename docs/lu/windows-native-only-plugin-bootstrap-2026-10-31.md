# AX-native: skip inherited Jan plugins in Lu distribution at startup

Date: 2026-10-31. Input: 88f04916607c8d92c6eccc1727b1f2a49fc315ee (restricted Lu main WebView authority, no inherited agent-tools IPC registration).

## Proposed runtime removal

When `lu-distribution` is built, the desktop builder does not initialize the old `tauri_plugin_llamacpp` router or the inherited `tauri_plugin_agent_tools` plugin. Lu's `LuInferenceDesktopState` and conversation-authorized Protobuf native tool dispatcher are initialized separately in `core::lu_inference` and `core::lu`; those paths remain unchanged. The ordinary Jan build still initializes both legacy plugins in exactly their original relative order.

**Not yet a passing alpha**: The existing NSIS compatibility workflow still explicitly expects the old `jan-llama-worker.exe` process and bundles `resources/bin/` (including Bun/UV). This staged source change is therefore intentionally not on the currently tested installer branch. A new native-only installer configuration, startup smoke and real-model tool gates are required before integration.

## Mandatory verification before merging

1. Windows x86-64 Tauri compilation with `lu-distribution` (to confirm plugin capability resolution).
2. Test-only WebView2 host GUI starts, loads a real GGUF, generates and persists a reply, then shuts down and cold-restarts using the Lu-owned engine.
3. Prove unauthorized inherited plugin commands fail; Lu-native file tool authorization still succeeds through independent host IPC.
4. Build a native-only NSIS variant that excludes Jan worker/Bun/UV and still passes install/uninstall, licensing and profile-isolation tests.
5. Confirm the non-Lu Jan desktop build still works.

This change removes *initialization*, not every compiled Jan library or file. Do not interpret it as complete Cowork-independent alpha acceptance.
