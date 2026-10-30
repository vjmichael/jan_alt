# Lu Linux build boundary — October 30, 2026

**Source-prepared, not yet a runnable Lu Linux build or Alpha.** Protected `main` and the existing Windows release track remain unchanged.

## Verified this session

- 31 local Node tests passed (no failures): real GCC ELF/shared-library launch; pinned manifest and copied-file hash verification; reject oversized sparse engine files, tampered and unlisted resources, unsafe source/build paths; Tauri Linux JSON Merge Patch handling; build-script preflight and failure paths.
- The engine stager now hashes copied native binaries in bounded chunks. The Rust desktop verifier also checks component and package size limits and streams SHA-256. **Rust changes have NOT been compiled.**
- The Linux overlay explicitly deletes the inherited Windows `resources/bin/` entry via JSON Merge Patch `null`. Merely omitting it retained the entry when layered on the existing Windows Lu config. See the new regression test.
- Added `scripts/build-lu-linux-local.sh`: `--preflight` is read-only; `--core` runs exact Rust/Cargo offline gates; `--desktop <llama.cpp-source> <build/bin>` stages the pinned engine and attempts a Tauri Debian package in a disposable checkout. This script does not run GitHub Actions or fetch dependencies. Its preflight and rejection behavior passed locally; the actual build path is pending.

## Offline build-entry correction (2026-10-30)

Direct execution in the sandbox confirmed `bash scripts/build-lu-linux-local.sh --core` stops at `LU_LINUX_BUILD_BLOCKED requires_rustc_cargo_1.98.0`; no Rust compilation occurred. Three additional Node tests checked that preflight does **not** create build directories in a clean checkout, missing desktop arguments are rejected immediately, and extra preflight arguments are rejected. The script also now filters out pre-existing `.deb` artifacts before reporting a new Linux package. The expanded **31/31** local Node regression suite passed.

A direct public HTTP/DNS test and an alternate official Rust download attempt failed in the sandbox. There is no installed Rust/Cargo toolchain, no local Cargo registry cache and no preinstalled WebKitGTK SDK. Root shell access in a container is not a source of missing compiler binaries or packages. A successful `gcc` ELF smoke test is **not** a Lu Linux build.

## Environment blocker

This Debian 13 x86-64 sandbox has Node 22, Git, GCC, CMake and dpkg-deb. It **does not contain Rust/Cargo/rustfmt/Clippy**, cached Cargo registry crates, the full local Lu source, pinned llama.cpp binaries, Yarn, or GTK/WebKitGTK desktop development libraries. Direct public downloads are blocked by network/DNS restrictions. A GitHub connector can preserve source patches but cannot supply a local compiler. Accordingly, **L2 Cargo compilation and L3–L5 runtime/GUI/deb tests have not run**. A GCC test binary is not a Lu build.

## Exact materials needed to complete locally

1. Full `linux/lu-native-dev-20261030` source at a recorded commit, including `src-tauri/Cargo.lock`, `lu-core` and its Protobuf sources.
2. The repository-pinned Linux x86-64 **Rust 1.98.0** toolchain: rustc, cargo, rust-std, rustfmt, Clippy, and their verified archive checksums.
3. Vendor or local Cargo registry sources for all **168** packages in the locked `lu-core` closure. A Cargo.lock without registry sources cannot build offline.
4. For the desktop only: WebKitGTK 4.1, GTK3, JavaScriptCoreGTK 4.1, libsoup3, OpenSSL, Ayatana AppIndicator and librsvg development packages; Yarn/Tauri dependencies; the pinned llama.cpp source and built ELF engine; and an admitted text GGUF.

## Run on a properly equipped Linux worktree

```bash
bash scripts/build-lu-linux-local.sh --preflight
bash scripts/build-lu-linux-local.sh --core
bash scripts/build-lu-linux-local.sh --desktop /work/llama.cpp /work/llama.cpp/build/bin
```

The last command modifies the disposable checkout's Cargo binary name; do not run it in an irreplaceable working tree. It only prints `LU_LINUX_DEB_BUILT` after Tauri finishes and a new structurally valid `.deb` exists; it does **not** claim that the GGUF, GUI or restart checks passed.

## Acceptance gates

- **L2:** exact-head offline Cargo format, tests and strict Clippy.
- **L3:** genuine GGUF, native final/tool-loop, authorization, cancellation and recovery.
- **L4:** Tauri frontend assistant render, durable saved JSONL, separate-process restart.
- **L5:** installed `.deb` with pinned engine, Lu-only profile, clean replacement/uninstall.
- **Windows:** separate W01–W06, AX/DX and A01–A09 on a pinned Windows installer.

For distributed Debian packages, build on Debian 12 or Ubuntu 22.04 once engineering is stable, because Debian 13 can produce glibc requirements too new for older distros. Keep GitHub for source/milestones, not paid routine CI.
