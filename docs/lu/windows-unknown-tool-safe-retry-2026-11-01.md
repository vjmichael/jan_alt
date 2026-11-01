# Lu Windows alpha — safe unknown-tool model retry

2026-11-01. Isolated source candidate `work/lu-win-unknown-tool-retry-20261101`, not an alpha or production release.

The exact unchanged installed NSIS [run 41260381155](https://github.com/vjmichael/jan_alt/actions/runs/41260381155) recorded one saved USER, one real model output and one parsed model reply, followed by **`Catalog(UnknownTool)` rejection**, zero native tool dispatches and no saved assistant. This happened on a basic greeting using the tiny pinned Qwen2.5 0.5B GGUF.

**Fix, without compromising host authority:** The host continues to reject a tool name absent from the advertised catalog and durably audits the rejection. *Only when the rejected error is `Catalog(UnknownTool)`, the task remains live and the native step count is unchanged* may the host append a fixed, small instruction to the model transcript and request **one more generation**. It never feeds the rejected model output/name back into trusted instructions, grants no new scope, bypasses no JSON/Protobuf/permission check, and never retries effects that may already have dispatched. Invalid tool names are not executed. If the second reply is still invalid, the turn fails. Normal greeting replies remain final text; real tools still require advertised exact names and host-bound authority.

Two deterministic tests check a model's unknown tool → safe final recovery (with a durable REJECTED audit and zero tool effects), and repeated unknown tool → terminal failure after exactly two generations. Existing model/tool continuation and boundary tests must still pass under Rust 1.98 on Windows and Ubuntu. The source-only verification is not installed-GUI acceptance. After those tests pass, a **fresh NSIS** containing this Lu Core correction must be built and run through the real GUI model/tool/SQLite/cold-restart acceptance before closing Gates 2–4.

No Cognitum, experimental IPC, Jan bootstrap, or user Windows machine is changed. GitHub is a source and independent test archive, not Lu's development hub.
