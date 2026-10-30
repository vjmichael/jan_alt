# DX-15A — Genuine host-observation to typed Protobuf witness

## Engineering purpose

Lu's passive diagnostic ring already receives **actual native host
checkpoints** from its admitted desktop tool-turn. The Protobuf v2
causal-localization contract is separate and originally exercised only
synthetic fixtures. DX-15A connects them conservatively: a real
host snapshot is projected into a typed `DiagnosticTrace` and checked
through the production Protobuf codec.

## Implementation

- New Tauri-free `host_typed_evidence::bridge_observed_host_trace`
  converts only **known observed** host events, preserving original
  sequence ordinal, host elapsed time, host-minted reference, and
  explicit observations. It rejects missing ordinals in intact source
  rings; corrupt/absent admissions produce no witness.
- Unsupported host-only stages (recovery readiness, task registration,
  native host turn success, etc.) are not invented as other Protobuf
  stages. Their omissions increment the typed loss counter. Causal
  parents are always zero until an independently attested link exists.
- Actual host cancellation is represented as a request, **never**
  as proven worker termination. Host failure uses an explicit
  **unknown** failure category without relaying exceptions.
- The trusted primary WebView's `lu_inference_diagnostics` response
  now includes `typedHostWitness`, a content-free summary of the
  validated Protobuf projection with `scope=host_only` and
  `causalLinksObserved=false`; it does not expose a forged complete
  trace, tool data or file content. Invalid evidence is `insufficient_evidence`.
- Unit regressions cover genuine host journal events, source gaps,
  corrupted reference, redacted failure, cancellation, explicit
  loss, Protobuf encode/decode, and insufficient-evidence localization.
- Extend real Windows WebView2 GGUF host finding test to inspect
  the typed witness summary, along with existing export/operator
  findings. Run targeted Windows x64 Rust codec tests and core
  lint/format. No model session, tool grants, or worker logic changes.

## What this gate does NOT establish

This is the **first bridge to real observations**, not full
cross-process causal instrumentation. Desktop `spawn_blocking`
entry is not evidence of a separate worker process start, and the
host model-loop return is not assistant persistence, display or
native IPC return. A projected `DiagnosticTrace` is intentionally
insufficient for a completed-normal-turn diagnosis. Future DX-15
steps must instrument actual worker, tool dispatch, IPC delivery,
and assistant persistence/render with independently verified parents
and per-process clock epochs.

Stacked on DX-14 PR #76; protected main, AX/Cowork, Cognitum,
personal Windows profile untouched.
