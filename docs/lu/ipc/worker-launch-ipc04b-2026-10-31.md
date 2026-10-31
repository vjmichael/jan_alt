# Lu IPC-04B — experimental child-process launcher and OS test evidence

Date: 2026-10-31. Dedicated branch: lu/ipc-common-af-unix-20261031. Latest implementation source at commit ab6378b284c000f80ea72433c37f3bc5c096179a.

## What is actually implemented

The standalone unshipped crate now includes `launch.rs`, a test-only binary `src/bin/lu-ipc-worker-fixture.rs`, actual cross-platform child-process tests `tests/launch.rs`, and `ClientProof::deliver_bootstrap/receive_bootstrap` in `authority.rs`.

- The trusted-host test setup supplies an explicit absolute executable path and SHA-256 expected digest from its own configuration. The loader rejects relative paths, symlinks, empty files, oversized executables and digest mismatch. It rechecks the digest immediately before launching, but cannot yet guarantee the file did not change between final hash and OS execution (TOCTOU): OS-specific sealed execution and file-owner restrictions remain a separate hard gate.
- The launcher uses a single direct `std::process::Child`, no subprocess command arguments, and an anonymous inherited stdin pipe that carries the one-use 256-bit credential and binary-encoded AF_UNIX socket address. The pipe is not a filesystem credential, public file, environment variable or command-line argument; the payload is zeroized after writing, as is the received proof.
- The child independently initializes its process-local Windows Winsock API before native AF_UNIX connect, and performs the same one-use `ClientProof::prove` handshake. Host-held scope is not supplied by the child; it remains in `HostAdmission`.
- The fixture generates a canonical `lu.v1.ToolCall` for `read_text_file`, and the *test* trusted-host side validates the exact call/tool/workspace/type and generated `ReadTextFileRequest`. The host returns a typed `ToolReply`. **The test does not read a user file, dispatch a production tool, or execute a Cognitum operation.**
- The `LaunchedWorker` handle retains a host revoker; `stop` revokes before directly killing/reaping the child with a deadline. It does not contain a worker's descendants, survive a host crash, or handle journal effects. The crate stays outside app Cargo and all installers.

## Findings from native OS test matrix

| Observation | Result |
| --- | --- |
| Ubuntu 24.04 real process, private stdin bootstrap, authenticated AF_UNIX, typed exchange, direct-child cancellation | PASS in run 41243723634 |
| Windows Server 2025 real process, private stdin bootstrap, authenticated AF_UNIX, typed exchange, direct-child cancellation | PASS in run 41243723634 (native tests passed; separate Clippy failures were fixed in next source commit) |
| First native Windows child connection | FAILED: stage 23 (`Stream::connect`) |
| Windows OS error | `WSAEPROVIDERFAILEDINIT` (10106), while bootstrap handling succeeded |
| Root cause and correction | Aggressive `env_clear()` removed Windows `SystemRoot`, needed to initialize Winsock AF_UNIX provider in a freshly spawned child. Preserve only the host's validated absolute directory `SystemRoot` in the child environment; no tool text or credential gets added |
| After correction | Both Linux/Windows **native test suites PASS** in run 41243723634. The Windows Clippy `-D warnings` gate then found two Rust style lints in UTF-16 path chunk decoding; fixed in commit ab6378b284c000f80ea72433c37f3bc5c096179a |
| Final all-targets Clippy retest | Run 41243846951: **PASS on Ubuntu 24.04 and native Windows Server 2025**, including actual worker tests and Clippy all-targets with warnings denied |

[Native test evidence / initial follow-up lint gate](https://github.com/vjmichael/jan_alt/actions/runs/41243723634) · [Native final all-targets retest](https://github.com/vjmichael/jan_alt/actions/runs/41243846951)

The worker does not print credential material, paths, inputs or stack traces. Test-only Windows exit codes localize bootstrap/read/connect/proof/typed reply stages without reporting sensitive strings.

## Unfinished IPC-04C/LCX gates — DO NOT SHIP

1. Host process must approve and pin executable identity using an OS-backed, non-replaceable executable staging/handle scheme with suitable Windows owner ACL and Linux directory/ancestor ownership; a SHA-256 checked by path before spawn is not immune to a racing replacement.
2. Validate OS peer/process identity and endpoint security. Possession of the bootstrap proof is not equivalent to permission to join a Lu conversation. Windows AF_UNIX endpoint security/reparse protection must be independently tested.
3. Contain descendants: Windows Job Object with kill-on-close; Linux process group or cgroup with rigorous fork/daemon escape tests; bounded shutdown and host death cleanup. The current `LaunchedWorker::stop` kills only its own direct child.
4. On each read, trusted *Lu Desktop* must supply the active saved-turn scope, decode per-tool payload under registry schema, enforce per-turn tool and resource grants, cancellation and effect journal. No model, webview, extension or worker may self-issue authority.
5. Correlate diagnostics and persist durable recovery. Verify kill-during-effect and process host-crash behavior without contradictory success checkpoints.
6. Install real Windows Lu alpha, load actual GGUF, run ordinary chat, execute genuine native Lu tool, persist chat/effect journal and cold-restart. Only then consider a stable candidate, with explicit user approval.

Do not merge this branch wholesale into the independent Windows alpha branch. The crate intentionally remains standalone and not installed. GitHub is a source/evidence archive, not the development hub.
