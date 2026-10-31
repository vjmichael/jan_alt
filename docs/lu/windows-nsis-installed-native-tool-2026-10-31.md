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

## Final independently checked Windows log markers

The complete Windows workflow [41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298) concluded **SUCCESS**, with both `installed-nsis` and `real-model-protobuf-tool` jobs completed successfully. The second job's decoded Windows log contains these *actual output lines* (not merely workflow script text):

```text
LU_REAL_GGUF_HASH_VERIFIED
LU_INSTALLED_NATIVE_INFERENCE_PACKAGE_PASS components=1
LU_INSTALLED_ALPHA_BOUNDARY status=blocked_legacy_worker alphaAccepted=false
LU_REAL_GGUF_NATIVE_TOOL_JSON_PASS generations=2 tools=1 worker_recovered=true
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 16.11s
LU_INSTALLED_NATIVE_GGUF_TOOL_TURN_PASS
LU_INSTALLED_SMOKE_VERDICT package=PASS realTool=PASS profile=NOT_RUN alphaAccepted=false
LU_NSIS_REAL_MODEL_NATIVE_TOOL_GATE_PASS alphaAccepted=false
```

The separate `installed-nsis` job independently produced `LU_W05_INSTALLED_PROFILE_RESTART_PASS runs=3 roots=2 preserved=true cross_profile_writes=0 jan_sentinel=true` and `LU_INSTALLED_SMOKE_VERDICT package=PASS realTool=NOT_RUN profile=PASS alphaAccepted=false`. Both results are retained separately, avoiding combined-gate ambiguity. No user prompts, secrets, or raw model outputs are necessary for this source provenance note.
