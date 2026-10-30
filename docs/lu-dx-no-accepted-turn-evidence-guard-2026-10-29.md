# DX-15F — Empty host trace invariant

A `lu.native.host-trace.v2` snapshot with `recordingState=no_accepted_turn` cannot contain checkpoints or a trace reference. The Rust passive journal emits an empty ring in that state. If an unexpected host response carries stale checkpoints while claiming no turn was accepted, the WebView sanitization now returns `unavailable` rather than exporting a seemingly valid current trace.

The regression test retains the valid empty snapshot and rejects both a stale success event and a contradictory trace reference. This is a boundary consistency check, not a new observation or authority grant. It does not prove cold restart, worker termination, diagnostic overhead, or installed Windows Alpha acceptance.

Stacked on DX-15E and the W05 profile probe fix. Exact-head frontend and Windows desktop tests remain required before claiming verification.
