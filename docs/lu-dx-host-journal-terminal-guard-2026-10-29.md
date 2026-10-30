# DX-08 — Host journal terminal integrity and independent file-tool smoke

## Why

DX-07 proved that **interpretation** must reject contradictory terminal
checkpoints. That is not proof that the real native tool loop sends two
conflicting completion results. The production host currently calculates
its completion event once, using a single `succeeded` outcome branch.
But evidence recording is deliberately nonblocking and may receive late
observations (including a cancellation signal) after the host terminal
event; earlier DX journal behavior allowed these events to be appended.

This change adds a guard **where the passive trace is recorded**. Once the
journal records `native-turn-succeeded` or `native-turn-failed` for a
specific host-minted trace reference, any additional same-trace event,
including a second terminal result or a late cancellation signal, is
rejected. Crucially, the journal increments its bounded evidence-loss
counter rather than silently dropping the contradiction; the interpreter
already refuses to localize any trace with missing/compromised evidence.
This is not a repair of inference, conversation saving or model state.

A newly admitted turn resets the guard. Observations for an earlier trace
reference are ignored, and cannot corrupt the current trace. Missing
collector locks still cause explicit evidence loss without blocking the
worker.

## Real Windows CI fault separated from DX

Lu native agent tool-loop run `40990889960` failed on Win32 error 183
(`AlreadyExists`) while creating a **test fixture** subdirectory in
`model_native_files.rs:37`. This reproduces the known temporary path
collision, not a newly confirmed native tool execution failure.

Import the exact tested fixture code from `lu/win-native-file-fixture-race-20261029`,
which passed 20 full runs / 48 parallel fixture creators on Windows CI
run `40983824157`. CI on this DX-08 branch repeats the full native file
tests 20 times to ensure the fix works within the active diagnostic stack.

## Regression requirements

- A real `PassiveTraceJournal` creates one accepted host trace.
- Successful host completion without later observations reports
  `host_turn_returned`, meaning **host-only success**; it does NOT attest
  response persistence or render.
- A later failed or cancellation checkpoint after success must increase
  `droppedEvents` and cause `insufficient_evidence`.
- A newly accepted host trace must not inherit the previous turn's terminal
  state, and stale previous-turn records must not contaminate it.
- Windows x64 `passive_localization` and
  `passive_diagnostics::journal_internal_tests` must pass with strict
  Clippy and rustfmt.
- Windows x64 `model_native_files` must pass 20 repeats.
- License provenance, desktop TypeScript build and the original real
  WebView2 host-finding gates remain independent.

## Safety and scope

This is a fail-closed diagnostic confidence mechanism, not a new policy
authority. Trace references are never authorization tokens. No raw prompts,
paths, model output or untrusted error strings are collected. A lost or
conflicting checkpoint produces an **unknown**, not an invented successful
result or a made-up root cause. Installed Windows 11 NSIS acceptance has
not yet been claimed for this branch. Protected `main`, Cognitum and user
Windows profile are unchanged.
