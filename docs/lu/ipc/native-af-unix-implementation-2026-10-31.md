# Lu native AF_UNIX prototype — IPC-00/01 engineering evidence

2026-10-31. Branch: lu/ipc-common-af-unix-20261031.
**Experimental carrier only; not linked to the main Tauri application, production worker manager, or Cognitum.**

## Source ancestry / outstanding D01 reconciliation

- Common branch starts from Lu Linux native test host f0238c63c9c0b18b689f60fa3ab3009ba83aaf48 and the handoff-only commit 4f42f54886061e19d48a6af923a447588aa4cc54.
- Archived local L16 Preview7 source SHA-256: 40c017b98e0034277c18109bc0e9b2096a5c5fe4df0772c8a47188f739ba581b.
- Archived local native test-host P0 overlay SHA-256: 29e7690d97ab7018e5499a0066a767bb9eccba4f63b9229a5f704d44d8d07b71.
- L16 archived src-tauri/src/lib.rs Git blob f13695ef8813949e1e3ed15955759c14d8c8e657 differs from the common branch's original 4aefca66d2e9e67f3edd64d3ac323fac3d4ab106. No unreviewed source transplant is permitted.
- The later D01 Lu/Cognitum development checkpoint Cognitum_Lu_Native_Dev_D01_2026-10-31.zip was not available in accessible working copies or Library search. The unconfined lu-cognitum-dev-native bridge is NOT reconstructed from memory. IPC-00 remains PARTIAL / BLOCKED on exact D01 source and feature/hash audit.

## Implementation boundary

- Standalone src-tauri/lu-ipc-common (not in Lu's Cargo workspace or any shipping installer).
- Native AF_UNIX/SOCK_STREAM on Linux using standard Rust UnixStream. Native Windows Winsock AF_UNIX/SOCK_STREAM via stable socket2 0.6.5; no WSL, Cygwin, Docker or TCP.
- Framed exact existing Lu lu.v1.ToolCall and ToolReply Protobuf **bytes**: big-endian u32 length followed by payload. Reject empty, >4MiB, truncated frames; bounded deadlines for admission and socket read/write.
- Decoding/generated Protobuf validation is NOT done by carrier. The trusted Lu host must decode lu-core wire, enforce contract_version, saved user-turn provenance, conversation policy, tool/effect scope and journal before dispatch.
- Linux endpoint parent must be a physical private mode-0700 directory. No blind unlink of pre-existing path; Linux listener drop removes only its originally bound inode. Windows ACLs/reparse-safe endpoint protection and cleanup are NOT verified.
- Connection does not authenticate a caller. This carrier carries no authority or unconfined-worker privileges. Socket shutdown alone does not kill native-worker descendants.

## Evidence

Independent local Linux harness with isolated user-provided Rust 1.98.0 (no system Rust changes): **7 native AF_UNIX tests passed** (real Protobuf bytes, four clients, oversized/short framing, partial I/O, private path rejection, deadlines, inode replacement); offline Clippy -D warnings passed. Native Ubuntu 24.04 and Windows Server 2025 headless socket tests + Clippy both passed on [run 41242086732](https://github.com/vjmichael/jan_alt/actions/runs/41242086732), and the canonical generated-Protobuf change passed on [run 41242343177](https://github.com/vjmichael/jan_alt/actions/runs/41242343177). This certifies isolated carrier/admission/typed-envelope components, not production authorization, Windows ACL containment or worker cleanup.

| Gate | State |
| --- | --- |
| IPC-00 | PARTIAL; D01 source archive missing |
| IPC-01 | PASS: Linux local prototype and native Ubuntu 24.04 workflow run 41242086732 |
| IPC-02 | PASS: native Windows Server 2025 socket tests and Clippy run 41242086732; Windows ACL/peer identity still OPEN |
| IPC-03 | PASS (isolated): canonical lu-core schema generated, host-bound ToolCall/ToolReply negative and canonicalization tests passed Ubuntu+Windows in run 41242343177. Live Lu host/per-tool validation OPEN |
| IPC-04 | PARTIAL: one-time host-scoped credentials, revocation, expiry, replay refusals tested; protected OS launch credential transfer, peer identity and Windows ACL still OPEN |
| IPC-05 | Worker cancellation/host death/process-tree cleanup OPEN |
| IPC-06 | Actual Cognitum calc.rational host execution OPEN |
| IPC-07 | Windows alpha regression/release integration OPEN |

## Core independence and promotion policy

Separately adopt LCX Lu Chat Runtime Independence: Lu-owned chat transport, sessions, persistence, conversation authorization, memory/tool execution and diagnostics. Retain Jan visual components and notices as appropriate; do not retain Jan runtime control over Lu chat. The next stable release is a **candidate milestone**, not a permission to self-promote. A source-only test cannot make it stable: require installed Windows GGUF/model/tool/journal acceptance, real host-authorized socket gates, rollback safety and explicit user release approval. The first native-only NSIS run 41235830176 packaged an installer and passed the zero-Jan/Bun/UV installed inventory but its model/tool journal assertion failed (6 vs expected 7 records); stable promotion is blocked.

GitHub is a repository and CI evidence archive, not the primary development environment. Keep Cognitum code separate; only a typed host adapter can integrate after IPC-06 passes.
