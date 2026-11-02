# Lu R15 — Conversation sidebar, Settings models, persistent chats, model discovery

**Release status: DEVELOPMENT EVALUATION — NOT ALPHA.**

## Changes

- Replaced the persistent runtime chip and sidebar GGUF loader with New Chat,
  Favorites, Folders (single level), Recent Chats, and Settings.
- Compact quick-model selector in chat header; changing selection never loads.
  Loading requires an explicit button click in dropdown or Settings.
- Lu's managed models directory is scanned for valid top-level GGUF files on
  startup, and by Settings > Rescan. No model is automatically loaded.
- New per-conversation append journals, atomic folder/favorite/index metadata,
  and one-time migration of R14 flat chats.jsonl while preserving the original.
- Periodically journal assistant generation checkpoints. Interrupted responses
  survive restart in original turn order; canceled partial responses are hidden.
- Fixed image cleanup to validate Lu Core's actual 36-character image ID,
  instead of R14's erroneous 68-character check.
- Bright green loaded indicator and resizable/collapsible prompt composer.

## Verification

- React 19 offline build: PASS.
- UI/source regression checks: 17/17 PASS.
- ChatStore executable Linux Rust tests: 5/5 PASS.
- Windows x86-64 MSVC Cargo check and test typecheck: PASS.
- Windows x64 GUI PE link with ComCtl32 v6 RT_MANIFEST: PASS.
- NSIS development evaluation packaging and SHA-256 manifest: PASS.
- Physical Windows run, R14 migration on user's machine, AMD Vulkan offload,
  real MMProj image QA, native tool loop: NOT VERIFIED. No alpha approval.

## Installation and recovery

R15 installs to a separate development evaluation location, using the same Lu
app-data location as R14. Stop R14 before launching R15 so the original flat
chats.jsonl remains a consistent migration source. The original file is not
modified, overwritten, renamed, or deleted by the R15 migration. The new
index and journals are independent and can be backed up or inspected.

## Dependencies

No new software packages were downloaded or requested. The pinned R11 Vulkan
engine, offline Rust 1.98, Windows SDK, LLVM, NSIS and React cache were reused.
GitHub remains the repository, not the build hub.

## Checksums

```json
{
  "installer_sha256": "d6330bd7a18ccf21204ec294865209840544f87a5edbf7da9987fd9b61c3b066",
  "exe_sha256": "25717e4e5796ad6e51da5002317b20c87a27f6f946b18a4ae873cf1ba601ee5d",
  "installer_bytes": 22773158,
  "exe_bytes": 16213504,
  "chatstore_tests": "5 passed, 0 failed",
  "frontend_checks": "17 passed, 0 failed",
  "rust_windows_check": "pass",
  "rust_windows_tests_check": "pass",
  "windows_manifest": "pass",
  "physical_windows_acceptance": "not run",
  "gpu_offload": "not verified"
}
```
