# Lu Windows W-NSIS-03 — actual installed lifecycle acceptance (2026-10-31)

**Evidence:** Windows Actions [run 41232017298](https://github.com/vjmichael/jan_alt/actions/runs/41232017298), `installed-nsis` job concluded **SUCCESS**, exact source of installed package `513969a77e1205cedb3b6ae7bb5d389acda94b60`; corrected test scripts `aeb00193f40d219c59c93cb74db0de7e7d4c65fe`.
**Build:** [run 41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821) concluded FAILURE because it still demanded one eager Jan worker during startup, not because NSIS compilation failed. Full installer build, NSIS provenance/hash verification, cross-commit W06 replacement, license/Jan-data checks and pinned Qwen model download passed.
**Installer artifact:** ID `13053778288`, installed NSIS SHA-256 `3c33c4959b43ac892bd9469c2667db05898049d797e9353384bd741be0842fb0`.

## Independently verified installed lifecycle PASS

- Downloaded exactly that previously built NSIS artifact; checked build manifest, SHA-256 and installed Windows AMD64 PE executable.
- Silent install in an isolated disposable Windows test runner and validation of Apache-2.0/Jan-origin notice hashes.
- Installed `Lu-Desktop.exe` remained alive for 12 seconds, produced app-owned diagnostic logs, and did not overwrite Jan data/protocol-handler sentinels.
- Native lazy startup explicitly rejected inherited Jan worker processes: `LU_INSTALLED_NATIVE_LAZY_BOOT_PASS owned_legacy_workers=0 model_test=separate`. No duplicate legacy worker was required for healthy GUI startup.
- Three installed process launches (profile A, profile B, profile A restart) preserved A's own checkpoint, did not write across profile boundaries and left Jan sentinels unchanged: `LU_W05_INSTALLED_PROFILE_RESTART_PASS runs=3 roots=2 preserved=true cross_profile_writes=0 jan_sentinel=true`.
- Silent NSIS uninstall passed. The bounded receipt reads `LU_INSTALLED_SMOKE_VERDICT package=PASS realTool=NOT_RUN profile=PASS alphaAccepted=false`.
- The separate Windows PowerShell/contract verifier [41231950476](https://github.com/vjmichael/jan_alt/actions/runs/41231950476) passed source syntax and receipt validation.

## Limits and remaining blockers

1. **The installed real GGUF model-generated native Protobuf tool gate has not been declared PASS by this job.** It is deliberately a separate `real-model-protobuf-tool` job in the same run, with its own report.
2. The compatibility NSIS still **bundles** `bin\\jan-llama-worker.exe`, `bun.exe` and `uv.exe` even though no Jan worker ran during normal startup. The bundle self-inventory correctly reports `coworkIndependence=blocked_legacy_worker` and `alphaAccepted=false`.
3. The Windows runner logs Vulkan adapter discovery unavailable; this does not demonstrate AMD GPU acceleration or Windows 10 support. Lu's independent CPU model evidence is separate.
4. The installed lifecycle smoke is not a real assistant chat/GUI rendering/WebDriver proof. DX-15E established real GGUF chat persistence/cold restart on a **test-only** host, not this installed NSIS binary.
5. The test runner uses the current Windows Actions environment. Windows 10 x86-64 needs explicit compatible-host acceptance.

Do not replace the already verified DX-15E native-chat baseline or claim Lu alpha until the installed **model-directed native tools**, recovery/cancellation and **Cowork-free package extraction** all pass. GitHub remains repository and acceptance archive, not the development hub.
