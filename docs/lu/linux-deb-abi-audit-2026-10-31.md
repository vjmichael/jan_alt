# Lu Linux Debian ABI audit — October 31, 2026

The Delivered folder contains an offline **Debian 13 (Trixie) amd64** GUI
dependency pool, the Rust 1.98 toolchain, a Lu source snapshot, crate inputs,
and Yarn cache archives. The Debian pool README expressly targets Debian 13.
It contains libc6 development files 2.41 and OpenSSL development files 3.5.7;
runtime libc6 and libssl packages were not included in this pool.

The `Lu-Desktop_0.8.5~lu20261030.2_amd64.deb` preview declares
`libc6 (>= 2.41)` and its bundled engine requires `OPENSSL_3.3.0`. Those
requirements are consistent with the intended Debian 13 target. They prevent
running the same package directly on this Ubuntu 24.04 development host, which
has glibc 2.39 and OpenSSL 3.0. This host incompatibility is not evidence that
the Debian 13 build is defective.

`scripts/audit-lu-linux-deb.py` inspects the generated package's identity,
declared libc floor, and versioned GLIBC/OpenSSL needs of bundled ELF files.
The local desktop build checks its new `.deb` against the Debian 13 floor.
The engine builder checks for Debian 13 OpenSSL 3.5 development headers.
Ubuntu 24.04 remains an explicit optional diagnostic target. Static ABI checks
do not establish installed GUI, model generation, or full runtime dependency
resolution.

```sh
python3 scripts/audit-lu-linux-deb.py --target debian-13 /path/to/Lu-Desktop_amd64.deb
python3 scripts/audit-lu-linux-deb.py --target ubuntu-24.04 /path/to/Lu-Desktop_amd64.deb
```

## Follow-up local runtime evidence

The user supplied the official Debian 13 amd64 `rootfs.tar.gz` artifact and
`libssl3t64_3.5.7-1~deb13u3_amd64.deb`. The rootfs SHA-256 is
`a1d156b0aab5fb07d822a7f4681f6d3ed1689073531c34f5668818c233633f11`,
matching the pinned Debian artifacts Git tree blob. All 438 `.deb` files in
the previously supplied GUI pool passed its `SHA256SUMS` checks.

Using the Debian 13 loader and isolated library paths, the packaged
`llama-server --version` started successfully. The server then loaded the
untrained 26.7 MB `Tiny-LLM.f16.gguf`, generated eight tokens from a loopback
`/completion` request, and rejected the same unauthenticated request with
HTTP 401. This is real local GGUF token generation, but the synthetic model's
output has no semantic quality and does not demonstrate the Lu desktop chat.

After extracting the GUI package pool into a disposable Debian 13 root tree,
the loader resolved the desktop binary's shared libraries, including
WebKitGTK 4.1 and GTK 3. Additional verified Debian packages supplied a
disposable Xvfb and keyboard compiler. Scratch-only copies of the X server
and WebKit library redirected their compiled absolute helper paths into the
extracted tree. The desktop rendered its real Lu chat window over loopback
X11. A scratch-only resource path shim let the extracted (not installed) app
find its bundled engine, and a synthetic GGUF copied into a disposable Lu
profile appeared in the native model selector.

Clicking **Load** then reported `Lu native inference failed` and `Native model
loading failed; see Lu status`. **Check diagnostics** reported `No validated
host finding is available`. The desktop produced no successful model-load
status or native chat response in this test. The app launches a separate
hash-verified engine executable and deliberately strips inherited loader
injection; the extracted-package test's Debian loader and path shims cannot
establish that child launch works in the intended installed environment.
The failure's exact cause is not established by these observations. The
earlier direct engine test proves the packaged engine can load the synthetic
GGUF under the Debian loader, independently of this desktop handoff.

The sandbox cannot provide a clean Debian 13 installed GUI session or the
normal X11 Unix socket. The copied library and loader shims are disposable
test scaffolding, not package changes. Installed desktop model loading,
conversation persistence, actual semantic GGUF chat, and installer lifecycle
remain acceptance gates.

The current workspace lacks a complete Debian 13 build environment with
CMake and a staged Yarn CLI. The supplied GUI pool is package transport,
not a full base system. A clean Debian 13 GUI session remains the next
desktop acceptance gate.
