# W-NSIS-N0 — native-only package lifecycle and negative legacy inventory

Date: 2026-10-31.

This branch carries forward the independently tested installer, startup, profile and verdict scripts from the compatibility verification (Windows run [41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298)). It adds a native-only **negative inventory** mode to the already-used smoke:

- `-RequireNoLegacyPayload` requires absolutely zero installed `jan-llama-worker.exe`, Bun or UV executables across all subdirectories, including architecture-suffixed forms.
- `engineVariant=cpu` on native-only NSIS provenance; only pinned Lu `llama-server.exe` is packaged. Vulkan acceleration is *not* claimed.
- Windows startup rejects spawned Jan workers and uses independent Lu-app logs, Jan sentinel preservation and uptime; no eager model child is assumed.
- Three-process A/B/A checks require app logs, conversation/profile persistence and Jan isolation; **MCP configuration is optional for native Lu**, and if it exists its server list must be empty.
- The native-only uninstaller must remove both `Lu-Desktop.exe` and the installed native inference-engine executable.
- The original compatibility smoke retains its own strict positive legacy worker checks when called without `-RequireNoLegacyPayload`; source check change must never falsify the earlier compatibility evidence.
- The verdict remains `alphaAccepted=false` even with zero legacy binaries. Only the Guardian and full installed GUI native-tool, security and recovery gates may eventually authorize release.

This is **staged and not installed-tested**. Before invoking Windows NSIS, check PowerShell syntax on a disposable Windows runner. After build, use the real release artifact and pinned GGUF to validate install, native bootstrap, A/B/A, native Protobuf tool/continuation, uninstall and zero legacy binaries.
