# Jan-origin source provenance and Apache-2.0 preservation

Status: **partial verified inventory**, established 2026-10-28 and updated
2026-10-29 for the revised [Cowork-free Alpha release rule](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
This is a development compliance aid, not final legal clearance for proprietary distribution.
**Alpha cannot retain Cowork or any unapproved Jan feature simply because the
code is Apache-2.0 or the source has an attribution comment.**

## Why this exists

Lu began as a fork of [Jan](https://github.com/janhq/jan). Removing Jan's runtime dependencies, Cowork loop, GUI branding, or API names does **not** remove Apache 2.0 obligations for Jan-derived source that remains. Original copyright/license notices must be preserved as applicable. Modified licensed files need prominent indications that they changed. A distributed derivative must include a copy of the Apache 2.0 license and preserve required notices. The original Jan `LICENSE` (Copyright 2025 Menlo Research) is retained without edits, and its current packaging copy lives at `src-tauri/resources/LICENSE`.

## Provenance categories

| Label | Meaning | Treatment |
|---|---|---|
| `matched-upstream` | Confirmed byte-for-byte same as upstream Jan main **before** added provenance header, as of audit date | Preserve Jan notice and rights; the newly added header itself is a modification |
| `modified-upstream` | Same path exists in Jan, but Lu content differs | Mark inherited/modified, preserve Jan notices, track changes in Git |
| `lu-authored` | Verified independently authored for Lu, without copied Jan source | Separately record owner and applicable license; never infer this solely from filename |
| `third-party` | Independently bundled libraries/assets with their own terms | Preserve third-party notices and upstream license copies |
| `review-required` | Origin or rights not yet substantiated | Do not call proprietary/clean-room/fully licensed until audited |

The machine-readable [Jan origin inventory](jan-origin-inventory.json) contains nine individually checked files. Each was compared with `janhq/jan` on `main` on October 28, 2026. These paths now carry a `JAN-UPSTREAM-PROVENANCE` comment. Some are still identical in algorithm/implementation; others mix original Jan code with Lu-specific modifications.

The broader source zones `core/`, `web-app/`, `src-tauri/src/core/`, `src-tauri/plugins/`, `extensions/`, `packages/`, and `src-tauri/resources/` are **candidate Jan inheritance areas**, not proof that every file is Jan-owned. There are also independently developed Lu files within these zones. More inventory work is required before a proprietary sale or open-source relic release.

## Revised Alpha inheritance/exclusion audit (mandatory)

For each build-reachable Jan-derived module, classify **both** source
provenance and **product disposition**:

- `alpha-approved-foundation`: explicit affirmative engineering decision,
  ownership and maintenance plan, tested as usable without Cowork, provenance
  recorded; may be bundled with proper Apache/third-party notices.
- `alpha-replace`: required capability to be implemented by Lu; document
  replacement API/Protobuf contracts and parity/security gates.
- `alpha-exclude`: Jan non-inheritable feature or Cowork code/feature; must be
  absent from built frontend chunks, native IPC/registry/plugin imports, UI
  routes/feature flags and NSIS installed resources. Cowork is categorically
  `alpha-exclude`.
- `review-required`: provenance or feature intent unclassified; release
  is blocked rather than implicitly treating it as allowed.

Keep these labels **in addition** to `matched-upstream`, `modified-upstream`,
`lu-authored`, `third-party` origin classifications. A code ownership
header alone does not establish exclusion or inheritance. Prove negative
reachability by checking actual optimized builds and installed Windows
runtime, not merely source grep or a disabled checkbox.

Do not interpret exclusion as a demand to erase the repository's historical
Git commits or remove Jan Apache-2.0 notices from remaining derivative files.
Cowork/no-Cowork is an **architectural release gate**, and Apache-2.0
compliance remains an **independent legal/provenance gate**.

## Engineering rule for any remaining Jan relic

1. **Before modifying or migrating:** compare to upstream Jan and inspect Git history. Enter the file in the register as matched/modified upstream, Lu-authored, third-party, or review-required. For Jan-derived code, add `JAN-UPSTREAM-PROVENANCE` near the top with original attribution, and a prominent modification indication (specific detail/date in Git commit/PR, where practicable).
2. **When extracting Jan helpers:** keep the source attribution tied to the extracted code, not merely the now-removed old path; update register paths on moves and renames.
3. **When deleting Jan files:** retain historical Git attribution in the repository. Remove obsolete inventory entries only after reviewing any remaining copies, binaries, resource bundles, and legal notices.
4. **For binary releases:** the Lu NSIS resource configuration now includes `LICENSE`, `NOTICE`, and `licenses/Apache-2.0.txt`; the installer smoke verifies all three installed files against the checked-in originals. Retain other third-party license notices and independently audit every binary/library; revisit packaging when the layout changes.
5. **For new proprietary Lu modules:** identify third-party copied code before assigning proprietary terms. Apache 2.0 permits commercial distribution with obligations, but does not automatically relicense independently authored modules.
6. **When open-sourcing an older Lu release:** clear third-party assets, contributor rights, trademarks, generated binaries and component-level license permissions before advertising the whole snapshot under MIT or Apache 2.0.

## Automated controls

Run `node scripts/check-lu-license-provenance.mjs`. CI verifies the preserved Jan copyright notice, bundled original copy, complete Apache 2.0 text, supplemental NOTICE, the nine verified source markers, and inventory consistency. CI can additionally check changed Jan-candidate files using `LU_LICENSE_BASE=<commit-sha>`, requiring them to be classified or reviewed before merge. The report counts additional tracked candidate files pending individual review, without asserting ownership of them.

**Audit limitation:** This does **not** establish that all inherited Jan files are inventoried or that all dependencies/assets are cleared. A final legal/source audit and license-BOM inspection are release conditions for proprietary distribution. Neither a provenance tag nor a Git diff alone establishes copyright ownership.
