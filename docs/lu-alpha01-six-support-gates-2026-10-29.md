# Lu Alpha 0.1 — six independent support batches (2026-10-29)

**Branch:** `work/lu-alpha01-six-support-gates-20261029` based on the Phase 4H acceptance recovery baseline.

This branch implements supporting checks and usability improvements without merging into protected `main`, the pinned Alpha candidate, Batch 4G, or the active W01/W06 acceptance branch. No Linux/macOS release work; Windows x86-64 remains the target. No user's AppData is accessed.

## Gate and verification matrix

| Batch | Engineering deliverable | Independent supporting check | Real release claim |
| --- | --- | --- | --- |
| S01 — Evidence | `scripts/lu/check-alpha01-evidence.ps1` requires exact A01–A09 entries with pinned source, digest, run URL and actual-Windows evidence kinds | `scripts/lu/test-alpha01-evidence.ps1` creates synthetic positive and negative fixtures | No; JSON text is not proof the run happened or succeeded |
| S02 — W02/W05 regressions | Validated per-line JSONL helper used by WebView2 W02; reserved PowerShell HOME and runner-safety guard assertions | `e2e/helpers/lu-saved-turns.test.ts`, E2E typecheck | No; full installed W02/W05 tests still required |
| S03 — First-run recovery | UI error classification with redacted, actionable guidance, explicit catalog retry, and no implicit Jan/MCP fallback | `web-app/src/lib/__tests__/luNativeError.test.ts` | No; missing GGUF/GPU/engine failure scenarios require desktop verification for A09 |
| S04 — Diagnostics | User-triggered, bounded JSON status+event timeline; no raw logs, prompts, thread IDs, model paths or tokens | `web-app/src/lib/__tests__/luDiagnostics.test.ts` | No; Windows GUI export still needs manual E2E |
| S05 — NSIS provenance | Offline validator checks exact NSIS file bytes, manifest, source SHA, engine/package digests and checksum sidecar | `scripts/lu/verify-installer-provenance.test.mjs` (synthetic binary) | No; must verify real built installer and installed runtime |
| S06 — Native contracts | Rust negative tests for malformed/missing/oversized Protobuf, invalid conversation/turn/scope/task authority, revocation callback and cancellation flag | `src-tauri/lu-core/tests/alpha_support_contracts.rs` | No; a Rust flag does not prove OS process-tree termination |

## How to run

- `pwsh -NoProfile -File scripts/lu/test-alpha01-evidence.ps1`
- `node --test scripts/lu/verify-installer-provenance.test.mjs`
- `yarn workspace @janhq/e2e exec tsx --test helpers/lu-saved-turns.test.ts`
- `yarn workspace @janhq/e2e typecheck`
- `yarn vitest run --project @janhq/web-app web-app/src/lib/__tests__/luNativeError.test.ts web-app/src/lib/__tests__/luDiagnostics.test.ts`
- `cargo test --manifest-path src-tauri/lu-core/Cargo.toml --test alpha_support_contracts`

CI workflow: `.github/workflows/lu-alpha01-six-support-gates.yml`, three independent Windows jobs. A passing fixture test does not certify a release.

## Integration rules

1. Review and merge these batches into the actual Alpha candidate only after the independent source/CI checks pass, with source SHA and tests recorded; do not silently move the immutable pre-existing candidate pin.
2. Candidate installer manifests must be generated from the **actual** Windows NSIS binary and commit; do not use fixture binaries or substitute another build's hashes.
3. Authoritative Alpha A01–A09 closure requires real run status and actual Windows installed-desktop evidence on one pinned candidate; the evidence schema validator is a preflight only.
4. Preserve Phase 4H W01/W06 ownership, Jan Apache-2.0 notices, conversation-bound authority, durable worker cancellation/recovery and sealed inference inventory.
5. The comprehensive v1.0 code review remains **blocked until Lu Alpha is built, installed and running with a real visible, persisted GGUF response**.
