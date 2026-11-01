#!/usr/bin/env python3
"""Read-only engineering aid: resolve exact known Lu artifact locations first.

Not a production Lu host API, permission broker, package installer or source
of execution authority. It does not crawl folders, download or run anything.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
from pathlib import Path
from typing import Any

DEFAULT_HANDOFF = Path(__file__).resolve().parents[1] / 'docs' / 'lu' / 'LU_WINDOWS_ALPHA_R7_ACTIVE_HANDOFF_20261101.json'


def load_handoff(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding='utf-8'))
    if value.get('schema_version') != 1 or not isinstance(value.get('artifact_records'), list):
        raise ValueError('unsupported handoff schema')
    if not isinstance(value.get('requirements'), list):
        raise ValueError('missing requirements')
    for asset in value['artifact_records']:
        digest = asset.get('sha256')
        if not isinstance(digest, str) or len(digest) != 64 or any(c not in '0123456789abcdef' for c in digest):
            raise ValueError('invalid sha256')
        if asset.get('asset_id') != 'sha256:' + digest:
            raise ValueError('asset ID does not match digest')
        if not isinstance(asset.get('size_bytes'), int) or asset['size_bytes'] < 0:
            raise ValueError('invalid size')
    return value


def verify_local_file(asset: dict[str, Any]) -> dict[str, Any]:
    """Only checks an *existing explicit location*. Never follows symlinks."""
    candidates = [loc['locator'] for loc in asset.get('locations', []) if loc.get('provider') == 'local_worktree']
    if not candidates:
        return {'status': 'UNMOUNTED', 'label': asset['label'], 'reason': 'no local location recorded'}
    for candidate in candidates:
        path = Path(candidate)
        if not path.exists() and not path.is_symlink():
            continue
        if path.is_symlink() or not path.is_file():
            return {'status': 'UNSAFE_LOCATION', 'label': asset['label'], 'locator': str(path)}
        # Pin the opened handle, refusing final-component symlinks even if
        # the path changes between the initial check and open.
        flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_BINARY', 0)
        try:
            fd = os.open(path, flags)
        except OSError:
            return {'status': 'UNSAFE_LOCATION', 'label': asset['label'], 'locator': str(path)}
        sha = hashlib.sha256()
        with os.fdopen(fd, 'rb') as stream:
            metadata = os.fstat(stream.fileno())
            if not stat.S_ISREG(metadata.st_mode):
                return {'status': 'UNSAFE_LOCATION', 'label': asset['label'], 'locator': str(path)}
            if metadata.st_size != asset['size_bytes']:
                return {'status': 'CHANGED', 'label': asset['label'], 'locator': str(path), 'reason': 'size mismatch'}
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                sha.update(chunk)
        if sha.hexdigest() != asset['sha256']:
            return {'status': 'CHANGED', 'label': asset['label'], 'locator': str(path), 'reason': 'sha256 mismatch'}
        return {'status': 'VERIFIED', 'label': asset['label'], 'locator': str(path), 'sha256': sha.hexdigest()}
    return {'status': 'UNMOUNTED', 'label': asset['label'], 'reason': 'known paths inaccessible; do not claim never delivered'}


def summarize(handoff: dict[str, Any], verify: bool) -> dict[str, Any]:
    result = {'project_id': handoff['project_id'], 'source_branch': handoff['source_branch'], 'source_checkpoint_commit': handoff.get('source_checkpoint_commit', handoff.get('source_commit')),
              'release_approved': handoff['alpha_release_approved'],
              'requirements': handoff['requirements'],
              'known_delivered_packages': len(handoff['delivered_library_known_filenames']),
              'next_action': handoff['next_action']}
    result['assets'] = [verify_local_file(a) if verify else {'label': a['label'], 'status': a['trust_state'], 'sha256': a['sha256']} for a in handoff['artifact_records']]
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--handoff', type=Path, default=DEFAULT_HANDOFF)
    parser.add_argument('--verify-local', action='store_true', help='hash only the exact recorded local files')
    args = parser.parse_args()
    print(json.dumps(summarize(load_handoff(args.handoff), args.verify_local), indent=2))


if __name__ == '__main__':
    main()
