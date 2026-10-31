# Lu Linux Debian ABI audit — October 31, 2026

The `Lu-Desktop_0.8.5~lu20261030.2_amd64.deb` engineering preview contains
the real L15 frontend and a CPU llama.cpp engine, but cannot be accepted on
the Ubuntu 24.04 target. The package declares `libc6 (>= 2.41)`, while Ubuntu
24.04 provides glibc 2.39. The bundled `libllama-common.so` and
`libllama-server-impl.so` require `OPENSSL_3.3.0`; Ubuntu 24.04 provides
OpenSSL 3.0. The desktop ELF itself requires at most `GLIBC_2.39`.

The earlier L3 CPU engine archive also requires `OPENSSL_3.3.0`, so swapping
that older artifact into the installer would not solve this incompatibility.
The engine must be rebuilt against the intended target's libraries, and the
Debian package metadata must be generated on a compatible build host.

`scripts/audit-lu-linux-deb.py` now inspects the generated package's identity,
declared libc floor, and versioned GLIBC/OpenSSL needs of every bundled ELF.
The local desktop build runs this gate on each newly produced `.deb`. The
local engine builder rejects a build environment whose OpenSSL development
package is not 3.0.x. This catches the observed regression; it does not test
all runtime dependencies, GUI display, model behavior, or install lifecycle.

Local reproduction:

```sh
python3 scripts/audit-lu-linux-deb.py /path/to/Lu-Desktop_amd64.deb
python3 -m unittest discover -s scripts/tests -p 'test_lu_linux_deb_audit.py'
```

The current development workspace lacks Rust, CMake, Yarn, pkg-config, GTK
and WebKitGTK development packages, so rebuilding the desktop and engine is
blocked here. The next gate is a local Ubuntu 24.04 build with those tools,
followed by this ABI audit, clean install and GUI/model checks. No package is
declared installable based on this static audit alone.
