# Lu Windows Alpha R7: continuity implementation seed and integration report

**Date:** 2026-11-01  
**Branch:** `lu/dpca-continuity-r7-20261101` (resolve its current head)  
**Base:** R6 `9a1d7a9d5893e9a5a6a195979236de52e84396a2` (itself based on the PR #106 MMProj pairing draft)  
**Alpha decision:** **NO-GO** — no Windows Vulkan+MMProj installed end-to-end acceptance.

## Why this change exists

The user identified a cross-session continuity failure: repeatedly rediscovering dependencies already provided. Context summaries had not reliably preserved the exact artifact name, location, digest, build status and task checkpoint. This is a Lu product requirement, not merely an assistant work habit. See `LU_CONTEXT_CONTINUITY_AND_ASSET_LEDGER_DESIGN_20261101.md`.

## Durable evidence and immediate mitigation

- The R6 historical asset snapshot is preserved in `LU_WINDOWS_ALPHA_ASSET_HANDOFF_20261101.json`.
- `LU_WINDOWS_ALPHA_R7_ACTIVE_HANDOFF_20261101.json` names the active R7 branch, last concrete source checkpoint, 23 known delivered dependency filenames in `/Jan Mod - Lu/Delivered`, three SHA-256-verified source/binary/model artifacts, open release requirements and next engineering action.
- `scripts/check_lu_asset_handoff.py` is a **read-only developer preflight**. It verifies only exact known local file locations; never crawls, executes, installs, downloads, or guesses. An unmounted path does *not* erase the fact of a delivered Library artifact.
- Five Python stdlib tests pass: correct verification, changed artifact, missing local mount, rejected symlink, and digest/identity conflict. A fresh local recheck returned `VERIFIED` for pinned llama.cpp source ZIP, the Linux `llama-server`, and Qwen 0.5B test GGUF.
- Files and source changes also have a persistent project Library copy in `/Jan Mod - Lu/DPCA`. This duplicates **metadata and code artifacts**, not the software packages themselves.

**This seed does not implement the final native SQLite/Protobuf Lu DPCA service.** The full system remains DPCA-01 through DPCA-04.

## Windows Job Object FFI repair

R6's initially isolated `windows_engine_job.rs` used Win32 `unsafe` FFI inside `lu-core`, which declares `#![forbid(unsafe_code)]`. An isolated rustc compile of that single module did not prove Lu Core integration and would leave a crate-level compile conflict.

R7 introduces a tiny `src-tauri/lu-win-worker-job` platform crate, moves the audited Win32 FFI there and adds a Windows-only path dependency to Lu Core. The Lu Core file now calls the platform crate's *safe* `Job` API and no longer references the former in-crate unsafe module; the obsolete file was removed from the R7 source tree.

**Verification:** Rust 1.98 offline `cargo check --target x86_64-pc-windows-msvc` with `RUSTFLAGS=-Dwarnings` passed for the new FFI crate. A separate Windows-target calling crate retaining `#![forbid(unsafe_code)]` also checked cleanly. Formatting check passed. **Not verified:** full Lu Core compile with the actual latest source, physical Windows Job runtime, or race-free spawn/Job assignment. The latter requires a native suspended/extended-startup launch design, not merely a fast post-spawn assignment. Never mark Windows containment accepted from metadata checks alone.

## R4 image transport vs PR #106 — reconciliation rules

The old R4 local source snapshot is based on commit `68eab79e...`; PR #106 and R7 are newer. Direct wholesale application is unsafe. Review matrix:

| Area | R4 additions to retain | PR #106/R7 safeguards not to regress |
|---|---|---|
| Protobuf `core.proto` | Typed `InferenceImageAttachment` and `InferenceGenerateRequest.images = 5` | Host-owned `projector_ref` binding, canonical version/limits |
| `inference_wire.rs`, `inference_image_refs.rs` | Validate image ref/MIME/digest/size; reject paths/oversize | Reject unapproved projector identity; keep strict frame validation |
| `inference_bridge.rs`, `inference_host.rs` | Host-pinned image bytes required for image generation | `load_with_projector` admission/recheck and backend fail-closed behavior |
| `inference_supervisor.rs` | Reserve and run typed image turns; cancellation ownership | Use PR #106's stable model/projector binding, exact model ref, and refusal of duplicate or loaded attachments |
| `persistent_llama_backend.rs` | Authenticated `/v1/chat/completions` image stream and bounded response parser | Keep pinned executable / model / projector, Vulkan settings, environment scrub and R7 Windows Job wrapper |
| `multimodal_saved_turn.rs`, `multimodal_http.rs` | Validated saved-turn image provenance, bounded request/stream | Do not infer media support from an MMProj filename; no model-controlled URLs or paths |
| Tauri + React UI | Save/attach image UX and typed transport | Native host picker, no legacy Jan paths, explicit MMProj selected per admitted model |

**Concrete identity discrepancy:** R4 constructs a projector reference as `p-{model_ref}`; PR #106 constructs it as `p-{model_ref[2..]}` for an `m-<32hex>` model identity. The PR #106 contract must win, and the merge must include a regression test for reconnect/restart, otherwise a valid saved pairing may be misinterpreted or silently renamed.

**Next integration action:** extract exact latest Lu source and reconcile the named modules with tests before compiling the Windows engine/desktop package. The source conflict is known; the already-delivered packages do not need to be rediscovered. The R4 94-test pass belongs to the old source and cannot be attributed to R7.

## Gates still open

1. Full PR #106 + R4 image protocol compile/test on one exact source revision.
2. Windows x64 Vulkan `llama-server.exe` built and pinned with its required DLL manifest, not a Linux ELF.
3. Native Lu Desktop Tauri frontend + backend built as an installable NSIS alpha.
4. Trusted GGUF + compatible MMProj import; genuine image-influenced answer and nonempty text, persistence/restart.
5. Real AMD Windows Vulkan device offload and logging, cancellation/recovery/worker cleanup, and race-free containment.

**No new dependency downloads requested in R7.** Continue from the active handoff ledger and the already identified Library deliveries.
