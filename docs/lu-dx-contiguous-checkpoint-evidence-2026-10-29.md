# DX-10 — Contiguous checkpoint integrity in Lu host diagnostics

## Fault class

DX-07 rejected contradictory terminal order, and DX-08/09 protected
the journal terminal and trace-scoped cancellation paths. A separate
integrity risk remained: the Rust host interpreter and the desktop export
validator accepted *strictly increasing* event sequence numbers even if
numbers were absent, while `droppedEvents` claimed zero. Thus a subset
of otherwise valid observations could be presented as a complete host trace
and used to claim `host_turn_returned` when a nonterminal checkpoint had
silently disappeared.

## Behavior

- The host-only Rust validator now requires the first event's sequence to
  equal 1 and every later event to have the immediate next integer.
- The desktop validator applies the identical rule before displaying or
  exporting any non-inconclusive host finding.
- A genuine ring overflow or dropped/contended event is **already**
  diagnosed as insufficient evidence because the journal increments its
  loss counter. This change rejects inconsistent zero-loss claims as well.
- Unit tests cover omitted first and middle checkpoints, forged gaps in an
  otherwise successful trace, and the unchanged valid contiguous path.
- No attempt is made to reconstruct missing observations, identify a root
  cause from gaps, trust model-authored evidence, or elevate a correlation
  reference into permission.

## Gates

Require Rust host localization tests and strict format/lint on Windows x64,
frontend Vitest/typecheck/lint, independent installed WebView2/NSIS
acceptance, plus unchanged DX-08 Windows native-file repeat acceptance.
This branch stacks on DX-09 PR #70. Protected main, AX/Cowork extraction,
Cognitum and user AppData remain unchanged. This is trace validation only:
it does not fix model inference, process termination or assistant persistence.
