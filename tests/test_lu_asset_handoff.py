"""Regression cases for the portable DPCA handoff seed (stdlib only)."""
from pathlib import Path
import importlib.util
import hashlib
import json
import tempfile
import unittest

MODPATH = Path(__file__).resolve().parents[1] / 'scripts' / 'check_lu_asset_handoff.py'
spec = importlib.util.spec_from_file_location('asset_handoff', MODPATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class HandoffTests(unittest.TestCase):
    def test_checked_in_seed_is_structurally_valid_and_no_false_alpha(self):
        handoff = module.load_handoff(module.DEFAULT_HANDOFF)
        self.assertFalse(handoff['alpha_release_approved'])
        self.assertEqual(handoff['source_branch'], 'lu/dpca-continuity-r7-20261101')
        self.assertGreaterEqual(len(handoff['delivered_library_known_filenames']), 20)
        self.assertTrue(all(r['status'] != 'pass' for r in handoff['requirements']))

    def test_known_location_no_rescan_and_hash_verification(self):
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / 'pinned.zip'; f.write_bytes(b'known bytes')
            asset = {'label': 'known package','sha256':hashlib.sha256(b'known bytes').hexdigest(),
                     'size_bytes':11,'locations':[{'provider':'local_worktree','locator':str(f)}]}
            self.assertEqual(module.verify_local_file(asset)['status'], 'VERIFIED')
            f.write_bytes(b'changed now')
            self.assertEqual(module.verify_local_file(asset)['status'], 'CHANGED')

    def test_stale_location_does_not_erase_supplied_asset(self):
        asset = {'label':'known but unmounted','sha256':'0'*64,'size_bytes':0,
                 'locations':[{'provider':'local_worktree','locator':'/unlikely/lu/absent.zip'}]}
        self.assertEqual(module.verify_local_file(asset)['status'], 'UNMOUNTED')

    def test_symlink_location_not_followed(self):
        with tempfile.TemporaryDirectory() as t:
            f = Path(t) / 'good';f.write_bytes(b'bytes')
            alias=Path(t)/'alias';alias.symlink_to(f)
            asset={'label':'x','sha256':hashlib.sha256(b'bytes').hexdigest(), 'size_bytes':5,
                   'locations':[{'provider':'local_worktree','locator':str(alias)}]}
            self.assertEqual(module.verify_local_file(asset)['status'], 'UNSAFE_LOCATION')

    def test_digest_cannot_be_implicitly_changed(self):
        with tempfile.TemporaryDirectory() as t:
            f=Path(t)/'s.json'; seed=module.load_handoff(module.DEFAULT_HANDOFF)
            seed['artifact_records'][0]['sha256']='0'*64
            f.write_text(json.dumps(seed))
            with self.assertRaisesRegex(ValueError,'asset ID'):
                module.load_handoff(f)


if __name__ == '__main__':
    unittest.main()
