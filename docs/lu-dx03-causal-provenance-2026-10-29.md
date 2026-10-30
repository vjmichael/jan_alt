# Lu DX-03 — causal-provenance guard for diagnostic findings

**Date:** 2026-10-29  
**Ownership:** DX diagnostics; no AX/Cowork/Jan extraction edits  
**Branch:** `lu/dx-causal-provenance-20261029`, draft PR #59 against `work/lu-alpha01-diagnostics-priority-20261029`  
**Status:** Source and adversarial fixtures committed; automated tests and Windows runtime acceptance **not yet verified**.

## Fault found

The original `localize_normal_turn` checked whether every expected stage
appeared somewhere in the most recent attempt. Events that belonged to
disconnected parent chains, or occurred in the wrong causal order, could
therefore be combined into an incorrectly **Complete** operation. The failure
path similarly could borrow the elapsed time of a checkpoint unrelated to
the failed event. Both violate Lu's requirement to report only supported
fault proximity, not invent end-to-end success or causality.

## Remediation

- Keep the existing strict canonical Protobuf validation and attempt/clock-epoch
  constraints. They are necessary but do not themselves prove stage ancestry.
- Follow validated `parent_sequence` links within the latest attempt. A
  checkpoint advances the normal-turn proof only when it follows the previously
  confirmed checkpoint in sequence *and* is its causal descendant.
- A disconnected checkpoint produces **InsufficientEvidence**, never a
  fabricated complete turn; a detached failure cannot borrow an unrelated
  predecessor or measured interval.
- Keep live diagnostics read-only, bounded, content-free and non-authorizing.
  No model text, user identifiers, file paths or tool arguments are added.

## Deterministic new tests

1. A render success without a parent edge to the assistant write must stop at
   `assistant_saved` and flag the render as unconfirmed.
2. A transport invocation reported before the user's durable write must
   not complete the turn even if both stage codes appear in the trace.
3. A failure on a detached causal root cannot borrow another checkpoint's
   clock interval, predecessor label or observed-failure confidence.

## Validation and promotion gates

- Run `cargo fmt --manifest-path src-tauri/lu-core/Cargo.toml -- --check`.
- Run `cargo test --manifest-path src-tauri/lu-core/Cargo.toml --test diagnostic_contract --test diagnostic_localization`.
- Run the branch's existing exact-SHA Windows DX workflow (including Tauri
  compile) before integration. This working environment has no Rust toolchain;
  **none of these commands is claimed as passed here**.
- Follow with real disposable Windows native GGUF/WebView2 correlated traces,
  process restart, scope-denial, cancellation, assistant saved/rendered and
  event-loss tests. Synthetic regressions are **not** installed Alpha proof.
- Coordinate any future merged AX/DX Windows acceptance with Work, leaving
  protected `main` unchanged. Preserve Jan Apache-2.0 provenance.

## Scope exclusions

No Cowork removal, Jan source mutation, core authorization change, automatic
repair, external MCP, benchmarking or Cognitum code modification.
