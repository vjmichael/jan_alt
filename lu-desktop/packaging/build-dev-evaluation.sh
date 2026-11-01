#!/usr/bin/env bash
# Makes a development evaluation installer only. Never marks it alpha-ready.
set -euo pipefail
: "${LU_DESKTOP_EXE:?Windows-target development executable path required}"
: "${LU_ENGINE_DIR:?Pinned Windows Vulkan engine directory required}"
: "${LU_OUTFILE:?Target dev-eval installer filename required}"
: "${LU_README:?Dev-eval README path required}"
: "${MAKENSIS:=makensis}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 - "$LU_DESKTOP_EXE" "$LU_ENGINE_DIR" "$LU_README" <<'PY'
from pathlib import Path
import hashlib, json, sys
exe, engine, note=map(Path,sys.argv[1:])
assert exe.is_file() and exe.read_bytes()[:2] == b'MZ', 'desktop executable missing or not PE'
assert note.is_file(), 'development label missing'
manifest=json.loads((engine/'manifest.json').read_text(encoding='utf-8'))
assert manifest['schema']=='lu-inference-package-v1' and manifest['backendId']=='llama-vulkan'
assert manifest['release_status']!='alpha-approved', 'evaluation must not impersonate release'
for f in manifest['files']:
    actual=engine/f['name']
    assert actual.is_file() and actual.stat().st_size == f['bytes'], f['name']
    h=hashlib.file_digest(actual.open('rb'),'sha256').hexdigest()
    assert h == f['sha256'], f['name']+' digest mismatch'
print('Pinned engine: manifest and 4 SHA-256 digests verified')
PY
"$MAKENSIS" \
  "-DLU_DESKTOP_EXE=$LU_DESKTOP_EXE" \
  "-DLU_ENGINE_DIR=$LU_ENGINE_DIR" \
  "-DLU_README=$LU_README" \
  "-DLU_OUTFILE=$LU_OUTFILE" \
  "$root/NSIS_DEV_EVAL_NOT_ALPHA.nsi"
sha256sum "$LU_OUTFILE"
