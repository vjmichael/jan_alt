# Lu L2 — Standalone Linux Rust Core, Without GitHub Actions

**Status: source-prepared, Rust compilation still blocked in this container.** Branch `linux/lu-native-dev-20261030`. Keep the user's existing Windows work and protected `main` unchanged.

## Verified context on October 30, 2026

- The repository's `rust-toolchain.toml` specifies **Rust 1.98.0** with `rustfmt` and `clippy`. The portable `src-tauri/lu-core/Cargo.toml` requires at least Rust 1.88, but use the pinned 1.98.0 for reproducible development.
- This isolated Debian 13 container has Node.js 22, GCC and CMake, but **no Rust/Cargo**, no local Rust crate cache and no network/DNS access to install them. It also lacks several WebKitGTK/GTK development libraries, which are relevant only for later Tauri GUI work.
- The tracked desktop `src-tauri/Cargo.lock` contains a resolvable closure for `lu-core` of **168 packages**. A structural traversal of the committed lock identified zero unresolved dependency references and zero missing registry checksums. This is source analysis, **not** Cargo resolver/compilation acceptance.

## New standalone Lu dependency gate

`node scripts/prepare-lu-core-lock.mjs --check` reads the committed parent `src-tauri/Cargo.lock` and `src-tauri/lu-core/Cargo.toml`, validates the full transitive closure, direct dependencies, and SHA-256 registry checksums. It writes nothing by default.

`node scripts/prepare-lu-core-lock.mjs --write` creates an **ignored, local** `src-tauri/lu-core/Cargo.lock` with `wx` (never overwrites). This closure excludes unrelated Jan dependency packages. If the checked-in parent lock or core manifest changes, the check rejects a stale local generated lock until it has been reviewed and intentionally replaced.

The offline local test runner now uses `cargo test --locked --offline` and `cargo clippy --locked --offline` after staging that lock. If Cargo says the generated lock must change, this is a **failed L2 gate**, not permission to run a network resolver or silently drop `--locked`. Check the dependency/feature graph and update the design before retesting.

## To run L2 on a machine with the dependencies already available

Use a disposable checkout of this exact branch. Required for the Rust core (no Tauri GUI): x86-64 Linux with the **Rust 1.98.0 toolchain including Cargo, rustfmt, clippy and the Linux host standard library**, plus a populated Cargo registry cache or an approved vendored crate directory for the 168 pinned packages (including source archive checksums), and a C/C++ compiler for `rusqlite` bundled SQLite / build scripts.

```bash
node --test scripts/tests/*.test.mjs
node scripts/prepare-lu-core-lock.mjs --check
bash scripts/test-lu-linux-offline.sh --quick
bash scripts/test-lu-linux-offline.sh --full
```

The scripts intentionally disable Cargo networking and rustup automatic installation. They put build products and test-only profile/temp data under an ignored `src-tauri/lu-core/target/lu-linux-offline` root. There is no use of GitHub Actions and no reliance on user Lu/Jan AppData.

For a fully air-gapped bundle, supply a **verified 1.98.0 x86_64-unknown-linux-gnu Rust/Cargo toolchain**, its `rustfmt` and `clippy` components, and the Cargo registry source/cache matching the pinned lock. Packaging them in an archive does not make the binaries trustworthy: verify their signed or SHA-256 provenance before using them. A single compiler archive without the pinned registry sources does not unblock `cargo --offline`.

## New local evidence

- Existing ELF, manifest, pinned source/build and preflight tests: 15 passed.
- Five new Node tests for standalone core lock closure, direct dependency drift, checksum enforcement, missing transitive dependency and Cargo v4 format: 5 passed.
- **Total: 20/20 local Node tests, 0 failures**. No Rust code was compiled.
- Linux host code now rejects `..` inside shared-library names, matching the JavaScript staging allowlist. A Rust unit test for this case was committed, but awaits a Rust toolchain.

## Gate criteria

- **L2-A: dependency lock generation** — source closure validated, local fixtures passed; actual locked Cargo resolution **pending**.
- **L2-B: lu-core format, unit/integration tests and strict Clippy** — **blocked** in this container; must produce real Cargo output for exact source revision.
- **L2-C: native tool loop and persistent llama.cpp adapter** — Rust synthetic path **pending**; real GGUF tests require separate pinned native model and engine.
- **L3–L5**: real Linux GGUF/UI/deb packaging still pending.
- Windows W01, W02–W06, AX/DX/A acceptance remains separate. Linux preflight or unit tests are not Windows Alpha acceptance.

**Operational policy:** GitHub stores milestone commits; local Linux handles routine builds and tests. Never activate additional GitHub Actions runs to fill this environment gap.
