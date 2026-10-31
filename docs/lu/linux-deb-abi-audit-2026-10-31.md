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

The current workspace lacks CMake, Yarn, GTK/WebKitGTK development packages,
and a complete Debian 13 runtime. The supplied pool is a package transport,
not a full root filesystem. Rebuild and installed GUI/model validation require
a Debian 13 environment populated with the supplied packages and runtime base.
