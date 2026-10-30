# Lu DX: live host-only fault-boundary finding

## Status and scope
After Windows DX-Protobuf causal contracts and WebView2 operator export passed, Lu still
lacked a direct interpretation of its *actual* host passive event ring. This
change adds a **conservative, typed Rust host-only finding** to the existing
`lu_inference_diagnostics` read-only Tauri IPC response, and a strictly
allowlisted `hostFinding` field in the operator's JSON export. It does **not**
claim to convert the partial host ring into a complete Protobuf `DiagnosticTrace`.

The host journal is single-active-turn and trace-ref scoped; the frontend
cannot request a different permission scope, supply events, grant authority,
or change what the host recorded. If a snapshot has no accepted turn, missing
or overwritten events, an unexpected stage, invalid stage order or stale
admission, the result is `insufficient_evidence`. UI exports discard
unknown finding fields, unknown codes, malformed hosts, and inconsistent loss
counters instead of serializing raw errors.

## What a model-loop failure can now say
Observed: `native-model-loop-entered`, then `native-turn-failed`, without a
`native-model-loop-returned` checkpoint. Output:
`status=bounded_host_boundary`,
`lastObserved=native-model-loop-entered`,
`firstUnobserved=native-model-loop-returned`,
`faultRegion=model_or_tool_continuation`,
`nextProbe=inspect_engine_and_native_tool_journal`.
**This is not a definitive backend failure**: the fault could involve the
engine, native tool invocation, cancellation, journaling or continuation.

Observed `native-turn-succeeded` means only host-side completion. It does not
prove `assistant_saved` or `assistant_rendered`. No cross-worker timings
or root-cause confidence are invented. A cancellation signal never certifies
worker termination.

## Acceptance
- Unit tests construct **real** `PassiveTraceJournal` objects and validate
  bounded model failure, host completion, lost evidence, fresh-turn isolation,
  and cancellation ambiguity.
- Windows x86-64 Rust CI executes these tests with Clippy `-D warnings`.
- Frontend unit tests ensure that exported host findings are allowlisted,
  exclude paths/exceptions, and reject mismatched dropped-event counters.
- Desktop Integration CI must compile Lu's Tauri diagnostic IPC.
- An installed Windows 11 or signed NSIS build that contains this branch has
  **not** yet been tested. Existing AX installer PR #62 does not contain it.

## Follow-on
Wire Protobuf causal events and durable assistant persistence/render evidence
to a future full `DiagnosticFinding`. Keep this weaker host-only signal
separate; do not silently promote it into a proven causal trace. Review the
DX/AX branch interface before bundling for Windows Alpha. No Cognitum,
protected main or personal Windows profile changes.
