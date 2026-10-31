# Native-only Windows Lu: in-place migration gate W06-N0

Date: 2026-10-31. This is a **separate development branch**, not a modification of the known-good running NSIS build.

The already verified compatibility Lu NSIS artifact (source `513969a77e1205cedb3b6ae7bb5d389acda94b60`, run [41227420821](https://github.com/vjmichael/jan_alt/actions/runs/41227420821)) actually contains the inherited Jan worker and Bun/UV. A fresh install of native-only Lu can pass its negative inventory and yet **an in-place upgrade may leave these executable files in the existing destination**.

The script `scripts/check-lu-windows-native-only-upgrade.ps1` extends the existing W06 cross-commit test without weakening its provenance, license and Jan/Lu data canary requirements. In `-RequireNativeOnlyReplacement` mode it:
- pins the old package source/manifest/SHA-256 to the Vulkan Jan-worker preview;
- requires a distinct new package with exact source/installer SHA-256 and `distributionMode=native-only`, `engineVariant=cpu`, `legacyRuntimeBundled=false`;
- installs the old Lu NSIS in a unique, disposable Windows runner path, **proves at least one legacy executable was genuinely present**, and preserves Jan protocol/profile canaries;
- installs the *new* NSIS at exactly that same path, checks the installed Lu executable hash, the signed-off inference manifest and Lu model-engine hash;
- verifies that **zero** `jan-llama-worker.exe`, Bun or UV executables remain anywhere in the install tree, including architecture-suffixed binaries; a single stale executable is FAIL;
- verifies Apache-2.0 and Jan-origin notices, both Jan and Lu persistent data, Jan handler sentinel, and subsequent complete uninstall;
- outputs independent `LU_W06_NATIVE_ONLY_UPGRADE_PASS` or an exact failed-gate diagnostic.

A Windows PowerShell parser preflight runs immediately on this branch. **No claim of executed upgrade acceptance is made until the new native-only NSIS artifact exists and a separate Windows runner executes the actual W06-N0 script against both exact packages.** Do not silently force-delete or hide old runtime files to make the test pass; if the upgrade fails, fix the installer/transaction with an explicit auditable rollback strategy.

The user's self-development architecture requires old stable Lu Main to remain intact while disposable Lu Dev tests mutations, with local Git versioning and Guardian/user-approved promotion. This W06 test is a precursor, not an implementation of that entire policy.
