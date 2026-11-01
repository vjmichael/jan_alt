# Lu unified source: Stage 0 recovery and native-only Debian packaging gate

**Recorded:** 2026-10-31 (Arizona local; repository UTC 2026-11-01).  
**Integration branch:** `work/lu-unified-source-stage0-20261101` (based on Windows six-gate source `e130dcf53204078661cedf4581eed13e92c9aa93`).  
**Status:** **partial source convergence / working-tree hardening; not a merged Linux Cognitum runtime, cross-platform release, or new installer.**  
**Repository role:** source and evidence archive. Local Debian/Rust tests were executed independently without Docker or GitHub Actions.

## Verified changes on the common source branch

The same Git tree already contains Lu's Windows and Debian Tauri configurations, shared React UI and Lu Core. This stage fixes a real Linux distribution contradiction:

1. Tauri auto-applies the tracked `src-tauri/tauri.linux.conf.json` after Lu-specific configuration. That tracked upstream Jan file still requests `jan-llama-worker`, `resources/bin/uv`, `usr/bin/bun` and a Jan window title. The previous local `--desktop` builder selected Lu's config but did not scrub this automatic overlay, even though an older shell-only CI builder used an ad-hoc rewrite.
2. `scripts/lu/prepare-native-only-linux-overlay.mjs` now admits exactly the known upstream Linux config shape and generates a disposable Debian-only overlay with **no Jan worker, Bun, UV, or inherited Jan app window**; preserves Lu native engine resource, license/NOTICE attribution, and the one Lu main window. Unknown upstream changes fail closed instead of being silently overwritten. An immutable backup is written before the rewrite.
3. `scripts/build-lu-linux-local.sh` executes the three Linux overlay regression tests and performs the guarded rewrite **after** pinned-engine/Cargo preparation but **before** Tauri bundles. It requires a disposable checkout and explicit build authorization via environment.
4. Independent local test results: **3/3** Node regression tests; **PASS** for Linux Lu config read-only preflight, Bash syntax and `--preflight` no-build contract; **PASS** for a real disposable config rewrite, with JSON verification that externalBin and `linux.deb.files` are empty and Lu engine attribution remains.

No Debian installer was produced or claimed by the source-only packaging gate.

## Recovered Linux D04F source, without overwriting Windows

