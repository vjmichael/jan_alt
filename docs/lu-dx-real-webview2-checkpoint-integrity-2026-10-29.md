# DX-11 — Real Windows WebView2 host checkpoint integrity acceptance

## Scope and purpose

DX-09 and DX-10 introduced trace-scoped cancellation and contiguous host
checkpoint verification in the diagnostic journal, Rust localization and
desktop export/display validation. Passing headless Rust and Vitest does not
prove that the installed WebView2 UI and actual GGUF host loop agree on a
single trace. The next gate exercises them together in a disposable Windows
2025 runner and an isolated test-only Lu profile.

## Implementation

- Enable the inherited real GGUF WebView2 operator diagnosis acceptance job on
  `lu/dx-webview2-checkpoint-integrity-20261029`.
- Reuse the checksum-sealed native `llama-server.exe`, pinned Qwen 0.5B test
  model, native Tauri/WebView2 application and existing authorization-denial
  and cancellation checks; no mock host trace is injected.
- A legitimate accepted zero-loss host trace must start at sequence 1 and
  include every adjacent ordinal, with nondecreasing measured elapsed time.
- The actual UI **Export diagnostics** Blob must also include an accepted,
  zero-loss, contiguous host trace with a finding that matches the host
  finding; operator **Check diagnostics** must display the matching fixed
  wording and must never reveal model/user identifiers or raw errors.

## Interpretation

A green result proves the specific real-GGUF WebView2 host-only observation
and operator route. It does **not** prove assistant response persistence,
successful tool answers, causal cross-process Protobuf trace, actual native
worker termination/relaunch, or signed Windows 11 Enterprise NSIS acceptance.
Those remain independent gates. A red test indicates an observed failure
requiring log investigation, not automatically a model or tool defect.

The debug test runner must not read or write the user's personal Windows
profile. AX/Cowork extraction, Cognitum and protected main are untouched.
Stacks on DX-10 PR #71; do not merge without exact-SHA green checks.
