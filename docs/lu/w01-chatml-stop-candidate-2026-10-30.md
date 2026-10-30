# Lu W01 / GGUF ChatML End-of-Turn Stop Candidate — October 30, 2026

**Status: source candidate only, NOT tested on real Windows GGUF; do not merge as a proven W01 fix.**

## Verified source issue

`supervised_tool_generation::start_prompt` builds ChatML instructions ending in `<|im_start|>assistant\n`, but `PersistentLlamaBackend::generate` previously submitted requests to llama.cpp's `/completion` endpoint without a `stop` array. The upstream `/completion` API supports a JSON array of stop strings whose matching words are excluded from generated completions:
https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md

Without explicit stop strings, a model can generate additional ChatML speaker delimiters before or after its JSON/prose answer. This is a **possible** contributor to malformed boundary output, not an established cause of the existing `model_reply_rejected` Windows failure. The parent Windows test must be read before making any stronger claim.

## Candidate source change

For the current ChatML-only native generation path, add `stop: ["<|im_end|>", "<|im_start|>"]` to the trusted host's immutable llama.cpp `/completion` request. Extract the request body to a small pure helper and test the emitted `stop` array, original prompt, token limit and stream mode. These strings are **output boundaries**, not tool grants.

The change does not alter tool JSON/Protobuf validation, the conversation-bound permission engine, journal semantics, model selection, installer logic, or UI error export. If a model produces malformed or incomplete JSON, it must still fail closed; stop strings do not authorize recovery of ambiguous tool commands.

## Evidence and caveats

- Branch: `fix/lu-chatml-stop-20261030`, stacked on PR #93 head `dd815b8c`.
- Source-shape verification of helper, invocation and unit assertions passed by readback.
- **Rust unit test not executed**: development environment has no Rust toolchain; GitHub Actions is at the included minutes limit.
- The previous Windows run 41065840459 failed with generic model rejection; a newer in-flight run 41069397256 on PR #92 may provide a more specific content-free rejection class.
- No new PR was opened to avoid automatic CI during the budget hold.

## Required next gates

1. Compile and test on exact branch head (`cargo fmt --check`, `cargo test --lib persistent_llama_backend`, supervised tool-loop integration and strict Clippy).
2. Run pinned Windows Process A and B with real GGUF, verify answer created/read back/rendered and restored in a new process.
3. Test tool-call JSON generation still dispatches **only** the intended authorized tool (not a role delimiter), and malformed requests remain rejected.
4. If the real W01 failure class is unrelated, do not call this change a W01 fix. Keep it as independently reviewable hardening.

The protected main branch remains unchanged.
