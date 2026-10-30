# Lu Linux-first development pivot — October 30, 2026

## Decision and boundaries

**Linux x86-64 is Lu's primary engineering/test platform until the native model/tool/GUI path can be iterated locally.** Windows x86-64 remains the intended initial user installer and still requires independent, real Windows acceptance. Do not erase the previous Windows evidence or declare Windows gates passed from Linux tests. Do not open a PR merely to run GitHub Actions. GitHub is the durable source repository, not the development computer.

Starting point: source stack through draft PR #93, commit `dd815b8c96f524d99f1fb782f29bcde71103ec17`. The Linux work is isolated on `linux/lu-native-dev-20261030`, without modifying protected `main`. Linux source will not alter Cognitum or other projects.

## Platform implementation

- The trusted Tauri Lu host now chooses `llama-server` on Linux with compiled architecture pin `x86_64-unknown-linux-gnu` rather than hard-coded `llama-server.exe` and `x86_64-pc-windows-msvc`.
- Existing engine SHA-256 pin and complete SHA-256 manifest remain mandatory. All package entries must be regular files inside the bundled engine directory, with no extra unmanifested files. Linux allows the native executable and pinned `lib*.so`/SONAME components; Windows keeps `llama-server.exe` and DLL handling.
- The supervisor continues using Lu-owned Protobuf inference/tool dispatch and persistent llama.cpp, not an MCP server. Linux runs a host-pinned ELF executable with execute permission and a bounded `LD_LIBRARY_PATH` set to the verified bundle. The child now strips inherited `LD_*`, `GLIBC_TUNABLES`, `LLAMA_ARG_*` and `LLAMA_API_KEY` settings before setting its own pinned library path; a Rust regression is committed but **not yet executed**. This is development packaging; formal runtime tamper resistance still requires post-build review.
- The separate Tauri Linux overlay `src-tauri/tauri.lu.linux.conf.json` targets a Debian `.deb` development package, desktop window, Linux-compatible icons, Lu-only capabilities and no Windows-only Mica effects. The original Windows NSIS configuration remains unchanged.

## Local engine staging (no GitHub Actions)

Use a **disposable Linux checkout**, with installed Rust/Cargo, Node 22, existing Yarn dependencies, CMake, compiler, WebKitGTK/GTK development libraries and a pinned local llama.cpp source tree. The Tauri 2 Linux prerequisite packages for Debian include `libwebkit2gtk-4.1-dev`, `build-essential`, `libssl-dev`, `libayatana-appindicator3-dev`, `libxdo-dev` and `librsvg2-dev`. Choose Debian 12/Ubuntu 22.04 or another deliberate baseline for broadly distributable packages, rather than assuming Debian 13 binaries run on older systems.

The upstream source commit must be `7fe450e19305b828c199d602c23a8337aaa1f03b`. Build `llama-server` from that checked-out source, e.g.:

```bash
cmake -S /work/llama.cpp -B /work/llama.cpp/build \
  -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_SERVER=ON -DLLAMA_CURL=OFF \
  -DGGML_VULKAN=OFF
cmake --build /work/llama.cpp/build --config Release -j 4
node scripts/stage-lu-linux-engine.mjs \
  /work/llama.cpp /work/llama.cpp/build/bin \
  src-tauri/resources/lu-inference
```

The staging command requires the exact clean source commit, accepts only x86-64 ELF artifacts from the specified build directory, resolves in-directory library symlinks into pinned **regular files**, stages the executable and shared libraries atomically, and prints two hashes. Export those reported values in the local build shell as `LU_TRUSTED_LLAMA_SERVER_SHA256` and `LU_TRUSTED_LLAMA_PACKAGE_SHA256`. They are compiled into the trusted host; the WebView cannot select a different binary or manifest. Staging refuses to overwrite an existing engine folder. No package or model downloads occur in this script.

## Linux build preparation and testing

```bash
# Read-only checks (also usable before a native toolchain is available)
node --test scripts/tests/stage-lu-linux-engine.test.mjs scripts/tests/prepare-lu-linux.test.mjs scripts/tests/linux-runtime-smoke.test.mjs
node scripts/prepare-lu-linux.mjs --check

# When source dependencies and the pinned engine package are ready:
node scripts/prepare-lu-linux.mjs --prepare
yarn tauri build --features lu-distribution \
  --config src-tauri/tauri.lu.conf.json \
  --config src-tauri/tauri.lu.linux.conf.json --bundles deb

# Cargo core tests, local scratch profile, no network or GitHub Actions:
bash scripts/test-lu-linux-offline.sh --quick
bash scripts/test-lu-linux-offline.sh --full
```

The `--prepare` command verifies staged manifest and compiled hash pins, produces Lu-only icons using existing local Yarn packages, and *only after successful generation* changes the disposable checkout's Cargo binary name from `Jan-Desktop` to `Lu-Desktop`. Do **not** run in the protected or otherwise irreplaceable source tree.

For an installed desktop smoke test: import or copy an admitted text GGUF into Lu's separate `lu-models` directory, open Lu, load it through the trusted model picker, generate a native assistant reply, check the durable transcript and restart. Linux success is development evidence; Windows W01 and installer gates still require Windows.

## What was actually verified in this environment

- Container: Debian 13 x86-64, Node.js 22, GCC, CMake, Git and Xvfb available.
- **Missing here**: Rust/Cargo, WebKitGTK/GTK development packages, local llama.cpp source/binary, the full checked-out Lu repository, and network/DNS to install or clone them. Thus full Rust compilation and WebView desktop execution have **not** been performed.
- Actual local Node execution in the Linux container: **10 passing, 0 failing**, with no GitHub Actions. Four package fixtures verify ELF and manifest identity, in-directory shared-library links, and rejection of unsafe/non-ELF sources. Five preparation fixtures confirm read-only safety, valid vs incorrect hash pins, engine tamper rejection, and detection of unmanifested package files before Cargo changes. One additional smoke test compiles a genuine x86-64 ELF executable and versioned shared library using GCC, stages the pair and successfully runs the executable with its packaged dependency. The executable prints `LU_REAL_ELF_OK=42`. The ELF validator was strengthened to require an intact ELF64 header, Linux x86-64 machine identity, valid ELF type/version and header size before signing. Two more preparation fixtures prove modified binary contents and unmanifested files cannot reach Cargo mutation. This is *real ELF loading*, not a real llama.cpp or Lu/GGUF inference test; the preparation fixture still uses a stub icon generator. These are not claims of an installed Linux application.

## Gates and next tasks

- **L0**: Source Linux engine authentication and Tauri/Debian overlay — implemented, awaiting Rust compile
- **L1**: Local Node staging/preparation and native linker smoke — passed 10/10 on Linux (GCC smoke included)
- **L2**: Rust format/unit/native tools and supervisor continuation — blocked by missing local Rust toolchain and vendored dependency cache
- **L3**: Real GGUF Linux host load, bounded reply and native tool call — not run; requires pinned local engine and admitted model
- **L4**: Linux Tauri/WebKitGTK GUI first turn, saved JSONL and process restart — not run
- **L5**: Linux `.deb` packaging, provenance, permission and separate-profile smoke — not run
- **W01–W06 / AX / DX / A01–A09**: Windows user-release acceptance remains separate and open

The real Windows W01 run 41069397256 classified its failed model reply as `model_kind_rejected`. Separate unverified source candidates handle exact display-only final envelopes and ChatML stop boundaries. These are not silently merged into Linux; first stabilize and validate the portable native host, then bring in candidates under unit tests.

**No GitHub Actions jobs should be dispatched from this Linux branch; use local execution and push selected source milestones.**
