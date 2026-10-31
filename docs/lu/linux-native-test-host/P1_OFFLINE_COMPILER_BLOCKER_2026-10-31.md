# Isolated Lu-Linux Native Test Host — P1 offline compile investigation

**2026-10-31** | Development branch `lu/linux-native-test-host` only. GitHub is the repository record, **not** the development machine. Ordinary Lu main, installer, user profiles and Windows alpha are unchanged.

## Reconstructed build environment

The Lu source snapshot at commit `68eab79e2799c02cec8949993cebd64215f00559` was recovered from the user Library's `Lu-Linux-Offline-Inputs.zip` archive (3,490 repository entries). Eight L16 Preview7 source overlays matched their SHA-256 manifest; the original four-file P0 native test-host overlay then passed its exact preimage checks and was applied to an isolated source copy.

Recovered Rust 1.98.0, Cargo 1.98.0, 989 vendored offline crates, pinned `fix-path-env`, 438 Debian 13 GUI dependency .debs, and a private sysroot with GLib, GTK3, WebKitGTK, JavaScriptCoreGTK, libsoup and app-indicator pkg-config files. Cargo full dependency metadata resolves offline. `lu_native_test_host.rs` passes `rustfmt --check`. Original native socket client/security tests: **13/13 passed** against test fixtures (not a live Tauri server).

## Type-check result and precise blocker

A GUI-feature-enabled `cargo check --offline --features lu-native-test-host --lib` reached Lu native code after the system-library build. For source-only checking, the disposable source copy used an explicitly **type-check-only** Tauri config excluding separately packaged runtime binaries; icons were generated from existing Lu art. That config does NOT validate release packaging.

**Current result: FAIL; two Rust source errors:**

- `E0432` — `src/core/lu_inference.rs:9`: unresolved `lu_core::persistent_llama_backend::LinuxModelProtectionPolicy`.
- `E0599` — `src/core/lu_inference.rs:451`: `PersistentLlamaBackend::set_linux_model_policy` does not exist.

The L16 inference adapter calls those APIs for its trusted Linux model-file protection. The APIs are not in the pinned source or the examined Linux GitHub development branch. **Do not remove the call or create a permissive no-op implementation.** Recover or implement/test the real policy, including the no-mutable-GGUF-fallback security guarantee, then rerun the type check.

Prior build interruptions in this isolated experiment were packaging prerequisites: missing vendored protoc execute bit, GLib sysroot, missing `resources/bin/uv` and `resources/bin/jan-llama-worker`, and generated icon assets. They were resolved for **type checking only**; the real worker runtime/resource bundle was not validated.

## Authentication and integration remain unverified

The source overlay alone does not prove a usable native server. No Lu test-host socket started; no model was loaded; no authenticated USER turn, Lu native tool, or Cognitum Protobuf execution round trip was observed. Cognitum's kernel cgroup2 remains read-only in this environment; no actual `cgroup.kill` escaped-descendant acceptance test has passed.

**Next steps:** recover/test Linux model protection, complete source-only Cargo build, package/build actual llama worker and assets, start disposable Lu native test host, prove authenticated model-to-tool-to-feedback turn, then run isolated Cognitum integration. Never claim Lu or Cognitum alpha/security acceptance from Python mock socket tests alone.

Cognitum's independent P46R8 recovery CLI security fixes and 120 passing focused tests were committed as Cognitum PR #47. Those are separate from the incomplete Lu compilation.