The full source gaps highlighted by the [handoff](https://github.com/vjmichael/jan_alt/blob/work/lu-unified-source-convergence-plan-20261101/docs/lu/unified-windows-linux-source-convergence-handoff-2026-10-31.md) were pursued in the user's file library. The original D01/D03 and D04A–D04F source/evidence ZIP archives were found; the stage B/C/D/E archives had **not** been checked into the Linux documentation branch. Archived upstream Lu `68eab79e2799c02cec8949993cebd64215f00559` source was extracted and the historical Linux developer source snapshots and patches were replayed **locally** in order.

| Archive | SHA-256 |
| --- | --- |
| D03 source/evidence | `69e1fb8115328636e95ebdf550ecdcb5a50c5426c6835fdd8183c0b6ac231ba8` |
| D04A source/evidence | `96efa7a337035958a0517f63fbcc86cc008b2cd6a725f2c927436573191eda01` |
| D04B source/evidence | `9a8fea9694f9458db928c2c6e807d1a99c94c8e8bee5f335022ca69649cb6fe8` |
| D04C source/evidence | `2e068c578ec9d63c8348fcc9517e623983fcf0adb70797711b973d27f475b4be` |
| D04D source/evidence | `3ebc4792949839589156edbc71c390099fca1680bc61b4bd05bf31071831e034` |
| D04E source/evidence | `8d249b5230771b10e7862e3cb7a7b2a47bc81d626d220ae4c66d38665fd70972` |
| D04F/P46R8 source/evidence | `8e6605744bc834da87ef6467b4ba0a4c29a462a04f4c18fffbe5e8dbd145ca74` |

**Local recovery evidence:** each D04A/B/C/D/E/F `git apply --check` passed on its exact predecessor; all six patches applied. From a local Rust 1.98 toolchain and checksum-verified offline Cargo sources, reconstructed `lu-core` ran **95/95** Cognitum-enabled and **76/76** default library tests. Local lint/format cleanup was required; after this, feature-enabled `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` passed. These lint/format corrections have **not** been transplanted to the Windows line or represented as a release binary. The recovered tree is a staged source candidate, not proof of byte-for-byte equivalence to the earlier D04F executable.

The pinned Linux patch archives and reproducible source candidate are intentionally **not** bulk merged into this Windows branch. D01/D02 provenance, exact hash-bound worker reproducibility, Windows ABI contracts and feature-gated no-CE baseline still require a clean same-source proof.

## Current technical decision / file collision review

- **Keep Windows as source baseline**: native USER-turn verifier, per-turn policy, single-dispatch bounded unknown-tool retry, journal semantics, model admission, actual installed GUI gates, Windows Job containment policy and reparse guards.
- **Stage Linux as optional subordinate capabilities**: `cognitum-dev-native`, fixed trusted worker and rational Protobuf adapter, host-reviewed route descriptors, `HOST_ROUTE_SELECTED` transaction/migration, graded worker policy. Do not transplant old `model_turn_journal.rs`, `supervised_tool_generation.rs`, `model.rs` or desktop host wholesale.
- **Never equate selection with execution**: a host-chosen capability route is not a model-selected call, cannot mint consent, and a failed journal append cannot execute an effect. No post-effect retry.
- **Transport is subordinate**: the isolated `lu-ipc-common` AF_UNIX prototype must not replace authority, journal or native dispatcher until authenticated peer, Windows atomic Job and Linux real delegated-cgroup proofs.
- **One model catalog**: Linux and Windows GGUFs must be selectable in-place from user-owned folders. The Windows native OS-picker/OpenSSL-disabled CPU-engine repair on `work/lu-win-physical-gguf-registration-20261031` is still a separate **unaccepted** candidate; no GPU/Vulkan/MMProj support is claimed.
- **One application**: same `ai.lu.preview` app ID, Lu desktop and per-turn contract for both installations; `nsis` on Windows and `deb` on Linux. No Docker, mandatory Python, MCP, Bun or UV prerequisites for vanilla Lu.

## Status of convergence gates

| Gate | Status |
| --- | --- |
| UC-00 recover Linux missing intermediate patches | **Recovered locally, sequence replay verified**; exact source/worker reproducibility pending |
| UC-01 common contracts, feature-off Linux and Windows regressions | **Open**, no whole-source joint build yet |
| UC-02 merge Linux portable Cognitum in Windows core | **Open**, intentionally not performed without conflict-proof |
| UC-03 model catalog/physical Win10 repair + Linux backend | **Open**, old physical Windows load failed |
| UC-04 IPC containment and authority | **Open**, optional IPC crate isolated |
| UC-05 same Git SHA installed NSIS and Debian desktop | **Open**, no same-SHA build/installer acceptance |
| UC-06 ON/OFF & release decision | **Open**, no promotion |

## Explicit next integration tests

Use a disposable checkout of **one** exact source SHA; apply portable Lu Core changes one module at a time with Windows behavior as the baseline. Build feature-off and feature-on core on Linux and Windows, test Windows USER-turn identity + native tool dispatch unchanged, journal idempotent migration/replay/duplicate denial, and no escaped worker effects. Once the unified host is green, build both NSIS and Debian using the guarded OS overlays; verify real installed GGUF load, authorized Protobuf tool roundtrip, saved assistant and visible cold restart. A runner-only green build is not physical Windows acceptance.

**This stage does not alter the verified Windows core, does not publish an installer, and does not assert complete Windows–Linux convergence.**
