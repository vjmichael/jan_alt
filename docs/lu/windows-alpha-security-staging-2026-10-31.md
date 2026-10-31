# Windows alpha: security staging on DX-15E accepted source

Date: 2026-10-31.

**Known-good chat baseline:** `d0593a2728a61c949f3ae64dcd630a53748e2025`, DX-15E Windows run 41224161266. The real pinned GGUF loaded, process exit was independently attested, a new native assistant was generated, saved, confirmed by service readback and React commit, and a separate new desktop host restored the exact assistant from disk with no regeneration. This records the individual acceptance steps; the workflow-level conclusion is tracked separately.

**Security changes from:** `4b912e7b47503a861fc5cde743c6887f05ca3960`, Windows native path-guard run 41225920359 passed. The local extracted 4/4 Linux tests passed. The native guard rejects Windows junctions and redirected Lu owner-lock, primary SQLite, WAL, SHM and rollback sidecar paths before startup. It does not claim handle-race security.

This branch combines those disjoint trees without modifying the known-good alpha branch. Before release, reverify the full host build and installed Windows NSIS package. Real model-directed native tool use remains an independent acceptance requirement; no deterministic/mock tool turn may satisfy that requirement.

GitHub is a source repository and milestone evidence archive, not the development environment.
