# Lu Linux L3 — native llama.cpp CPU engine evidence (2026-10-30)

**Disposition:** L3 native Linux x86-64 CPU engine compilation, staging, and **synthetic GGUF inference-path smoke PASS**. Trained-model, Lu desktop tool-continuation, managed cancellation, and installer acceptance are **NOT** established.

## Provenance and boundaries

- Lu development branch: `linux/lu-native-dev-20261030`; verification branch: `verify/lu-linux-core-20261030`. No `main` update.
- Upstream llama.cpp Git commit: `7fe450e19305b828c199d602c23a8337aaa1f03b`, verified by `git rev-parse HEAD` and clean tracked sources.
- The previously failed pinned-source GitHub handoff was repaired by avoiding `tar -tzf | grep -m1` with `pipefail` (SIGPIPE). Fixed workflow run [41103878335](https://github.com/vjmichael/jan_alt/actions/runs/41103878335) succeeded, yielding the 75,507,198-byte source tar.
- Actual compilation took place in the **local Linux container**, not GitHub Actions. CMake generated a Release x86-64 GNU 14.2.0 CPU backend; CUDA, Vulkan, architecture-native tuning, tests/examples, CURL and downloadable UI assets were disabled.
- Builder now explicitly uses `LLAMA_BUILD_UI=OFF` and `LLAMA_USE_PREBUILT_UI=OFF`; this prevents optional Hugging Face UI asset fetch attempts even with `LLAMA_CURL=OFF`.
- The Rust 1.98.0 toolchain and earlier 42 missing pinned Cargo crates were also restored into the new isolated workspace; L2 Rust-core acceptance is independently recorded in `linux-l2-core-local-verified-2026-10-30.md`.

## Verified local execution

| Gate | Result |
| --- | --- |
| Pinned llama.cpp source checkout identity/clean tree | PASS |
| `cmake --build … --target llama-server --parallel 3` | **PASS**, build exit 0 |
| `llama-server --version` from staged package with isolated `LD_LIBRARY_PATH` | **PASS** — `0.5.0-dev (build 1, commit 7fe450e)` |
| Native Lu engine staging / ELF and package tests from recovered source | **12 passed, 0 failed** |
| Stage all x86-64 ELF components with SHA-256 | **20/20 verified**, engine package staged |
| Synthetic, untrained, one-layer GGUF accepted by genuine engine | PASS (`/health` 200) |
| Synthetic completion endpoint | PASS (`/completion` 200, 15 prompt tokens evaluated and 8 generated) |
| Authentication and restart smoke | **2/2** processes: unauthorized completions HTTP 401, authenticated completions HTTP 200 with 4 generated tokens, clean shutdown, closed endpoint and clean restart |
| Truncated/corrupt GGUF model admission | **FAIL-CLOSED PASS** (nonzero process exit 1) |

The synthetic GGUF is **not a trained model**. Its text is random/gibberish and cannot support a useful-model or quality claim.

## Immutable local outputs

- `llama-server` SHA-256: `88b982ecde925e91a1bee4fd2cf0a8185f03a7b7f5b9db622a671ba550fa3972`.
- `lu-inference/manifest.json` SHA-256: `ec135ab3f66f53f26cee30197751cc7a6a4f5d3e3fbc9592519ec0cbdefd870b`.
- Stage includes 20 names (real ELF copies of native `.so` and versioned aliases); each verified against the manifest. The engineering archive also includes the upstream llama.cpp MIT license and scope notes.
- Package tarball SHA-256: `7eb1866abc051e7b1a72798dfc0450dd50635bfe734eb073e0c2a28d81976983`.
- Local output: `Lu_Linux_L3_CPU_Engine_2026-10-30.tar.gz` (engineering package, **not** installer or signed release).
- An initial no-key direct test generated an upstream warning about permissive CORS; subsequent lifecycle tests used host-generated API credentials via `LLAMA_API_KEY` and explicitly verified HTTP 401 for unauthenticated completion. A Lu supervisor integration is required before production security claims.

## Remaining L3 / L4 / L5 gates

1. Load a real, trained, user-approved GGUF model, test useful completion with deterministic prompt and independent latency/resource reporting; distinguish CPU engine success from model-quality inference.
2. Connect the packaged pinned Linux engine through Lu's authenticated supervisor/runtime contracts and verify **model-generated** tool request, policy/approval, native Protobuf tool invocation, result continuation, durability, cancellation/restart and recovery. Synthetic toy inference is insufficient for this acceptance.
3. Verify Linux dynamic library portability on supported target distributions, especially glibc and OpenSSL versions.
4. Resolve GTK3, WebKitGTK 4.1, JavaScriptCoreGTK 4.1, libsoup3, AppIndicator, librsvg and Yarn/Tauri prerequisites; build and launch desktop `.deb` (L4/L5).
5. Preserve Windows installer/Alpha separately. Do not merge this isolated Linux experimental branch or claim a Windows release.

**Architecture discipline:** Local Linux is the primary development/test environment here; GitHub is storage and verification only.


## Additional Lu-owned integration and recovery evidence (later same day)

The exact same packaged CPU `llama-server` was exercised through **Lu's Rust API** (not just a direct HTTP client), with a host-provided 64-character hexadecimal API key, executable SHA pin and synthetic/untrained GGUF.

- `cargo build --offline --locked --example persistent_llama_smoke`: PASS. **`LU_PERSISTENT_GGUF_TWO_TURNS_PASS`**, two text generations on the same owned PID, then unload.
- `cargo build --offline --locked --example inference_supervisor_smoke`: PASS. **`LU_P3_SUPERVISOR_GGUF_PASS`**, two reserved generations with decoded native Protobuf state, text and terminal events, same PID and unload.
- New separate Linux-only example `linux_persistent_llama_resilience_smoke.rs`: PASS. The example refuses to run without `LU_LINUX_TEST_ALLOW_KILL=yes`; with explicit opt-in it validates **in-flight cancellation after first output**, clean unload, a deliberate kill of the **exact test-owned PID**, failure detection and explicit load/generation recovery. The Windows CI-only source example remains untouched.
- A clean offline Rust build from locally restored 167 SHA256-pinned crate sources was reconstructed with compiler 1.98.0; Cargo's standalone lock resolved **130 total packages**, zero versions/checksums outside tracked parent pins. A local crate importer initially stripped executable permissions from vendored `protoc`; permissions were restored from the original verified crate archive before acceptance. This was an importer-fixture issue, not a Lu code compile bug.
- `cargo test --offline --locked --all-targets`: **280 passed, 0 failed, 1 intentionally ignored** (64 result groups).
- `cargo clippy --offline --locked --all-targets -- -D warnings`: **PASS**.
- Recovered source-snapshot Node regression: **31 passed, 0 failed**; later primary-branch Node lock tests were not included in that earlier source archive.
- The engine archive was extracted into a new temporary directory and successfully launched from package-local libraries; all **20/20** SHA-256 component checks passed again.

The two runtime examples are **synthetic inference-path tests**, not evidence of useful output from a trained GGUF. The native model-generated tool request → native policy/Protobuf tool → continuation acceptance remains outstanding. Terminating a test-owned llama process is not evidence of every Lu managed-worker cancellation path.

## L4 desktop preflight

A fresh `check-lu-linux-env.mjs` reported `desktopReady=false`. The current isolated Linux environment is missing **Yarn**, plus pkg-config dependencies `webkit2gtk-4.1`, `javascriptcoregtk-4.1`, `gtk+-3.0`, `libsoup-3.0`, `ayatana-appindicator3-0.1`, and `librsvg-2.0`; OpenSSL was present. The source-only WebKitGTK archive does not automatically satisfy native system packages or transitive development dependencies.

**Next step:** supply Linux GUI prerequisites and a complete Tauri/frontend source checkout; then compile and run an actual Lu Linux desktop/`.deb` under L4/L5. Do not confuse preflight capability booleans with GUI build acceptance.
