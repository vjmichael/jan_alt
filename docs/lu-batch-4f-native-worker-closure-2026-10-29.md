# Lu Batch 4F — Native worker cancellation and recovery closure

Date: 2026-10-29
Branch: `work/lu-phase4f-bound-durable-dispatch-20261029`
Core acceptance head: `912d9befab70102413a0a44121f0d2eed33141a1`

## Verdict

**4F native worker and journal regression scope: PASS / CLOSED.**

This is a source-and-test milestone, **not** an acceptance of the installed
Windows desktop application or the Windows x64 installer.

## Evidence

- Windows AppContainer worker build, denial probes, and process-tree termination:
  https://github.com/vjmichael/jan_alt/actions/runs/40829009532 (success)
- Native worker relaunch and repeated cancellation:
  https://github.com/vjmichael/jan_alt/actions/runs/40829413930 (success)
- Windows native worker and persistent startup-recovery regression:
  https://github.com/vjmichael/jan_alt/actions/runs/40829431926 (success)
- Desktop native chat IPC boundary:
  https://github.com/vjmichael/jan_alt/actions/runs/40828465987 (success)
- Final phase 4F Rust effect replay / revocation / startup / formatting regression:
  https://github.com/vjmichael/jan_alt/actions/runs/40829941594 (success)

## Included

1. Host task ID is tracked by the CE worker supervisor for task-scoped
   cancellation and registration drain. A drained task registration is **not**
   by itself proof that an OS descendant exited.
2. Windows AppContainer diagnostic process tree termination verified by
   checking that descendant heartbeat writes stop after cancellation.
3. A second diagnostic worker can launch and be cancelled after the first.
4. Durable native dispatch checks current conversation authority before
   revealing cached Protobuf receipts, and prevents duplicate execution.
5. Recovery marks in-flight effects UNCERTAIN, and running tasks INTERRUPTED;
   recovery is idempotent and does not replay uncertain writes.
6. Tauri setup owns an advisory OS lock for a Lu-only runtime folder before
   startup reconciliation; native chat admission fails closed on recovery
   initialization failure.

## Deferred; not claimed as validated

- Real installed Windows x86-64 Lu desktop exit, relaunch and recovery using
  its actual production native worker and non-diagnostic file-write flows.
- Complete GUI Stop-to-CE-worker lifecycle routing for every production tool.
- Verified OS-level exit acknowledgment beyond the diagnostic heartbeat
  process-tree regression.
- Windows installer build or installation on a user machine.
- Migration or removal of remaining Jan/Cowork dependencies.

These are separate integration/installer acceptance requirements and must
remain visible in the next batch. A green 4F diagnostic gate does not imply
the above are green.

## Licensing and provenance

Keep Jan-derived files and their Apache-2.0 notices labeled during incremental
extraction. Do not strip existing provenance while replacing the Cowork paths.
