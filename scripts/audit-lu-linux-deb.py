#!/usr/bin/env python3
"""Check a Lu Debian preview against the Ubuntu 24.04 ABI floor.

This inspects package metadata and ELF version requirements. It does not
install the package, run its executables, or claim GUI/model acceptance.
"""

import argparse
import re
import subprocess
import sys
import tempfile
from pathlib import Path

TARGET_GLIBC = (2, 39)
TARGET_OPENSSL = (3, 0)


def version_tuple(value):
    return tuple(int(part) for part in value.split("."))


def requirements(text, prefix):
    pattern = rf"\b{re.escape(prefix)}_(\d+(?:\.\d+)+)\b"
    return {version_tuple(match) for match in re.findall(pattern, text)}


def libc_floor(dependencies):
    matches = re.findall(r"(?:^|[,|])\s*libc6\s*\(\s*>=\s*(\d+(?:\.\d+)+)\s*\)", dependencies)
    if not matches:
        raise ValueError("libc6 minimum dependency is missing or ambiguous")
    return max(map(version_tuple, matches))


def run(*args):
    return subprocess.run(args, check=True, text=True, capture_output=True).stdout


def audit(deb):
    failures = []
    package = run("dpkg-deb", "-f", str(deb), "Package").strip()
    arch = run("dpkg-deb", "-f", str(deb), "Architecture").strip()
    dependencies = run("dpkg-deb", "-f", str(deb), "Depends").strip()
    if package != "lu-desktop" or arch != "amd64":
        failures.append(f"unexpected package identity: {package}/{arch}")
    try:
        floor = libc_floor(dependencies)
        if floor > TARGET_GLIBC:
            failures.append(f"Debian libc6 floor {floor} exceeds Ubuntu 24.04 glibc {TARGET_GLIBC}")
    except ValueError as exc:
        failures.append(str(exc))

    with tempfile.TemporaryDirectory(prefix="lu-deb-audit-") as temporary:
        root = Path(temporary)
        subprocess.run(["dpkg-deb", "-x", str(deb), str(root)], check=True,
                       capture_output=True)
        desktop = root / "usr/bin/Lu-Desktop"
        engine = root / "usr/lib/Lu/lu-inference"
        server = engine / "llama-server"
        for required in (desktop, server, engine / "manifest.json"):
            if not required.is_file():
                failures.append(f"missing payload: {required.relative_to(root)}")
        binaries = [desktop, server] + sorted(engine.glob("*.so*"))
        for binary in binaries:
            if not binary.is_file():
                continue
            if run("file", "-b", str(binary)).find("ELF 64-bit") < 0:
                failures.append(f"not ELF64: {binary.relative_to(root)}")
                continue
            versions = run("readelf", "--version-info", str(binary))
            for label, target in (("GLIBC", TARGET_GLIBC), ("OPENSSL", TARGET_OPENSSL)):
                needed = requirements(versions, label)
                if needed and max(needed) > target:
                    failures.append(f"{binary.relative_to(root)} requires {label}_{'.'.join(map(str, max(needed)))}; target is {'.'.join(map(str, target))}")
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("deb", type=Path)
    args = parser.parse_args()
    try:
        failures = audit(args.deb.resolve())
    except (OSError, subprocess.CalledProcessError) as exc:
        print(f"LU_LINUX_ABI_AUDIT_ERROR {exc}", file=sys.stderr)
        return 2
    for failure in failures:
        print("LU_LINUX_ABI_FAIL " + failure, file=sys.stderr)
    if failures:
        return 1
    print("LU_LINUX_ABI_PASS target=ubuntu-24.04 amd64 (runtime=not_tested)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
