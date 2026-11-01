# Lu-Linux D04F / Cognitum P46R8 — Graded Worker Supervisor Reconciliation

**Recorded:** October 31, 2026 (America/Phoenix)  
**Development scope:** Local, disposable reconstruction from D04E source; Linux x86-64; feature `cognitum-dev-native`.  
**Git repositories:** Lu `vjmichael/jan_alt` (D04E lineage); Cognitum `vjmichael/cognitum` (P46R8 recovered source). GitHub is a source/documentation ledger, not the development host.  
**Disposition:** **Core-level reconciliation passed; desktop/installer and kernel containment remain unaccepted.** The Windows Lu alpha was not modified.

## Decision: cgroup protection is tier-specific, not a DLC-wide dependency

The trusted, SHA-pinned first-party Cognitum Python worker retains Lu's independent host-granted, persisted USER-turn authority, Protobuf validation, no-new-privileges/rlimit process guard, parent-death signal, bounded I/O, cancellation and process-group cleanup. It **does not require a writable cgroup** for developer execution. It never claims it is a sandbox.

`kernel-required` is separate and **fails closed** until Lu has its own verified, host-owned cgroup admission runner, launch barrier and independent host-surviving cleanup/recovery witness. **No receipt from P46R8 may turn this tier on.** Untrusted native DLC code must meet its designated stronger isolation policy; a DLC cannot choose a weaker tier for itself.

**P46R8's scope:** A separately supervised recovery service that inspects immutable prelaunch cgroup records, performs guarded cgroup cleanup where a real delegated writable cgroup is available, and emits `UNATTESTED` observations. It is not a worker-launching service, privilege broker, Lu authorizer, or proof of independent kernel containment. Therefore Lu can ingest its statuses for diagnostics without using them as capability grants.

## Local implementation (new D04F source delta)

1. Added `lu-core/src/cognitum_p46_recovery.rs`: strict, bounded P46R8 job and service JSON-report decoding, schema/version verification, deny-unknown-fields, duplicate-key rejection, valid job ID checks, exact allowed status combinations, and a host-only `LuContainmentDecision` with **no** path from an observation to kernel admission.
2. Connected `CognitumDeveloperWorker::new_with_tier` to that host-only tier decision. `TrustedSupervisedOnly` continues to launch the existing fixed worker under Lu's existing authorization; `KernelRequiredUnavailable` stays denied. Existing cgroup mount diagnostics remain informational, not proof.
3. Added a P46R8 Python-to-Rust checked fixture. Inspection and failed-closed samples were produced by the recovered P46R8 implementation on a private temporary state directory; mock kernel and host-closed cases are **explicitly marked simulated** and are never interpreted as real kernel observations.
4. `lib.rs` feature-gates the new module to Linux `cognitum-dev-native`. The default Lu Core remains unaffected.

### Exact recovery-status semantics

| P46R8 status | Lu meaning | May authorize worker? | May certify kernel containment? |
|---|---|---|---|
| `INSPECTION_ONLY` | Inspection; no kernel operation | No | No |
| `HOST_REPORTED_CLOSED_UNATTESTED` | Host-written closure only | No | No |
| `FAILED_CLOSED` | Error/contradiction; retain fail-closed state | No | No |
| `KERNEL_TREE_CLEARED_UNATTESTED` | P46 observed kernel kill/empty in a compatible environment; still unattested | No | No |
| `NO_PENDING` (service) | Empty pending ledger **after genuine writable-root preflight**; not a witness of launch/cleanup | No | No |
| `KERNEL_OBSERVED_UNATTESTED` (service) | Aggregated unattested kernel observations | No | No |

## Executed tests

| Test group | Local outcome |
|---|---|
| Recovered P46R1–P46R8 Python scoped failure, containment and recovery tests | **123/123 passed** |
| Lu Core, `--features cognitum-dev-native --lib` | **95/95 passed** |
| Standard/default Lu Core, `--lib` | **76/76 passed** |
| Rust strict report parser + tier decision + actual Python receipt fixtures | **5 tests passed**, included within 95 |
| Original fixed Cognitum Python worker through Lu Core | **Passed**, included within 95 |
| P46R8 CLI, empty ledger, **real read-only `/sys/fs/cgroup`** with `--execute` | **Denied**, exit 2, `CGROUP2_READ_ONLY` |
| P46R8 CLI, fake filesystem `/tmp`, `--execute` | **Denied**, exit 2, `NOT_KERNEL_CGROUP2` |
| P46R8 CLI, no `--execute`, empty private ledger | **Allowed non-destructive inspection**, exit 0 |
| D04E-to-D04F patch `git apply --check`, then apply + exact byte comparison | **Passed** (4 files) |
| Fresh Lu desktop feature-enabled GUI type-check | **Incomplete: two dependency compilation windows expired**, no claimed pass |
| Real writable cgroup2 scope, escaped descendant cleanup via `cgroup.kill` | **Blocked**: local cgroup2 mount is read-only |
| Lu production/Windows/installer integration | **Not tested** |

The 123 Python tests include real negative controls for cleared parent-death signals, setsid descendant breakaway, and inherited stdin writers. They report `LOCAL_HOST_OBSERVED_UNATTESTED`, not OS sandbox admission. Test process cleanup was observed. Some other tests use mocks to prove error-path logic: their return values must not be treated as live kernel observations.

### Build caveat

The new Lu Core compiled and passed all tests. The full desktop type-check entered its GUI and application dependency graph, but two local command execution windows expired before it reached a terminal success or source error. **Do not count a fresh D04F desktop binary as validated**. The previous D04E live GGUF and routing verification remains a separate baseline; D04F did not re-run those live turns.

## Still-open P-series gates

1. Kernel-required: real delegated cgroup2 launch barrier, immutable prelaunch journal, independent supervised cleanup, restart and escaped-descendant evidence, including cgroup membership checks before Python executes. Still blocked here by `ro` mount; do not create a fake cgroup path or downgrade protection.
2. Host crash / arbitrary descendants: independent recovery manager must be externally supervised; same-process cleanup/parent-death signal does not close this gate.
3. P46/R test timeout: historical 400 ms grandchild-start race reproduced before, and test-only timeout increase allowed the original test to complete. A repeatable production acceptance threshold has **not** been established by D04F.
4. D04F full Tauri desktop check, live GGUF regression, installer and cross-OS reconciliation pending.
5. P25 (broader paired model/reasoning benchmark evidence) remains an independent open Cognitum evaluation task.

**Scope boundary:** No automatic general DLC registration, arbitrary Python path, tool discovery privilege, model-authorized execution, or kernel-contained worker is introduced. Lu's host-only per-turn permission remains mandatory for native tool calls.
