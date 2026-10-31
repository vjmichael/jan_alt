import importlib.util
import pathlib
import unittest


path = pathlib.Path(__file__).resolve().parents[1] / "audit-lu-linux-deb.py"
spec = importlib.util.spec_from_file_location("lu_deb_audit", path)
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AuditParsingTest(unittest.TestCase):
    def test_versions_are_numeric_not_lexical(self):
        self.assertEqual(audit.requirements("GLIBC_2.9 GLIBC_2.39 GLIBC_2.40", "GLIBC"),
                         {(2, 9), (2, 39), (2, 40)})

    def test_libc_floor_in_dependency_expression(self):
        self.assertEqual(audit.libc_floor("libstdc++6, libc6 (>= 2.41), libgtk-3-0t64"),
                         (2, 41))
        with self.assertRaises(ValueError):
            audit.libc_floor("libstdc++6, libgtk-3-0t64")


if __name__ == "__main__":
    unittest.main()
