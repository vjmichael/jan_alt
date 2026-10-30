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
