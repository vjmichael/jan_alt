# DX-13 — Protobuf diagnostic trace continuity, zero-loss evidence

## Problem

The existing native Protobuf v2 diagnostic decoder checked strictly
increasing sequence numbers and valid causal parent references. However,
a fragment could omit a checkpoint and *reparent* later events to an
earlier one, then claim `dropped_events=0`. Host-only DX-10 prevented this
in the passive ring, but the typed Protobuf contract was still weaker.

## Change

- Require a zero-loss typed diagnostic trace to begin at sequence 1 and
  advance one ordinal at a time. Use checked addition to reject overflow.
- Keep permitting traces with explicit `dropped_events>0` and gaps;
  localization already marks these as insufficient evidence, never complete.
- Test deleted middle checkpoint with rewritten parent, deleted prefix,
  unreported skipped ordinal and explicit loss. Update the previous synthetic
  localizer test to expect protocol rejection rather than guessing a cause.
- Run targeted Windows x64 typed Protobuf contract and causal localization
  tests and strict Clippy, as well as all-targets Rust CI.

## Limits

This is a **typed contract integrity gate**, not actual cross-process
instrumentation. It does not prove that worker events are emitted, that
assistant messages persist/render, or that inference succeeds. A model
cannot provide diagnostic authority or trace IDs. Keep DX-11/12 host-only
WebView2 acceptance and installer evidence separate. No modifications to
protected main, AX/Cowork, Cognitum or physical Windows user profiles.

Stacks on DX-12 PR #73.
