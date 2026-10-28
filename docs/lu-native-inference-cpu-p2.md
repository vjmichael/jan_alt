# Lu Native Inference — CPU GGUF execution bootstrap (P2)

## Implementation and scope

The first concrete Lu-owned text execution backend lives in
`src-tauri/lu-core/src/llama_cli_backend.rs`. It implements
`InferenceBackend` and is driven by `InferenceHost`, not by Jan's inference
manager, Jan's llama worker, LM Studio, MCP, or a local HTTP service.

For the initial independently executable milestone it owns **one llama.cpp
`llama-cli` child process per generation**. A trusted build or install
manifest must supply a verified executable filename and SHA-256. The backend
checks the digest during construction and immediately before each generation.
The host explicitly provides a private directory for temporary prompt files;
model-generated text never supplies executable paths or process arguments.
The process uses fixed CPU-only arguments (zero GPU layers). No shell is used.

An admitted GGUF file is opened and kept accessible by a Lu-owned handle.
On Windows, `FILE_SHARE_READ` denies normal modification or deletion while
that handle is open. This is an important step beyond relying on a file's
size/mtime. Release hardening must also pin/verify any side-by-side DLLs,
verify signature/provenance of the complete engine package, and prevent
filesystem replacement races across the executable and model before activation.

The CLI stdout is read incrementally as UTF-8 with split-codepoint handling,
a total output cap, and a bounded stderr tail. A watchdog kills the child when
a host cancellation signal arrives or the generation deadline expires.
Lu cleans up the private prompt file after normal completion or error.

## Important limitations

- This is an **actual inference adapter**, not merely an engine interface.
  However, real GGUF loading and generation require a successful end-to-end
  smoke test: see `.github/workflows/lu-native-cpu-inference.yml`.
- `InferenceBackend::load` pins and validates the selected GGUF; **model
  weights are not loaded into llama.cpp until `generate` starts**.
  The one-shot CLI relaunches and reloads model weights for each request.
  Production Lu needs a long-lived Lu-owned engine for good latency and KV reuse.
- `TokenChunk.index` currently numbers emitted UTF-8 stream chunks, not
  tokenizer IDs. No claim of token-level accounting or timing is made.
- Neither the frontend nor the native-Protobuf inference wire contract is
  connected to this backend yet. A UI model-loading button cannot be treated
  as a Lu-owned inference pass until that integration is complete.
- Companion `mmproj` GGUF admission is implemented separately. This
  CPU text-only adapter does not load projectors, images, audio, or video.
  Future multimodal execution must validate base-model/projector compatibility
  in the selected llama.cpp backend and route structured media securely.
- A trusted per-user prompt directory is required. Temporary prompts are
  plaintext within that directory during execution; a future streaming
  IPC/engine ABI should eliminate temporary prompt files.
- Tests using a fake backend establish only lifecycle semantics. The real
  smoke test uses checksum-pinned SmolLM2-135M-Instruct Q4_K_M GGUF and builds
  the exact upstream llama.cpp commit
  `7fe450e19305b828c199d602c23a8337aaa1f03b`
  on a disposable Windows runner. Its success must be verified by a completed
  CI run before being recorded as PASS.

## Next implementation gates

1. Complete core Rust tests and the real-model CPU smoke, resolve any compile
   or runtime failures, and bring the existing `cargo fmt --check` gate green.
2. Provide a **long-lived** signed, Lu-owned native engine (in-process binding
   or supervised worker with pinned protocol) rather than reloading GGUF per turn.
3. Define generated Protobuf inference commands, generation events, cancellation
   and diagnostics, with host-owned model identity and memory budgets.
4. Integrate into Lu Desktop model manager and conversation streaming.
5. Test Windows installation, crash recovery, conversation persistence and a
   real model-generated native tool call before removing inherited Jan paths.

## Persistent Lu-owned GGUF execution (P2 second increment)

The previous one-shot `LlamaCliBackend` is retained for baseline comparison.
[`PersistentLlamaBackend`](../src-tauri/lu-core/src/persistent_llama_backend.rs) is a separate
implementation of the same `InferenceBackend` trait, with one supervised
`llama-server` process **started at model load** and **retained through
multiple generate calls** until explicit unload or backend drop.

For the Windows CPU acceptance test, the exact upstream llama.cpp Git commit
is built into both `llama-cli.exe` and `llama-server.exe`. Their SHA-256
hashes are computed on the disposable runner and checked by Lu before
launch. The server binds only to 127.0.0.1 at a host-assigned ephemeral
port and requires a separately generated 256-bit API key. Lu uses a bounded
SSE/chunked-response parser to stream generated pieces, and requests
`cache_prompt=true` to permit KV reuse where the backend supports it.

The smoke test `examples/persistent_llama_smoke.rs` sends two distinct
prompts using one `InferenceHost` instance and asserts that its supervised
engine **PID stays unchanged** across both generations. This is direct
evidence of model process residency only once the CI test has passed,
not evidence of per-token cache reuse. Both engine entrypoints are tested
independently to preserve a useful baseline.

### Production hardening outstanding

- The loopback service is an **implementation boundary to llama.cpp**;
  internal Lu orchestration continues to require native Protobuf contracts.
  It is not an MCP server or a separately installed user-managed service.
- Release must pin the complete engine package, sidecar DLLs, and executable
  signing, not merely verify the EXE hash. Windows child process supervision
  should use a kill-on-close Job Object so descendants cannot escape.
- The server API key is passed on the process command line in this prototype;
  replace that with a protected key-file or other secret transport in release.
- Host-selected loopback port reservation has a bind race; startup identity
  attestation is needed before relying on the server's health response.
- Model file bytes are held against modification through a Windows
  share-read handle but a production manifest or immutable signed copy is
  required for full race and path identity guarantees.
- Cancellation checks the client-side stream; it does not yet implement an
  explicit server slot cancellation acknowledgment. Add verified cancellation
  and automatic restart/recovery tests before production.
- No GUI route, memory budget, Windows installer packaging, engine isolation,
  tool-calling integration or multimodal `mmproj` execution is claimed here.
  Keep these separately gated.

**Verification:** core contracts [40630864083](https://github.com/vjmichael/jan_alt/actions/runs/40630864083)
**PASS** on earlier P2 source. Windows real GGUF CI
[40630864077](https://github.com/vjmichael/jan_alt/actions/runs/40630864077)
**FAIL before inference**, owing to two unrelated Windows-unsafe CE test
temporary filenames. Those were fixed in commit
[`cc43342`](https://github.com/vjmichael/jan_alt/commit/cc433427e431458598a38abe66618e7c88e6c328).
The new two-turn persistent-model CI acceptance is **not yet verified**.
