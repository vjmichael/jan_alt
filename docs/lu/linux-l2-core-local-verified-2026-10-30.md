# Lu Linux — L2 Rust core locally verified (October 30, 2026)

**Disposition: L2 Rust core build and tests PASS, including the standard local offline entry point.** This is not Linux desktop/GUI/engine GGUF acceptance and is not a Windows installer result.

## Scope and provenance

- Source snapshot from GitHub verification branch `verify/lu-linux-core-20261030`, originally pinned to `51285255abb98959ab46d72eb376ccef6dd2bf18`, plus reviewed source/test/script fixes committed to `linux/lu-native-dev-20261030`.
- Trusted compiler distribution: user-supplied Linux `rust-1.98.0-x86_64-unknown-linux-gnu`, installed **locally** in an isolated development directory. `rustc`, `cargo`, `rustfmt` and `clippy` each executed.
- Parent dependency pins: repository `src-tauri/Cargo.lock`. Its `lu-core` transitive closure includes 167 external package entries, of which **125** exact versions were recovered from the supplied Rust 1.99.1 vendor source archive and **42** exact missing .crate archives were retrieved by a short-lived GitHub standard runner after SHA-256 validation against the parent lock.
- The complete 167-package local vendor store is offline. Cargo canonically prunes inactive platform/feature entries and uses **130 packages total** in the standalone Lu-core lock, without introducing any version or checksum outside the pinned parent lock.
- All complete Lu-core tests and Clippy compiled and ran in the local Linux container with `CARGO_HOME` configured to the offline vendor and `CARGO_NET_OFFLINE=true`. GitHub Actions was **not** the environment used for the locally recorded build.

## Recorded results

| Gate | Local result |
| --- | --- |
| `rustc --version` | `rustc 1.98.0 (88d9e12ae 2026-08-18)` |
| `node --test scripts/tests/*.test.mjs` | **35 passed, 0 failed** |
| `cargo test --locked --offline --all-targets` | **280 passed, 0 failed, 1 ignored** |
| `cargo fmt -- --check` | PASS |
| `cargo clippy --locked --offline --all-targets -- -D warnings` | PASS |
| `bash scripts/build-lu-linux-local.sh --core` | **PASS**, prints `LU_LINUX_CORE_PASS toolchain=1.98.0 offline=true actions=0 alpha=not_claimed` |
| Repeated `durable_dispatch` tests after fixture repair | 100 iterations, 0 failures |

### Additional debugging resolved

1. The initial narrow source artifact contained the parent Tauri manifest without the parent app source and omitted a fixture in `src-tauri/tests/fixtures/upgrade/`. That impeded local compilation independent of Lu's core logic. Source-handoff workflow was corrected to package test fixtures and omit the incomplete parent manifest.
2. Parallel `durable_dispatch` tests previously created temporary SQLite databases using process id and wall-clock nanoseconds only; an intermittent collision was reproduced. The fixture now adds an atomic process-local sequence, and was stress-tested 100 times.
3. A source-only lock extracted from Jan's lock contains 168 entries (including `lu-core`); standalone Cargo's actual feature/platform resolution reduces it to 130. Instead of dropping `--locked`, the build now canonicalizes offline once with `cargo metadata --offline`, checks all selected package names, versions and checksums against parent pins, then runs strict locked offline gates. Added adversarial lock validation tests.

## Public-runner independent verification

`Lu Linux core one-shot verification` on standard `ubuntu-24.04` runner at [run 41098410328](https://github.com/vjmichael/jan_alt/actions/runs/41098410328) independently verified **280 Rust tests passed, 0 failed, 1 ignored; 31 Node tests passed; formatting and strict Clippy passed**. The extra four Node lock tests and flaky-fixture fix are covered by the subsequent **local** run; this statement does not imply a rerun of that exact code in GitHub Actions.

GitHub's other one-shot workflows were used as **input transportation** only: one pinned Lu source ZIP and one short-lived archive of 42 SHA-256-pinned .crate packages, both copied back to the local development sandbox. GitHub is storage/verification, *not* the main development or compilation hub.

## Next gates

- **L3:** build genuine upstream llama.cpp commit `7fe450e19305b828c199d602c23a8337aaa1f03b` on Linux, then test real GGUF model admission, inference, native tool continuation, cancellation and restart.
- **L4/L5:** obtain Linux GTK3, WebKitGTK 4.1, JavaScriptCoreGTK 4.1, libsoup3, AppIndicator, librsvg and Yarn/Tauri frontend dependencies, build and run actual Linux desktop and `.deb`.
- Windows installer, DX and Alpha acceptance remain separate and unmodified.

**Claim discipline:** A passing Rust-core test suite does not establish a functioning model engine, front end, or installer.
