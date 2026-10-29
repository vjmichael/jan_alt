# Lu engineering documentation index

Status: updated 2026-10-29 for the **rebaselined Alpha release decision**.
This index distinguishes requirements from completed implementation; it is **not**
a claim that Cowork extraction or new diagnostics have passed.

## Binding Alpha change (2026-10-29)

- **[Canonical revised Alpha engineering task list](../lu-alpha01-revised-work-plan-2026-10-29.md)** — six pre-release phases, T01–T18, dependency order and AX/DX/W01–W06/A01–A09 gate criteria. Phase 6 major v1.0 review remains post-Alpha.

- [Rebaselined Alpha: no Cowork, no non-inheritable Jan, postponed release](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md) — **supersedes older transitional compatibility assumptions**.
- [Alpha end-to-end DX fault-localization requirements](../lu-alpha-diagnostics-fault-localization-2026-10-29.md) — causal traces, stage localization, redacted evidence, boundary fault injection, no benchmarking.
- [Revised Alpha release gates](../lu-alpha-0.1-windows-release-gate-2026-10-29.md) — AX and DX in addition to A01–A09. Earlier Alpha candidate pin is historical, not a newly qualified release.

## Consolidated recent feature decisions and deferred QoL

- **[Deferred features / QoL consolidated register](deferred-feature-backlog-2026-10-29.md)** — one index for QOL-01..07, SEC-01 and future research. Preserves separate design specs, dependency ordering, original source provenance and release deferrals.
- **[Task discovery ≠ task authorization](security/task-discovery-vs-authorization.md)** — adopted **security invariant**, not an optional QoL permission. A discovered phase is a proposal, never a self-granted executable task; Alpha's existing host authority tests must enforce it.
- [Peer assistants and shared-model resource scheduling](deferred/multiassistant-resource-scheduler.md) — **post-v1.0 design**, not a release blocker.
- [Runtime/dependency manager](deferred/runtime-dependency-manager-v1.05.md) and [IDE UTDM](deferred/unified-toolchain-dependency-manager-v1.05.md) — v1.05 design and later specialized Workspace extension, not Alpha.
- [Lu Continuity Registry](deferred/continuity-registry-v0.1.md) and [Task Handoff](../lu-future-task-handoff.md) — user-facing continuity/task orchestration designs, deferred with explicit permission boundaries.

## Authoritative planning and tracking
- [Alpha acceptance](alpha-acceptance.md): revised Cowork-free Windows x86-64 release gate.
- [Roadmap](roadmap.md): v1.0 core, v1.x stabilization, v2.0 DLC expansion.
- [v1.0 implementation, phase smoke gates and final qualification](v1-implementation-verification.md): implementation requirements and verification matrix.
- [Jan source provenance / Apache-2.0 record](jan-origin-provenance.md): verified inherited files, modification labels, NOTICE and compliance gate.
- [Component and evidence register](component-register.md): distinguish design, implementation, integration, verified tests and acceptance.

## Existing detailed engineering records
- [LU-P4-CANCEL-001 validation](../lu-p4-cancel-001-validation.md): source fix, tests and unverified real Qwen/Vulkan behavior.
- [P4 diagnostics design](../lu-p4-diagnostics-design.md): historical diagnostic design; new end-to-end DX gates take priority. Passive prototype source exists on an independent branch, but installed diagnostic acceptance is unproven.
- [PR #23](https://github.com/vjmichael/jan_alt/pull/23): cancellation fix, Windows smoke-test corrections, CI and comments.

## Documentation rules
1. Mark each feature as **proposed**, **implemented**, **integrated**, **tested**, or **accepted**; code presence does not imply desktop integration.
2. Attach commit SHA and test/run evidence for each accepted engineering claim.
3. Preserve inherited Jan historical documentation; Lu-specific scope and identity are defined here, not by the upstream README.
4. Update the register at each merge/release gate. Do not mark a workflow passed while still running or failed.
5. Avoid routine Human Transfer Protocol (HTP): prefer CI, directly collected diagnostics, and automated evidence. Human consent remains mandatory for privileged actions.

This index does not supersede module-level specifications not yet reviewed. Cross-link them when independently verified.
