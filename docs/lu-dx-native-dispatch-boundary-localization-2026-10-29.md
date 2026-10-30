# DX-15C — Localize an observed native dispatch response gap

## Goal
After DX-15B records real `native-tool-dispatch-entered` and
`native-tool-dispatch-returned` checkpoints, Lu can distinguish a
pending tool-dispatch response from generic model-loop uncertainty.

## Implementation
- When exactly one native tool invocation remains in flight, and the
  host turn has not reported a terminal checkpoint, return a bounded
  `in_progress` finding with `native_tool_dispatch` region and
  `await_native_tool_dispatch_return` as its next probe.
- When the same turn then reports `native-turn-failed` without a
  dispatch return, report `bounded_host_boundary` with first
  unobserved `native-tool-dispatch-returned` and next probe
  `inspect_native_tool_dispatch_journal`.
- Do not claim the tool failed, was allowed, or caused the host error.
  The missing response could reflect a timeout, failed callback, worker
  crash, unexpected result path, revoked task, or incomplete evidence.
- Preserve cancellation precedence, terminal fail-closed checks,
  missing-checkpoint accounting and the lack of assistant save/render
  proof.
- Rust host-journal tests and frontend export/description fixtures check
  both statuses, reject mismatched findings and reject an in-progress
  finding once dispatch returned.
- Run Windows x64 host-only diagnostics and frontend/desktop validation.

## Non-goals
No new authority, execution control, Protobuf worker clock, causal parent
link, raw tool arguments, or inferred rollback. This is host-only
fault-proximity evidence, not automated diagnosis. It remains independent
from DX-15A/15B actual dispatch proof and the installed Windows NSIS gate.

Stacks on DX-15B PR #80; protected main, AX/Cowork, Cognitum and personal
Windows user profiles remain untouched.
