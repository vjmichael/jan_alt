# Lu 2026-10-31 cross-platform IPC and LCX acceptance ledger

**Repository:** vjmichael/jan_alt. **Branch:** lu/ipc-common-af-unix-20261031 (isolated, not shipped).
**IPC-03 evidence head:** 57ec977e318f9ac855e6afb067a508c3b926f9dc. **IPC-04B source head:** ab6378b284c000f80ea72433c37f3bc5c096179a. This is not a Lu alpha or stable release declaration.

## Platform evidence

| Gate | Native Ubuntu 24.04 | Native Windows Server 2025 | Limit |
| --- | --- | --- | --- |
| IPC-01/02 AF_UNIX listener/client framing, timeouts and isolation | PASS | PASS | Headless transport only; no WSL/Docker/TCP |
| IPC-04A 256-bit one-use OS proof, host scope, expiration, revocation, spoof/replay denials | PASS | PASS | Credential possession does not establish peer process identity |
| IPC-03B Protobuf generated from canonical lu-core schema; exact ToolCall/ToolReply fields and canonicalization | PASS | PASS | No live tool dispatch or per-tool payload validation |
| IPC-04B actual spawned child, private inherited-stdin credential delivery, authenticated AF_UNIX ToolCall/ToolReply and direct-child revocation/exit | PASS | PASS (run 41243846951) | Test-only fixture, no actual model/native tool effect, no process-tree containment |
| Clippy all targets, warnings denied | PASS | PASS | IPC-04B source run 41243846951; isolated crate only |

