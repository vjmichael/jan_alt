# Lu Engineering Handoff — Common AF_UNIX Transport (October 31, 2026)

**To:** Lu development conversation  
**From:** Cognitum / Lu-Linux integration work  
**Repository:** `vjmichael/jan_alt`  
**Dedicated branch:** `lu/ipc-common-af-unix-20261031`  
**Created from:** `lu/linux-native-test-host` at `f0238c63c9c0b18b689f60fa3ab3009ba83aaf48`  
**Status:** Handoff/design only. The branch has no common transport implementation or passing Windows socket tests yet. Do not infer acceptance from the branch name.

## Decision
Prototype **one shared, versioned Lu IPC contract** on native `AF_UNIX/SOCK_STREAM` sockets on Linux and Windows x86-64. Prefer a common wire protocol and host-facing interface, with OS-specific socket construction, endpoint access controls and worker lifecycle. Keep Windows Named Pipes as an evaluated fallback if AF_UNIX cannot satisfy the authorization or reliability gates; do not prematurely assume either result.

Windows 11 supports Winsock AF_UNIX, but Tokio's `tokio::net::UnixListener` is Unix-only and the Rust standard-library Windows Unix socket APIs are experimental. Prototype a stable Rust socket backend using `socket2`/Winsock; **compile and execute it natively on Windows GitHub CI** before adopting it. Use conventional Unix sockets on Linux. The actual data protocol remains identical.

## Ownership
- Lu owns local socket listener/clients, endpoint admission and authentication, versioned length-bounded Protobuf transport, per-conversation authorization, host-selected worker paths/artifact hashes, timeouts/cancellation, diagnostics, durable effect records, and worker supervision.
- Cognitum owns domain-specific C05/C10/C14 capabilities, strict typed inputs/results and numeric/causal evidence. It does **not** gain Lu JSON repair or conversation permission authority.
- Future DLC Core Extensions and DLC Workshop may use the transport, but this design does not authorize arbitrary downloaded DLC packages or enable native execution in release builds.

## Source reconciliation
The `lu/linux-native-test-host` GitHub branch may not contain the fully synchronized L16 Preview7 source. The later **D01 Lu–Cognitum Native Development checkpoint** is local/archive-first and includes an experimental `lu-cognitum-dev-native` bridge and private socket command; tests reported 71/71 Lu Core, 2/2 Linux syscall helper, and a feature-enabled desktop-library compile check. **Do not mistake that for a running socket-to-Cognitum end-to-end acceptance.**

Before implementing the shared transport, verify exact source ancestry, hashes, feature switches and compatibility with the latest local D01 development checkpoint. Do not overwrite Windows alpha or silently transplant stale Linux source. Keep an isolated worktree or source copy and document each merge/cherry-pick.

## Transport contract and implementation plan
1. Extract a platform-independent **LuLocalIpcTransport** interface covering bind/accept/connect/read_exact/write_all/shutdown/cleanup, bounded framed messages, protocol versions, cancellation, and OS error mapping.
2. Linux: `AF_UNIX/SOCK_STREAM` via stable Rust/Tokio, in a profile-private directory. Windows: native Winsock `AF_UNIX/SOCK_STREAM`, using stable supported crates or a narrowly audited Winsock wrapper rather than nightly-only APIs. No WSL, Cygwin, Docker, or TCP server.
3. Preserve the existing D01 test-host command envelope and Protobuf message semantics where possible. Do not define a second incompatible worker framing contract; establish length limits and deadlines on both directions.
4. Keep address/path construction, file or reparse-point checks, endpoint cleanup, socket handle inheritance, and peer identity checks behind OS-specific implementations. No Linux-only `SCM_RIGHTS` or `SO_PEERCRED` assumptions on Windows; Windows AF_UNIX does not provide equivalent ancillary transfer.
5. Authenticate each connection using **host-controlled, profile-bound** credentials/tokens and OS-specific endpoint authorization; enforce fresh session/replay checks, and bind every allowed action back to a saved authenticated USER turn, exact tool, effect, scope and host policy. A socket connection or knowledge of its path never grants tool authority.
6. Native worker termination remains independent of socket close. Linux: existing supervisor/watchkeeper/cgroup gates, with kernel descendant containment still unverified in the read-only-cgroup container. Windows: Job Objects with kill-on-close and host-managed recovery; verify process-tree cleanup in Windows CI. A lost socket never means an effect was safely rolled back.
7. All dev-only unconfined Cognitum worker execution remains behind isolated, explicit feature flags and host-controlled requests. The user's authorization to test Cognitum unrestricted in a dev copy does **not** authorize general third-party DLC execution, release-default bypasses, or arbitrary model-supplied executables.

## Proposed dedicated cross-platform CI
Add branch-scoped workflow `.github/workflows/lu-ipc-common-af-unix.yml`:
- Linux x86-64: `ubuntu-24.04` (pin runner image; `ubuntu-latest` is migrating during Oct–Nov 2026).
- Windows x86-64: `windows-2025` (or a verified Windows x64 runner).
- Stable pinned Rust toolchain consistent with Lu, e.g. 1.98.0; headless dedicated transport harness first, no Tauri desktop build prerequisite.
- Run **real local listener/client pairs natively** on each OS; cross-compilation or mock socket tests alone do not qualify Windows.
- CI runs on this branch and PRs; keep distinct from Windows alpha installer workflows. GitHub is a verification/repository lane, local development remains primary.

### Required acceptance tests
- Real two-way framed Protobuf message on both OSes with matching canonical payloads and correlation IDs.
- Version mismatch, malformed/truncated/oversized frames, byte-order and partial-I/O handling; bounded timeouts and backpressure.
- Endpoint access: other user/profile attempts, unauthenticated, replayed, expired or cross-conversation tokens; Windows ACL/reparse-point attacks and Linux symlinks.
- Concurrent clients, cancellation before admission and during work, restarted listener, stale socket path, aborted writer, duplicate request ID, response mismatch.
- Supervisor/worker death and descendants on Windows Job Objects and Linux supervision; no orphan process claimed cleaned without evidence.
- Actual fixed Cognitum `calc.rational` execution through Lu's authenticated host, then C10/C14 typed operations; confirm `lu_integrated`/isolation assurance flags are only host-set after true verification.
- Separate host policy audit trail and effect-journal invariants. Redact credentials and payload secrets from logs. No default TCP listener.

## Gates / exit criteria
**G0 Source:** reconcile pinned L16/D01 with the new branch and compile dependencies; record hashes.  
**G1 Transport:** native Linux + native Windows AF_UNIX builds and real listener-client tests PASS.  
**G2 Security:** OS endpoint access controls, authenticated user-turn and replay/permission denials PASS.  
**G3 Lifecycle:** cancelled/dropped/dead host worker behavior proven independently on both OSes. If Linux cgroup2 cannot be delegated, mark kernel descendant containment OPEN.  
**G4 Cognitum:** real Lu-host Protobuf C05 turn observed end-to-end on both operating systems.  
**G5 Integration:** no regression to Windows alpha, no release-default enabling, documented feature flags and audited PR for selective merge.

## Deliverables
A minimal reusable transport module, Linux and Windows backends, versioned framing contract, dedicated GitHub Actions matrix workflow, real Windows and Linux logs/artifacts, adversarial security tests, host-originated authorization/effect receipts, and a written accept/blocker table. Keep any fallback to Windows Named Pipes strictly inside the transport adapter if the native Windows AF_UNIX evidence is inadequate.

**Do not report this new branch as implemented, compiled, tested or merged until each claim has a real result.**
