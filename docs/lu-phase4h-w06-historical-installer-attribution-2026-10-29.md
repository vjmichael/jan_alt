# Phase 4H W06 — historical NSIS attribution debt and strict replacement gate

**Status: pending installed Windows acceptance.** This is a provenance record, not a pass claim.

## Exact historical baseline

- Prior installed-preview source SHA: `d6edb050d797e0d492223db6da8f335dd7c37ce1`.
- Pinned old installer artifact: GitHub Actions run `40542686980`, artifact `Lu-Windows-x64-Vulkan-Development-Installer`; W06 validates its build manifest and installer SHA-256 before execution.
- Original Windows failure: https://github.com/vjmichael/jan_alt/actions/runs/40823011654 — the installed old preview lacked required Jan/Apache `LICENSE`. Its missing attribution is a historical release defect and must not be represented as compliant.

## Remediation and policy

`scripts/check-lu-windows-release-integrity.ps1` recognizes missing/invalid files in the old installer **only when** `-AllowKnownLegacyMissingAttribution` is explicitly set and the old source SHA equals the pinned baseline above. It logs `LU_W06_LEGACY_ATTRIBUTION_DEBT` with defect count. The exception makes the old installer eligible only as a historical *upgrade input*; it never certifies that previous release.

The current replacement NSIS installer must still:
1. Be a distinct checksum-verified Git commit and manifest-matched installer (not a rebuilt file passed as the prior release).
2. Ship `LICENSE`, `NOTICE`, and `licenses/Apache-2.0.txt` byte-for-byte identical to checked-in source. Source files retain Jan copyright/Apache-2.0 provenance.
3. Install the exact expected newly built `Lu-Desktop.exe`, engine manifest, and pinned native inference binary.
4. Preserve pre-existing Jan and Lu profile canaries and Jan protocol association across install/upgrade/uninstall.
5. Uninstall successfully without silently deleting user data.
6. Run only in the disposable Windows Actions VM and refuse real user profiles.

An exception for any other old SHA, or any missing or modified **current** attribution file, remains an unconditional failure. Do not silently broaden this exception or suppress the warning.

## Required closure evidence

Record the passing run URL, source SHA, actual installer digest, old-preview debt log, new-release exact-notice verification, cross-commit replacement canary proof, and uninstall proof. Passing a script syntax check or creating this document is not W06 closure. Users of a historically deficient preview should be directed to replace it with a compliant installer after the release is verified.
