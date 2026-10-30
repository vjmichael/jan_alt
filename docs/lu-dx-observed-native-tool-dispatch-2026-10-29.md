# DX-15B — Observed native tool-dispatch boundaries

## Why
DX-15A converts real Lu host checkpoints into a deliberately partial
Protobuf v2 diagnostic witness. It previously could not distinguish model
generation from actual native tool dispatch.

## Changes
- Add a content-free host callback at the real
  `ConversationAuthority::dispatch_bound` call in
  `NativeToolTurn::handle_model_reply_observed`. Entry is recorded only
  after native tool-call encoding and advertised-tool checks; malformed
  model JSON and final text do not produce fake dispatch checkpoints.
- Record a corresponding return immediately after `dispatch_bound` yields
  a response, even if the response represents denied/failed execution.
- Preserve all previously public unobserved APIs for existing callers.
  Lu desktop uses the observed journaled runner with an exact admitted
  host-owned trace reference and no raw model data.
- Include `native-tool-dispatch-entered` and
  `native-tool-dispatch-returned` in the strict Rust host ring,
  Protobuf witness projection, and frontend redacted-event allowlist.
  Reject unpaired, overlapping, or out-of-order observations.
- A deterministic actual native Protobuf file-tool test checks exactly
  one entry/return across model generation, authorized dispatch, durable
  feedback journal and a final continuation. Host and frontend negative
  fixtures reject fabricated return/unfinished dispatch.
- Windows x64 host diagnostics workflow explicitly runs the real
  native dispatch fixture and strict Rust/core checks.

## Evidence limits and security
A dispatch entry proves the bound dispatcher was invoked; it does NOT
prove the individual tool was authorized or its side effects succeeded.
A return proves a response was received from dispatch; it can be a
denial or failure and does not prove rollback. Model text, argument
paths, call IDs and user content are never copied into diagnostics.
No worker OS clock, process exit, assistant save/render, or causal
parent link is synthesized. `parent_sequence=0` in the projected
typed witness remains intentional.

Windows WebView2 GGUF acceptance remains independent. Real model outputs
might contain no tool call, so the GUI test must never inject a phantom
dispatch to manufacture success. The deterministic native tool fixture is
the specific evidence for native dispatch entry and return.

Protected main, Cognitum, AX/Cowork extraction and personal Windows
profiles remain untouched. Stacks on DX-15A PR #78.
