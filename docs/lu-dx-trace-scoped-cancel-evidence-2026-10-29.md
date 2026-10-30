# DX-09 — Trace-scoped cancellation evidence (Windows)

## Identified problem

DX-08 rejected late/conflicting host terminal checkpoints, but the desktop's
cancellation path still called `record_current_cancel()`. That journal method
used whichever trace happened to be active, with no mandatory trace-reference
argument. Cancellation authorization correctly checked `turn_id` and the active
model session in a separate host-owned task map; its **evidence write**, however,
did not carry the matched trace identity. A future refactor or admission failure
could therefore misattribute an observation to an unrelated trace.

## Change

- Under the existing active-turn mutex, cancellation now obtains the exact
  optional host-minted trace reference stored with that task.
- It signals the task as before and records `CancelSignalled` **only through**
  `PassiveTraceJournal::record(reference, ...)`. No accepted reference means
  no event is attributed to the old ring.
- Remove `record_current_cancel`, eliminating the identity-less writer.
  The journal already ignores stale references and marks late same-turn
  checkpoints after a terminal event as compromised evidence.
- Tests exercise a wrong-reference cancellation, valid cancellation, prior-turn
  cancellation after new admission, and cancellation after terminal success.

## Boundaries and acceptance

This change does **not** modify authority, cancellation semantics, supervisor
termination, worker acknowledgment, model selection, filesystem permissions or
Cognitum. The trace reference remains correlation only, **not authorization**.
The cancellation response still means **signalled**, not process terminated.
A failed or contested collector write remains insufficient evidence; no
response persistence or render is certified by these host-only tests.

Required checks: native Rust diagnostics tests and clippy/rustfmt on Windows x64;
Windows desktop Tauri build covering the changed cancellation path; native
frontend consistency tests; original Windows WebView2 GGUF and installed NSIS
acceptance are separate gates. The DX host workflow on this branch contains
the existing Windows native file fixture repeat gate.

This stacked branch starts from DX-08 PR #69. Protected `main`, AX/Cowork
extraction, existing user Windows profiles and AppData are untouched.
