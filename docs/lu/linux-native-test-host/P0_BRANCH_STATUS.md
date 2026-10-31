# Lu-Linux Native Test Host — isolated development branch

**Branch:** `lu/linux-native-test-host`  
**Status (2026-10-31):** P0 source overlay and authenticated Unix-socket protocol client developed locally. Full feature-enabled Tauri compile and real socket-to-model/tool round trip remain unverified.

## Engineering intent
1. Make Lu development faster in ChatGPT's Linux environment.
2. Avoid human-transfer steps and GUI mouse automation for routine testing.
3. Use the Linux development environment as the foundation for independently testing Cognitum and later Lu components.

## Source baseline
The tested Lu-Linux L16 Preview7 source overlay (real GGUF GUI chat and guided native tool turns) belongs on top of pinned source snapshot `68eab79e2799c02cec8949993cebd64215f00559`. The GitHub branch began from `lu/linux-ui-deb-candidate-20261030`, so this branch is **not yet source-synchronized to the local L16 implementation**. Do not advertise it as a runnable GitHub checkout until that synchronization is completed.

## P0 implementation scope
A separate, explicitly enabled `lu-native-test-host` feature is proposed for the real Tauri host. It offers model enumeration/loading, saved USER test turns routed through Lu's existing authenticated `lu_inference_native_turn`, cancellation, diagnostics, and structured status over an owner-only Unix socket. No TCP, MCP, or release-default network listener. The test client uses only Python's standard library.

**Current checks:** 13 Python client/security tests pass; Rust module passes rustfmt syntax/format check; 989 pinned registry archives restored locally; full cargo check timed out during dependency compilation without a conclusive compiler result. **No live server run is claimed.**

## Gates to make this branch usable
1. Synchronize pinned L16 changes into this branch without overwriting main.
2. Apply the SHA-256-guarded P0 overlay only to matching source.
3. Complete feature-enabled Rust compilation and launch in a disposable Debian 13/Xvfb profile.
4. Verify the native socket call truly executes GGUF → Lu-authorized native tool → feedback → final answer, including tool audit records.
5. Test cancellation admission races, process failures, unauthorized tokens, profile isolation, and restart behavior.
6. Only then run exploratory Cognitum experiments; scored benchmarks require authenticated ON/OFF receipts.

GitHub is milestone storage. Actual development and acceptance testing occur locally in isolated Linux workspaces. Ordinary Lu release artifacts and Windows profiles are not modified.
