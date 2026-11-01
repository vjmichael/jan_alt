# Lu / Cognitum — P46 kernel containment and Windows parity (stage G1)

**Recorded:** 2026-10-31 (America/Phoenix); test environment UTC 2026-11-01.  
**Source baseline:** locally reconstructed Lu D04F (`lu/linux-d04f-desktop-p46-p25-acceptance-20261031`) and Cognitum P46R8.  
**Scope:** isolated development source/acceptance fixtures only. No merge into Lu main, Windows alpha or release installer.

## Executive outcome

**Not fully accepted**: positive kernel-backed containment needs a writable/delegated cgroup2 host; actual Windows Job Object process-tree acceptance requires Windows. The current Linux host has a genuine cgroup2 mount but it is read-only, so positive execution is impossible here. We do not mislabel mocked cgroup cleanup, a host-written marker, a best-effort Job attachment or process-group cleanup as verified kernel containment.

The work delivers a non-vacuous kernel acceptance probe, a disposable Windows Job Object fixture, and a staged shared worker-protection policy. The Linux worker's existing *trusted-supervised* path remains available without cgroups. Strict `kernel-required` admission remains closed.

## Local results

| Check | Observation | Disposition |
|---|---|---|
| Real cgroup2 | `cgroup2fs`, `ro`, `cgroup.kill` present | Kernel execution **BLOCKED** (`CGROUP2_READ_ONLY`, exit 3) |
| New P46 probe contract | 7/7 passed | Fake mounts, missing delegation and contradictory positive results fail closed |
| Additional cross-platform/source checks | 4/4 passed | Source-level tests only, not Windows execution |
| Lu common policy Rust tests | 11/11 passed | Includes denied Windows post-spawn attachment, untrusted Sandbox requirement |
| Lu Core with experimental Cognitum | 106/106 passed | Existing bound real pinned worker path passed |
| Lu standard Core | 87/87 passed | No regression |
| Targeted P46R8 recovery CLI/service tests | 41/41 passed | Real read-only denial and mocks; no kernel `cgroup.kill` positive |
| Broad P46 158-test replay | timed out without final result | **NOT counted as passed**; prior 158/158 remains historical, not a current rerun |
| Windows job fixture | authored, not run | **Windows execution outstanding** |
| Windows alpha source audit | best-effort Job attachment after worker spawn | **Strict containment must not be claimed** |
| P25 expanded benchmarking | not started | Deferred until P46/Windows OS gates or explicit change of order |

## Architecture and security requirements

1. **Trusted supervised, fixed Cognitum**: source hash verification, per-turn host policy, bounded worker, process-group cleanup, cancellation. No cgroup or OS sandbox claim. Can execute where available and authorized.
2. **Kernel process-tree protection**: actual OS handle/control of worker tree **before** release of executable work, plus verified host-death cleanup. Linux uses a delegated cgroup2 subtree with outside watcher/service; Windows needs a Job Object assigned before the worker's release barrier, with kill-on-last-handle-close. No weak fallback.
3. **Untrusted native DLC**: Job Object or cgroup tree control is not enough. Requires separately defined OS-enforced filesystem/network/code restrictions and relevant host policy. Never permit a DLC to self-select its protection tier or forge evidence.
4. **P46R8 receipts are observations**: they cannot grant tool authorization, satisfy signed extension admission, or turn `HOST_REPORTED_CLOSED_UNATTESTED` into a kernel proof.
5. **OS acceptance**: a successful fixture proves its own tree-lifetime behavior only. Full Lu worker, cancellation, restart, packaging and independent recovery must be separately proven.

## Source files

- `src/p46_kernel_acceptance.py`: bounded real cgroup preflight and fixed-worker acceptance probe; returns nonzero on blocked or failed execute. No vacuous empty-ledger success.
- `src/Test-LuWindowsJobObject.ps1`: disposable gated PowerShell child and descendant; attach before release, close Job, witness both exits; emits machine-readable result. This is a **fixture**, not Lu's Windows supervisor.
- `src/Lu_Worker_Containment_Policy_Stage.patch`: clean-applying Lu Core staging patch for a shared typed admission model; not wired to production OS backends yet.
- `tests/`: seven Linux-probe negatives and four portable source/contract checks.
- `evidence/`: exact local test logs and blocked-kernel report.

## Gating next steps (blocked in this container)

- **Linux:** provision a *trusted* host with a writable delegated cgroup2 root; run the fixed P46 host-death/watchkeeper/`cgroup.kill` positive test, verify `cgroup.events populated=0`, verify recovery service restart, and require independent outside-host survivor witness. Do not move from fixture to production until containment, filesystem/network policy and authority are reconciled.
- **Windows:** run the Job Object fixture on a real Windows x64 host. Then patch Lu's Windows worker admission from best-effort attach-after-spawn to a launch barrier or suspended-launch + verified Job assignment for any strict tier; verify crash/descendant cleanup. Leave the normal best-effort engine path separate and honestly classified.
- **Cross-platform:** reconcile to shared Lu core only after both OS-specific source branches and ownership contracts agree; **no divergent Lu apps**.
- **Research:** afterward expand P25 to several real models and capability families without pooling the older 27B scheduling receipt with the 0.5B rational arithmetic tests.

**This is deliberate partial progress, not acceptance of kernel-required or cross-platform release.**
