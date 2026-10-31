# Lu IPC-04C — Windows Job Object and Linux process-group/cgroup supervision

**Date:** 2026-10-31
**Branch:** `lu/ipc-common-af-unix-20261031`
**Scope:** Separate nonshipping `src-tauri/lu-ipc-common` crate; NO production Tauri, Cognitum, installed worker or runtime policy change.

## Implemented

### Native Windows

- The host prepares an **unnamed, non-inheritable Job Object** with only `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, intentionally omitting breakaway flags. It assigns the worker process to the job before delivering the one-use inherited-stdin secret; therefore no authenticated model/tool request can be sent before assignment completes.
- `LaunchedWorker::stop` revokes the grant, terminates all job processes with `TerminateJobObject`, waits for the direct child, then queries `JOBOBJECT_BASIC_ACCOUNTING_INFORMATION.ActiveProcesses` until zero or the supplied deadline.
- Dropping the launcher handle closes the last job handle and kills remaining members. Separate native tests use a worker which spawns another executable process, and a disposable **host-death** process killed externally while it holds a live Job. The descendant must exit.
- Only the narrow `containment_windows_job.rs` wrapper permits audited unsafe Win32 calls. The main Lu transport code otherwise denies unsafe Rust.

**Important Windows race:** This version uses `Command::spawn`, then `AssignProcessToJobObject`. It cannot promise that a crashed host leaves no uncontained child during that interval. The test worker is blocked on the secret pipe, and errors fail closed before admitting tool calls, but process containment is not yet atomically established from creation. Production requires `CreateProcessW` with `PROC_THREAD_ATTRIBUTE_JOB_LIST` or equivalent fail-closed atomic assignment, then a new host-kill fault matrix. Do **not** promote current Windows Job code as final containment.

### Linux and Unix

- `CommandExt::process_group(0)` gives each worker a fresh process group before exec. Stop and Drop revoke the host grant then `killpg(SIGKILL)` with the worker process-group ID, including ordinary descendants even after the leader exits.
- Process-group-only mode reports `unix-process-group-escapable` because a child can create a different session via `setsid`. It is a **development fallback**, not an untrusted-code sandbox or automatic host-death recovery.
- `LinuxCgroup::create` takes a **trusted host-supplied delegated parent**, checks absolute path, identity and mode, requires v2 `cgroup.controllers`/`cgroup.procs`, creates a uniquely named cgroup, and requires `cgroup.kill`/`cgroup.events`.
- `TrustedWorker::launch_in_cgroup` attaches the spawned worker to that cgroup while it is still blocked on the inherited bootstrap pipe. Admission fails closed if attachment fails. Stop writes `1` to `cgroup.kill` and waits until `cgroup.events` reports `populated 0`, or returns timeout.
- Unlike a process group, `cgroup.kill` targets all descendants in the cgroup tree, including children that change their process group. It does **not** stop a process with sufficient permissions from migrating out unless delegation and containment policy prevent migration.

**Unverified Linux gate:** Both the development container and ordinary hosted runners may lack a writable delegated cgroup v2 subtree. The positive native cgroup test is opt-in with `LU_TEST_DELEGATED_CGROUP`; otherwise it emits `LU_CGROUP_V2_POSITIVE_TEST=SKIPPED_NO_DELEGATED_PARENT`. A skipped test is not a pass. Invalid/non-v2 delegation is tested and must fail closed. Cgroup creation/cleanup still require host-owned lifecycle and interrupted-operation recovery hardening before shipping.

## Real native tests / evidence

- `tests/containment.rs` launches `lu-ipc-tree-fixture` as a distinct host-hash-attested test worker. That worker creates a test descendant whose PID can be independently checked via Windows process handles or Linux `/proc`.
- Tests cover normal `stop` and handle `Drop`, and on Windows hard termination of a separate host fixture owning the Job, requiring the descendant to terminate when the OS closes its last Job handle.
- A previous Windows run confirmed the hard-host-death test but failed overall because simultaneous tests used identical temporary directory names under coarse Windows timestamp granularity. Corrected with an atomic per-process nonce; this was a **test fixture collision**, not a Job-Object escape.
- First native cross-platform descendant tests passed on source run [41244463044](https://github.com/vjmichael/jan_alt/actions/runs/41244463044). Final source with Windows hard-host-death, explicit cgroup skip marker, Windows Job Object active-process drain and Linux cgroup drain checks: [native workflow 41244750621](https://github.com/vjmichael/jan_alt/actions/runs/41244750621) **PASS** on Ubuntu 24.04 and Windows Server 2025, including all targets under Clippy `-D warnings`. The positive delegated cgroup test remained skipped: no actual cgroup v2 kill evidence has been obtained.

## Release gates remaining

1. Windows atomic CreateProcess+Job-list process assignment before any child thread can run; inherited-handle allowlist, job handle lifetime and abrupt host death fault injection.
2. Positive Linux delegated-cgroup test on a genuinely writable, owner-validated v2 mount, including descendant `setsid` escape attempt, concurrent fork, `cgroup.kill` drain and cleanup on interruption.
3. Linux host-death lifecycle: a host-surviving watchkeeper/supervisor or equivalent validated kernel policy must terminate cgroups even if Lu itself dies, without leaking privileges or requiring permanent administrative installation.
4. Immutable/signed native executable staging (no path hash/spawn TOCTOU), Windows ACL + reparse and native OS peer identity, profile switch and cancellation propagation.
5. Actual saved user-turn and Lu Protobuf payload/registry authorization, durable effect journaling, real GGUF tool turn, clean Windows installer and restart verification.
6. Native Windows physical test remains separate from GitHub runner; normal runner success is not hardware/installer acceptance.

**Release decision:** IPC-04C is a meaningful source-level containment prototype, not a production-ready worker sandbox or Lu stable alpha.