Native evidence: [run 41242086732](https://github.com/vjmichael/jan_alt/actions/runs/41242086732) for 7a8a2e72, [run 41242343177](https://github.com/vjmichael/jan_alt/actions/runs/41242343177) for 57ec977e. Both Ubuntu and native Windows jobs completed successfully. The development container for this continuation lacked Rust/Cargo and direct Git network access; repository connector commits were validated by the independent native OS matrix. This is source and validation archival, not an intended permanent GitHub-first development process.

## IPC-04C OS containment development (source-only)

A new unshipped containment layer implements a Windows unnamed Job Object with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, and a Unix process group that sends SIGKILL to the group's descendants. A real Windows hard-host-death fixture verifies kill-on-close; Linux group tests verify ordinary descendant termination. A distinct Linux cgroup v2 path can be enabled **only** by passing an already delegated and writable host-owned parent. `cgroup.kill` and `cgroup.events` permit full subtree kill and drain checks, but an **actual delegated cgroup** was not supplied to ordinary CI. The cgroup positive test reports an explicit skipped marker, not success.

- IPC-04C-WIN: native process tree, normal stop, handle Drop, hard host death, and active-process drain **PASS** on [run 41244750621](https://github.com/vjmichael/jan_alt/actions/runs/41244750621).
- IPC-04C-UNIX: process group, `killpg`, descendant exit and handle Drop **PASS** on [run 41244750621](https://github.com/vjmichael/jan_alt/actions/runs/41244750621).
- IPC-04C-CGROUP: implementation and invalid-delegation test present; **positive live cgroup kill remains OPEN**.
- **Release-blocking:** current Windows worker is still created by `std::process::Command::spawn` and then assigned to the Job before proof delivery. A host crash in this small gap can leave an uncontained process; final release path requires atomic assignment at creation via `PROC_THREAD_ATTRIBUTE_JOB_LIST` or a comparably strong OS guarantee.
- Linux group-only mode can be escaped via `setsid`, and does not ensure full host-death cleanup. Untrusted CE workers require OS-enforced cgroup/namespace or equivalent with verified migration boundaries and recovery.
- Current containment tests do not prove Windows endpoint ACL/reparse security, peer OS identity, immutable executable staging, saved-turn host authorization, or actual Lu/DLC native tool effects. The crate remains disconnected from desktop and installers.

See [IPC-04C containment engineering report](worker-containment-ipc04c-2026-10-31.md) for failure modes, tests and follow-up gates.

## LCX — Lu Chat Runtime Independence

**User decision:** Migrate critical execution fully into Lu-owned code, keep appropriate Jan-derived visual components and Apache-2.0 attribution, and establish the next stable candidate only after real acceptance.

Observed source anchors on the separately maintained Windows branch lu/windows-alpha-followup-20261031:

- src-tauri/src/core/lu_inference.rs has Lu-native inference and saved-turn authority wiring.
- src-tauri/src/core/lu.rs has Lu-native file tool registry/adapter; direct old Cowork session IPC is intentionally restricted in Lu distribution, and normal Lu chat uses the saved-turn host bridge.
- src-tauri/src/lib.rs still registers substantial inherited Jan Tauri commands beside Lu commands. Full Jan-runtime independence is **not verified**.
- src-tauri/lu-core/src/conversation_authority.rs has dedicated authority contracts; production enrollment of every IPC boundary still needs evidence.
- docs/lu/windows-native-exit-2026-10-31.md records Lu engine normal-close/restart source changes, not a completed physical Windows abrupt-host-death containment proof.

**Required release gates:**

1. **LCX-00 execution ownership inventory:** Trace actual user send, saved user turn, host authorization, model generation, tool admission, registry, journal, saved assistant reply, and render. Identify the executed code path and any active Jan fallback at each stage.
2. **LCX-01 native routing:** Ordinary Lu chat must use Lu-owned host APIs only. Reject legacy Cowork session IPC in distribution; no webview/model command may mint filesystem rights or a worker.
3. **LCX-02 authenticated worker launch:** Pass credentials via protected host-owned inherited OS handle; verify Linux directory owner and native Windows ACL/reparse/peer process identity. Never place the token in argv, environment, or public files.
4. **LCX-03 typed authority:** Derive conversation, saved user turn, active tool, effect and cancellation from trusted host records. Validate actual generated Protobuf request payload before registry dispatch, then journal it. The isolated IPC-03B codec alone does not do this.
5. **LCX-04 cancellation/cleanup:** Verify cancellation, revocation, host death, process tree containment and durable recovery. A socket close does not terminate descendant workers. Need native Windows Job Object and Unix cgroup/process-group evidence as appropriate.
6. **LCX-05 installed Windows alpha:** Clean x86-64 installer with no external Jan, actual pinned GGUF model load, saved chat, real native file tool, authorized effect journal, clean engine PID exit, cold restart, recovered chat and no stale grants. Independently inspect installed dependency inventory.
7. **LCX-06 negative/rollback:** Deny cross-conversation/profile/tool and replay; reject malformed frames/path escapes; test crash during journal effects, double launches and restart. Preserve prior installer and rollback plan.
8. **LCX-07 stable promotion:** Requires reproducible Windows installed artifact, full gates and explicit release decision. No source-only workflow success substitutes.

## Integration and ancestry guardrails

The AF_UNIX branch derives from Lu Linux native host f0238c63, not the Windows alpha branch. Do not blindly merge or transplant desktop files. Exact D01 source checkpoint still needs reconciliation. Cognitum branch P46R7 reports recovery/hash verification of an earlier Lu P0 overlay, but this is not evidence that the D01 archive or the current Windows host source is identical. Cognitum remains an optional, typed Lu-subordinate capability.

Keep local Linux development and manual GGUF acceptance independent of CI availability. Use GitHub as repository, documentation and platform test evidence rather than the primary development hub.

**Current status:** IPC transport, one-shot admission, canonical typed envelope and an isolated spawned test-worker launcher are implemented; cross-platform test results for the spawned worker succeeded on run 41243723634. IPC-04B native tests and strict Clippy are now successful on both operating systems in [run 41243846951](https://github.com/vjmichael/jan_alt/actions/runs/41243846951). This does NOT establish full trusted Lu-host enrollment, secure OS peer identity, race-free executable attestation, Windows endpoint ACL enforcement, full process-tree cleanup, actual native tool effects, or the Windows installed alpha.
