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

## Later L16 preview and installation candidate

The separately produced L16 preview `.7` reports a successful disposable
Debian 13 Xvfb GUI session with a real Qwen 0.5B GGUF: multiple displayed and
persisted answers, a restart, and normal engine cleanup. See the L16
engineering report and source/evidence archive for that run. The earlier
failure above was observed with `.2`, and must not be attributed to `.7`.

The supplied `.7` archive is an engineering preview (`Package: lu-preview`).
Its `Depends` field omitted `libc6` and `libssl3t64`, although its executable
requires glibc 2.41 and bundled engine libraries require `libssl.so.3` and
`libcrypto.so.3`. A control-metadata-only Debian 13 candidate was built from
the exact `.7` payload as `lu-desktop` version
`0.8.5~lu20261030.7+deb13u1`. It declares `libc6 (>= 2.41)`,
`libssl3t64 (>= 3.5)`, the direct GUI/runtime dependencies, and conflicts
with/replaces `lu-preview` so both packages do not own the same paths.
Fresh extraction compared byte-for-byte equal to `.7`'s `/usr` payload.
The candidate SHA-256 is
`7387987631f8364f280597a2cb83b0124761dd7ba1a3818f71921b2c4975b200`;
the Debian 13 static ABI audit passed. This metadata repair is not a new
desktop or engine build.

The Qwen GGUF from Delivered has SHA-256
`9ee36184e616dfc76df4f5dd66f908dbde6979524ae36e6cefb67f532f798cb8`.
In this restricted sandbox, `.7` rendered the desktop and admitted that
model, but Load failed with the extracted-package loader and path shims.
`unshare`, `bwrap`, and `chroot` were all denied, preventing an independent
`dpkg -i` installed GUI run here. The clean installation, chat turn, desktop
entry/icon behavior, and uninstall gate remain open for a real Debian 13
desktop or VM. Do not treat the control-only candidate's static audit as
installation certification.
