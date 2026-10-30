# Lu Linux L3 — Tiny-LLM F16 qualification (2026-10-30)

## Source and integrity

- ChatGPT Library file: /Jan Mod - Lu/Delivered/Tiny-LLM.f16.gguf. Model bytes were not committed to GitHub.
- Exact file size: 26,704,640 bytes; SHA-256: c0b0647e22cf25ba347adbbcb241ff1f02b3223717822bbddcb9948d9f9f1cac.
- GGUF v3, 12 tensors, 39 stored metadata entries; F16 Llama architecture, metadata size label 13M, one transformer block, hidden width 192, FFN width 1024, 2 attention heads, 1 KV head, context window 1024, 32,000-token vocabulary.
- Metadata source: https://huggingface.co/arnir0/Tiny-LLM ; distribution metadata: https://huggingface.co/mradermacher/Tiny-LLM-GGUF . Embedded license says MIT, not independently audited.
- Native engine: pinned llama.cpp commit 7fe450e19305b828c199d602c23a8337aaa1f03b; packaged Linux CPU llama-server SHA-256 88b982ecde925e91a1bee4fd2cf0a8185f03a7b7f5b9db622a671ba550fa3972.

## Verified local execution

| Gate | Outcome |
| --- | --- |
| Engine startup | PASS; HTTP health 200, ~0.31 seconds startup in this container |
| No-key completion | PASS; rejected with HTTP 401 |
| Native completions | PASS; two HTTP 200 responses, 24 generated tokens each |
| Lu persistent Rust adapter | PASS; LU_PERSISTENT_GGUF_TWO_TURNS_PASS; 2 turns, 126 output bytes, one engine process |
| Lu P3 Protobuf supervisor | PASS; LU_P3_SUPERVISOR_GGUF_PASS; 2 turns, 126 output bytes, same process, decoded lifecycle and unload |
| Resilience opt-in guard | PASS; exit code 1 without LU_LINUX_TEST_ALLOW_KILL=yes |
| Resilience opted-in test | PASS; in-flight cancellation, clean unload, test-owned PID crash detection, explicit reload and subsequent generation |
| Source build sanity | PASS; patched Linux resilience example compiles offline with Rust 1.98.0 and cargo fmt --check |

Server was loopback-only, used a new ephemeral 256-bit API key, CPU-only execution, two threads, 512-token test context and no Web UI. Test-owned server processes were cleanly stopped.

## Engineering fix

The existing Linux resilience smoke mislabeled *all* tested GGUF files as synthetic_smoke. For a real pretrained Tiny-LLM this was misleading. Commit e10f566 changes the output token to model=gguf_smoke. Both guard-failure and explicitly authorized resilience paths were rerun and passed.

## Explicit non-acceptance

Generated text is often incoherent, which is unsurprising at ~13M parameters. This verifies model loading, native inference, Protobuf framing, persistent-engine lifecycle, scoped cancellation and reload; it does NOT verify intelligent conversation, model-generated native tool calls, UI operation, a .deb, or Windows acceptance. Never infer model quality or tool-call pass from a successful token-generation smoke.

The Linux GUI still needs Debian 13 GTK/WebKit and related build dependencies, currently available in short-lived GitHub artifact 13004627204: https://github.com/vjmichael/jan_alt/actions/runs/41114018046/artifacts/13004627204 . The original source model and this evidence remain distinct from the model-generation tool-call gate.

Branch discipline: confined to linux/lu-native-dev-20261030; protected main unchanged.