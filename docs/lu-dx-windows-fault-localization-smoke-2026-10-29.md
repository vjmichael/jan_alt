# Lu DX Windows x64 native causal fault-localization acceptance

## Motivation

The Windows WebView2 scoped GGUF run 40944293463 reached `native-model-loop-entered` and then returned `native-turn-failed`, not a successful native response. That observation bounded the issue but did not prove the engine-side root cause, complete trace correlation or installed Alpha acceptance.

DX-03 has a typed Protobuf v2 trace validator and conservative causal localization. This batch adds a **Windows x64** native witness and a synthetic failure-case regression that models the **observed stage boundary**, not an invented error code from the real run.

## Acceptance criteria

On the exact SHA of branch `lu/dx-windows-fault-localization-smoke-20261029`:

- GitHub Actions `lu-dx-windows-causal-smoke.yml` verifies an `x86_64-pc-windows-msvc` host.
- `cargo test --locked` runs `diagnostic_contract` and `diagnostic_localization` integration tests on Windows.
- The added model-loop failure fixture records an explicit, **synthetic** `backend_unavailable` event at the model-return boundary, and requires the locator to report `model_runtime` only, with `model_loop_entered` as last confirmed and `model_loop_returned` as first unconfirmed.
- When the same task's failed event moves to a new process clock epoch, localization **must not calculate a cross-restart elapsed interval**.
- `cargo clippy` rejects warnings in the targeted tests.

Do not count the synthetic backend failure code as evidence about the actual Windows GGUF fault: that run only established failure **after entry**. Don't equate Windows Server 2025 CI with Windows 11 Enterprise installed-NSIS acceptance. No diagnostic data from real users is needed for this fixture.

## Parallel gates remaining

- PR #59 DX causal contract CI, strict Rust clippy, and source provenance.
- PR #61 real WebView2 diagnostic export JSON redaction test.
- PR #62 installed Windows NSIS A → B → A profile restart; it is an independent lifecycle gate.
- Real GGUF turn completion with a host-minted trace ref, and integration of DX observation/findings into the Lu Windows installer.

Keep DX separate from AX until interface review; protected `main`, Cognitum and personal Windows profiles are not changed.
