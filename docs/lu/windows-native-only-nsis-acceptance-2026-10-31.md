# Lu Win x86-64 native-only NSIS build acceptance candidate

2026-10-31. **STATUS: Source prepared for Windows native-only build, not alpha-accepted.**

Native-only Windows workflow `.github/workflows/lu-windows-native-only-installer.yml` is based on the earlier actually compiled NSIS [run 41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821), with the independent installed lifecycle and native-GGUF Protobuf proof from [run 41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298).

The new package **does not** execute `yarn download:bin`, `make build-engine`, a Vulkan build for Jan's worker, or a Jan worker resource packaging check. It builds **only the independently checksum-pinned Lu `llama-server.exe` engine**, the Lu Tauri desktop and existing UI dependencies needed for native chat. The resource manifest excludes `resources/bin/` entirely. The bundle metadata explicitly identifies `distributionMode=native-only`, `engineVariant=cpu`, and `legacyRuntimeBundled=false`.

Pre-compilation checks enforce native-only source/permission and Rust/JS contract tests. Post-build checks pin the NSIS/engine SHA-256; installation checks reject Jan worker/Bun/UV in the *actual installed tree*, verify Lu executable and engine identity, preserve Jan profiles, run A/B/A profile restart, execute the pinned **real Qwen2.5 0.5B GGUF → authorized Lu Protobuf tool → model continuation** path, and uninstall the application and engine. An isolated legacy-free payload absence proof does not certify the *shipping GUI* model-to-tool path or Windows 10 compatibility.

A failed tool/gate must not be interpreted as alpha acceptance; the workflow uploads the installer artifact when possible even on failure. The known-good DX-15E and earlier compatibility NSIS artifacts are untouched. This branch is for experimentation, not automatic promotion to Lu Main. GitHub is a repository and evidence archive, not the development hub.

## Early native-only workflow rejection and correction

[Run 41233902423](https://github.com/vjmichael/jan_alt/actions/runs/41233902423) stopped at the Windows PowerShell syntax gate **before any NSIS compile**. The installer smoke had been truncated at a regular-expression `$'` sequence by a JavaScript string replacement, which inserted a duplicate suffix. The preceding Node native-only bootstrap and provenance contract checks passed. Corrected the regex line, discarded duplicate suffix after the first complete final verdict, and added an explicit duplicate-sentinel check to the workflow. The exact Windows PowerShell parser and real NSIS install are still required before claiming the native-only build passed.
