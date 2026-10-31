# Native-only Lu system-monitor capability split — 2026-10-31

**Development source only; Windows NSIS runtime unverified.**

The native-only Lu package disables Jan's `tauri-plugin-llamacpp`, but the ordinary system-monitor capability still requests `llamacpp:allow-read-gguf-metadata`. This creates a possible Tauri capability validation error or a dangling GUI feature after plugin removal.

This branch defines a **Lu-specific** `lu-system-monitor-window` capability for the same system-monitor WebView with the inherited `llamacpp` permission removed. System-usage/hardware permissions, logs and other existing monitor permissions remain unchanged. The ordinary `system-monitor-window` capability is untouched for Jan builds. Lu's `tauri.lu.conf.json` references only its own capability.

The source guard explicitly denies reintroducing Jan's `llamacpp` authority, switching to the old monitor permission set, or broadening the monitor to the main WebView.

Before promotion, compile the native-only Tauri desktop using the Lu-specific overlay, then exercise system-monitor and native GGUF model metadata availability. The Lu-owned inference status/model catalog is the intended metadata path. Do not mistake a passing source assertion for a working installed monitor.
