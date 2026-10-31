# Lu native-only Windows packaging: platform override defect and fix

2026-10-31. Source-only disposable Windows packaging branch; not promoted to stable Lu.

**Actual observed build failure:** Windows native-only NSIS [run 41234053997](https://github.com/vjmichael/jan_alt/actions/runs/41234053997), compiler step. `tauri_build::build` rejected `resources\\bin\\bun-x86_64-pc-windows-msvc.exe` because the native-only package correctly omitted Bun. The build inherited `tauri.windows.conf.json` **after** Lu's own `tauri.lu.conf.json` and reintroduced Jan's `externalBin` Bun/UV and `resources/bin/jan-llama-worker.exe` mapping. It also risked overwriting Lu's main window title with Jan.

The fix **does not restore Bun, UV or Jan's worker**. Instead `scripts/lu/prepare-native-only-windows-overlay.mjs` transforms the checked-out Windows platform config only in an explicitly authorized disposable build directory, validating the Jan source file identity first, backing up the original outside the source tree, and writing a narrowly scoped platform overlay with:
- exact Lu-native `resources/lu-inference/` engine and preserved Apache/Jan attribution;
- no `resources/bin/` and `externalBin=[]`;
- Windows `nsis` target only;
- preserved Windows 10 WebView2 `downloadBootstrapper` fallback;
- no `app.windows` override, allowing Lu's own title from the Lu config to win.

The source file in Git remains the unmodified Jan platform config for compatibility builds. Mutation tests require the original file unchanged, zero legacy resources, correct Lu target, and failure on unknown Jan format. A cheap Windows preflight tests both pure config generation and the exact disposable file rewrite. Passing it does **not** imply actual NSIS or installed GUI success.

Only after the Windows preflight passes should the native-only Windows NSIS workflow invoke the disposable overlay preparation immediately before `yarn tauri build`. A subsequent installed acceptance must prove zero legacy executables and genuine pinned-GGUF native tool round trip, then a **separate old-to-native upgrade** gate must prove stale legacy executables are removed from prior installations.
