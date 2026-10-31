# Lu Windows W-NSIS-04 — installed native model → Protobuf tool gate

Date: 2026-10-31. This result supplements [installed lifecycle report](./windows-nsis-installed-lifecycle-2026-10-31.md), not a new full installer build.

## Exact acceptance source and evidence

- Pinned *installed* Windows NSIS artifact: [build 41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821), commit `513969a77e1205cedb3b6ae7bb5d389acda94b60`, artifact ID `13053778288`, installer SHA-256 `3c33c4959b43ac892bd9469c2667db05898049d797e9353384bd741be0842fb0`.
- Fresh Windows job: [41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298), `real-model-protobuf-tool`, corrected test harness source `aeb00193f40d219c59c93cb74db0de7e7d4c65fe`.
- The `Download SAME pinned NSIS artifact`, `Download SHA-256 pinned real GGUF`, `Verify actual installed engine real GGUF to Lu Protobuf tool and continuation`, and evidence-artifact upload steps all returned **SUCCESS**.
- The real model is the official pinned Qwen2.5 0.5B Instruct Q4 GGUF with digest `74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db`.
- The test requires a real `llama-server.exe` from the newly installed `lu-inference/` directory, hash verification, genuine generation of the JSON tool call, scoped host authorization, Lu-native Protobuf file-tool dispatch and final model continuation. The Rust integration test uses no canned model output.
- Evidence receipt artifact: `Lu-Installed-NSIS-Real-Model-Native-Tool-Receipt` (GitHub artifact ID `13053883558`).
- Separate installed package/profile/uninstall job in the same run **COMPLETED SUCCESSFULLY**. It does not load the GGUF and has independent verdict `nativeModelTool=NOT_RUN`.

## What this is *not*

- **Not installed GUI end-to-end tool integration**: the native-model test executes the `lu-core` Rust integration harness, using the installed Lu engine rather than invoking the installed WebView desktop model→tool path. Shipping GUI native-tool invocation and visual evidence remain separate acceptance work.
- **Not a Cowork-independent package**: inherited `jan-llama-worker.exe`, Bun and UV are still present in this *compatibility-preview* bundle; `coworkIndependence=blocked_legacy_worker`, `alphaAccepted=false`.
- **Not Windows 10 or AMD Vulkan proof**: the CI runner uses its own Windows environment, and the independently packaged Lu CPU engine is the acceptance executable.
- **Not an automatic release declaration**. Windows alpha remains blocked on native-only distribution, installed GUI tool plumbing and any remaining fault-isolation/cancellation requirements.

The real-model job's substantive test steps passed; distinguish these from the overall workflow conclusion if its post-run cleanup has not yet finished. Source-evidence summaries are subordinate to the pinned artifact and original job logs. Keep GitHub optional for development and rollback.
