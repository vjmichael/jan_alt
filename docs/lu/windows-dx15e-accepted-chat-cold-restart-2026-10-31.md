# Windows DX-15E — real GGUF cold restart acceptance PASSED

**Date:** 2026-10-31
**Pinned tested source:** `d0593a2728a61c949f3ae64dcd630a53748e2025`
**Windows Actions:** https://github.com/vjmichael/jan_alt/actions/runs/41224161266
**Outcome:** completed / success (all jobs and cleanup succeeded)

## Substantive acceptance evidence

1. Lu Windows x86-64 test-only WebView2 desktop frontend compiled and the Tauri native host test build succeeded.
2. Pinned CPU `llama-server` was built, checksum-sealed, and loaded with a pinned real `qwen2.5-0.5b-instruct-q4_k_m.gguf` model in a disposable Windows runner profile.
3. **Process X** loaded the real model, invoked desktop exit and independently verified both Lu host and Lu-owned child engine had terminated.
4. **Process A** created a Lu-native conversation from the real GGUF, generated a nonempty assistant reply, persisted that reply, and confirmed a fresh message-service readback plus actual React commit callback. It independently shut down the Windows Lu host and WebDriver.
5. **Process B** started a separate fresh Windows Lu host and read back the identical assistant message from persisted JSONL without model regeneration.
6. The two-process readback proof, optional diagnostics retention, and all post-run cleanup steps passed.

The tested source fixes two previous observability faults: legacy linear native-chat turns had no explicit `parentId` for the assistant delivery evidence ticket; and Rust `serde_json` can reorder JSON object keys while retaining identical content. These are evidence corrections, not relaxations of conversation authorization or tool-output parsing.

## Scope limits (not yet an accepted Windows alpha)

- This is a **test-only WebView2 host and a real GGUF native chat**, not a proof that the shipping NSIS installer installs and launches correctly.
- This verifies one real reply, host-owned engine exit and disk restoration; it does **not** establish the complete model-generated native-tool loop, GPU/Vulkan efficiency, or multi-profile installation.
- The tiny Qwen GGUF does not establish Qwen 3.8 / 35B-GGUF performance or tool reliability.
- The staged runtime junction/SQLite sidecar security tests passed independently on Windows run 41225920359, but that security patch was not part of tested DX-15E source `d0593a2728a61c949f3ae64dcd630a53748e2025`.
- Lu's Cowork/Jan extraction must still be assessed on the installed distribution.

**Next Windows alpha gates:** NSIS installed launch and uninstall, model-directed native tool execution and recovery, then combine the runtime path-security staging patch without losing this pinned reference. Keep GitHub as the source repository and acceptance evidence archive, not the development host.
