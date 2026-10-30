# Lu DX-07: terminal checkpoint consistency and false-diagnosis regression

## Why this test exists

The DX-04 host-only interpreter and DX-06 operator UI are safe only if a
partial, stale or contradictory host trace **cannot** produce a false success
or a misleading fault location. The prior implementation checked that
individual stage codes, sequences and elapsed times were valid, but it
searched for any `native-turn-succeeded` anywhere in the snapshot. A ring
containing both `native-turn-succeeded` and `native-turn-failed` could
therefore report host success incorrectly. The frontend likewise checked
finding field allowlists without enforcing agreement with event chronology.

## Change

- The trusted Rust host interpreter rejects an incomplete or out-of-order
  model-loop return, more than one model-loop entry/return, a claimed success
  without a model-loop return, or any terminal checkpoint that is not final.
  Contradictory success and failure terminal observations become
  `insufficient_evidence`, never a success or fault attribution.
- The existing frontend `sanitizeLuHostFinding` additionally validates
  the host trace's monotonic sequence and elapsed time, terminal chronology,
  presence/absence of the model-loop return, and exact region/status/probe
  consistency for a claimed success, failure, cancellation or in-progress
  finding. It returns `null` rather than showing or exporting a false finding.
- Both sides preserve the original nonblocking host observation channel,
  no-path content-free event vocabulary, and fail-closed handling of dropped
  events. There is no new authority or tool permission.
- Rust and Vitest regression cases intentionally supply contradictory
  terminal checkpoints, impossible model-loop order and missing return
  evidence, as well as realistic valid traces. A rejected finding is not
  evidence of the underlying model's true cause.

## Acceptance

- Exact-SHA Windows x86-64 native Rust
  `passive_localization::tests` must pass, with strict Clippy and rustfmt.
- Exact-SHA desktop integration must pass the
  `web-app/src/lib/__tests__/luDiagnostics.test.ts` test (including new
  evidence-consistency cases), TypeScript and ESLint.
- License/provenance gate must pass. This branch stacks on PR #67.
- PRs #66 and #67 real GGUF WebView2 checks remain **independent**; this
  focused test is not installed Windows 11 NSIS confirmation.

No Cognitum files, user AppData, protected main or AX extraction files are modified.
