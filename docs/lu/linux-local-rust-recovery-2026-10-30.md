# Lu Linux — Real Rust L2 progress (October 30, 2026)

**State:** Rust compilation verified, partial actual Lu modules compiled, 42 pinned crates and full source checkout still needed before complete Lu core. No Lu desktop/`.deb` acceptance.

## Local evidence

- Precompiled Rust 1.98.0 x86-64 Linux installed from the user-supplied, previously checksum-verified standalone distribution. Cargo, rustfmt and Clippy work.
- Uploaded `rustc-1.99.1-src.tar.xz` contains approximately **1,900 vendored crate directories**; Lu's `src-tauri/Cargo.lock` dependency closure is 167 external crate versions plus Lu itself.
- Extracted **125 exact pinned crate versions** from that source, including `.cargo-checksum.json` and source files (about 231 MB). Their package-checksum records match the pinned parent lock's sorted aggregate fingerprint `048e0a14` (FNV-1a32; reconciliation check, not a cryptographic replacement for SHA-256). Cargo successfully compiled pinned `serde 1.0.228` and `sha2 0.10.9` from that offline vendor cache and passed 2 tests.
- **Eight Lu source-derived Rust modules** compiled in an isolated dependency-free gate: CPU instructions, CPU topology, Linux GPU nodes, Linux PCI hints, platform GPU hints, compute inventory, backend selection, and backend readiness probe. Source text matches connected GitHub files after whitespace normalization for all eight; 8 tests passed, `cargo fmt --check` and strict `cargo clippy -- -D warnings` passed.
- Offline source/crate importer: five Python security/unit tests passed. A synthetic `.crate` was restored to Cargo's vendor format with source and checksum metadata; a real Cargo build/test/strict Clippy then passed against the restored fixture (1 test).
- **Actual complete `lu-core` and Linux Tauri desktop have NOT been compiled.** The container still cannot directly download GitHub source ZIP or missing Cargo crates due to disabled DNS/network. GitHub Actions remain unused.

## Required next input

The prepared `Lu-Linux-Offline-Fetcher.zip` includes `Download-Lu-Linux-Inputs.ps1`, a CSV of exactly 42 pinned crate packages and SHA256 values, and instructions. Running the helper on a network-connected Windows computer downloads:

1. The Lu source snapshot pinned to commit `68eab79e2799c02cec8949993cebd64215f00559` of `vjmichael/jan_alt`.
2. Exactly 42 missing `.crate` archives verified byte-for-byte against their SHA256 values in Lu's tracked `Cargo.lock`.

Upload `Lu-Linux-Offline-Inputs.zip` to Library → `Jan Mod - Lu` → `Delivered`. This is a development download helper, not an installer and not a requirement to compile on Windows.

The local importer at `lu-linux-dev/scripts/restore-lu-offline-inputs.py` verifies uploaded archives, rejects path traversal/symlinks/oversized and tampered inputs, adds the 42 missing packages to the existing vendor tree, and extracts the exact source snapshot. The local `run-lu-core-offline.sh` then runs pinned Cargo format/tests/Clippy without network access.

**Next gate:** compile complete `lu-core` against the recovered vendor sources; fix any actual compiler errors; then proceed to Linux llama.cpp engine and Tauri GTK/WebKit prerequisites. The existing Windows release track and `main` are not changed.