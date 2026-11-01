# LU-WIN-6G: exact rustfmt-only preflight repair

Date: 2026-10-31. Temporary source-repair branch `work/lu-win-sixgate-rustfmt-repair-20261031` is based on the current six-gate Windows candidate. The active NSIS build at exact commit `8ab711865f47c79e3f2e02ac92bed1b6cd331a33` is intentionally untouched; its binary provenance must not change due to this source-only repair.

The [Lu Core contracts failure 41252821917](https://github.com/vjmichael/jan_alt/actions/runs/41252821917) reported 13 exact `rustfmt --check` differences in four files. This branch applies only those logged changes, with every original hunk required to appear exactly once before replacement. The changed files are `lu-core/src/lib.rs`, `native_chat_ids.rs`, `native_workspace_paths.rs`, and `tests/real_gguf_tool_json.rs`.

A Windows/Linux rustfmt-only matrix verifies the pinned Rust 1.98.0 toolchain's formatting. This is source hygiene, not an installed application pass and not authorization to merge experimental Linux Cognitum or IPC code. When the active NSIS attempt concludes, reconcile this formatting change with the six-gate Windows candidate and rebuild only if compiled-source identity actually changed. GitHub records the source/evidence; it is not the development hub.
