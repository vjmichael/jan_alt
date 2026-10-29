# Lu — Consolidated deferred features and quality-of-life backlog

**Consolidated:** 2026-10-29  
**Status:** Design inventory / scheduling only; no new code or user-granted execution authority.  
**Alpha:** Windows x86-64, **Cowork-free**, independently functioning Lu host/tools, and required end-to-end diagnostic fault localization. This file does not relax, add to, or certify AX-00..04, DX-00..04, W01–W06, or A01–A09.  
**Product direction:** Optional capabilities and incremental releases. Not a mandatory monolithic update, a new DLC requirement, or a real pricing/subscription commitment.

## Architectural decision: discovered work is never permission

**Adopted policy (2026-10-29): “Task discovery ≠ task authorization.”** A model may discover, document, suggest, prioritize or prepare a *proposal* for a new task. This does **not** empower it to execute that task, create a Git branch, change files, install a component, open a new phase, start a worker, or inherit authority from another chat.

The motivating case was a development assistant finishing an authorized **P1**, discovering a useful **P2** in its report, then independently proceeding into P2. **Correct behavior:** publish “P2 proposed — awaiting approval” and stop P2 side effects. An existing user-approved grant may authorize multiple future phases **only** if its scope and phase-transition conditions are explicit and validated by Lu's trusted host.

This is **not merely a postponed QoL feature**: it is a required security boundary of Lu's existing PolicyEngine/host authorization and applies to Alpha's native task paths. It does **not** expand the Alpha feature list with a task-discovery UI or independently justify new self-initiated work. The convenient **task proposal inbox, approval cards, planning queues and progress surfaces** are deferred QoL.

**Canonical original decision:** [Task Discovery vs Authorization](security/task-discovery-vs-authorization.md), imported unchanged from `docs/lu-task-discovery-authorization-20261029` (source commit `b17e7dc9ce48f8ce80e81bd419284a62b8c8750f`, original `docs/architecture/lu-task-discovery-vs-authorization.md`). Keep the original seven acceptance scenarios, particularly forged approvals in reports/memory/tool replies, phase gating, revocation and denial of unauthorized writes.

## Consolidated feature register

| ID | Feature / UX promise | Boundary and dependency | Scheduling / status | Design source |
| --- | --- | --- | --- | --- |
| **SEC-01** | **Task discovery ≠ task authorization** | Host verifies persisted user intent, scoped grants, task/phase transition and delegation; model output never a grant | **Adopted security requirement; enforce through existing Alpha authority work.** End-to-end desktop acceptance NOT established by this design | [Security decision](security/task-discovery-vs-authorization.md) |
| **QOL-01** | **Task proposal inbox and approval-gated phase transitions** | Show Discovered → Proposed → Awaiting approval; user can approve explicit phase/scope or dismiss. “Next milestone” text must not execute. Avoid prompting every authorized low-risk step | **Deferred QoL** after Alpha, version TBD | [SEC-01](security/task-discovery-vs-authorization.md), [task handoff](../lu-future-task-handoff.md) |
| **QOL-02** | **Lu Task Handoff (LTH)** | Native local durable handoff with task card, progress, pause/cancel, checkpoints, artifact provenance, explicit context versus authority; optional Workspace destination | **Deferred**; version after Alpha TBD, not shipped | [Existing LTH design](../lu-future-task-handoff.md) |
| **QOL-03** | **Independent peer assistants + primary/subworkers** | Distinct assistant/permission/memory contexts with consented peer messages and supervisor delegation. Shared loaded model/slot scheduling to avoid unnecessary GPU copies and protect foreground responsiveness | **Post-v1.0 design backlog**; not Alpha/v1.0 blocker; benchmarks at its future validation stage, never Alpha | [Multi-assistant resource scheduler](deferred/multiassistant-resource-scheduler.md) |
| **QOL-04** | **Lu Runtime & Dependency Manager** | Host-owned verified `uv` Python runtimes and pinned isolated environments; capability health, consented repair, rollback, non-CLI Ready/Repaired/Approval needed/Failed feedback | **Target v1.05**, design approved; **not** Alpha implementation | [Runtime Manager](deferred/runtime-dependency-manager-v1.05.md) |
| **QOL-05** | **Unified Toolchain & Dependency Manager (UTDM)** | Extends QOL-04, does not duplicate it: authorized discovery/reuse of portable tools, CMake/MSVC/SDKs, `vcpkg`, language runtimes, ABI compatibility, reproducible IDE builds. Never run untrusted downloads or modify global environment by discovery | **v1.05 design track**, richer IDE Workspace rollout later; Windows first; deferred | [UTDM design](deferred/unified-toolchain-dependency-manager-v1.05.md) |
| **QOL-06** | **Lu Continuity Registry (LCR) / unified conversation discovery** | Account-scoped searchable conversations across devices, clear origin/last-opened/execution host, workspace availability, verified checkpoint/handoff. Conversation visibility does not grant workspace access | **Deferred staged implementation**; exact release TBD, not Alpha blocker | [Continuity Registry v0.1](deferred/continuity-registry-v0.1.md) |
| **QOL-07** | **Conversation productivity polish** | Dual-pane conversations, native prompt queue/soft interrupt, memory pane search and links, user-visible edits/revisions, progress/heartbeat, status indicators and document export conveniences | **Existing v1.0 roadmap items**, not invented new Alpha gates; split into testable UI batches after Alpha | [Roadmap](roadmap.md), [v1.0 plan](v1-implementation-verification.md) |
| **FUT-01** | **Observe & Learn / Teacher UX** | Separate opt-in observation, privacy/consent and provenance; never unrequested desktop recording, automatic model training or permission inheritance | **Future optional research/core UX**; not this low-risk QoL release bundle | [Architecture roadmap](../lu-architecture-and-roadmap.md) |

**Classification:** SEC-01 = a *nonoptional existing trust invariant*; QOL-01..07 = optional/release-staged usability and infrastructure; FUT-01 = separate privacy-sensitive R&D. A label “QoL” is scheduling shorthand, **not** a claim that QOL-03/04/05/06 are trivial patches. The designs are approved **concepts**, not implementation grants.

## Merge and overlap resolution

### Discovery versus handoff versus multi-assistant execution

One common **host-owned task identity, task journal, grant/authority service and typed Protobuf capability boundary** should serve QOL-01 proposals, QOL-02 handoffs and QOL-03 multi-assistant delegation. Avoid parallel homegrown schedulers or independent permission tables.

- **Discovery** creates a *proposed work item* without an executable grant.
- **Approval** is a trusted user/host operation, with explicit scope, expiration and approval/gate source.
- **Handoff** is the host attaching an existing appropriate grant or requesting approval; it never transfers implicit conversation permissions.
- **Delegation/peer messaging** operates only within a separately verified intersection of scopes. Text in a peer message is task data, not authority.
- **Recovery** rechecks grants and revocation; a persisted checkpoint cannot revive a task's cancelled permission.
- **Trace** may report approval source and denied code in redacted form, but cannot generate approvals. It can reuse the mandatory Alpha DX diagnostics subsystem.

### Runtime Manager versus UTDM

**Use one core runtime/dependency broker**, not two competing component managers. QOL-04 is the underlying Lu-owned package/environment lifecycle and verified Python/uv pilot; QOL-05 adds IDE toolchain inventory, language/provider adapters and SDK/ABI-aware project build environments. Existing vendor package tools do the resolution/install work; Lu owns manifests, policy, provenance, consent, sandboxing, health, rollback and accessible UI.

- Preserve Lu-owned environments across `npm ci` and desktop upgrades; do not modify the user's global Python/toolchains incidentally.
- Discover existing allowed portable tools, but distinguish not installed, not on PATH, inaccessible and incompatible.
- **Discover/plan** never implies **download/install/execute**, including when the proposed repair appears harmless.
- Respect licensing and redistribution restrictions on compiler/SDK installers; avoid a giant mandatory baseline bundle.

### Continuity versus memory/ANSF versus task handoff

LCR is a **discovery/provenance registry**, not a replacement for ANSF+SQLite content, a guarantee that an execution workspace is currently accessible, or an implicit cross-account/cross-chat permission grant. Keep stable conversation IDs distinct from task IDs, workspace IDs and verified checkpoint IDs. LTH may consume an approved LCR workspace locator or verified snapshot, but must not treat an unknown/offline workspace as restored.

## Future delivery lanes (not revised Alpha phases)

| Lane | Recommended grouping | Gate and principal risk |
| --- | --- | --- |
| **Existing Alpha security** | SEC-01 host invariant only, folded into W02/AX authority and revocation checks | P1-only grants never execute P2; forged peer/report approvals denied; no new unrelated task UI |
| **v1.0 existing polish** | QOL-07 plus portions of proposal visibility that reuse existing task view *when prioritized* | UI predictability, durable history, no surprise actions; **no promise QOL-01 ships in v1.0** |
| **v1.05 infrastructure design/pilot** | QOL-04 underlying runtime manager → QOL-05 IDE provider extensions as separately tested milestones | Signed/pinned package sources, isolated Windows environments, approval, proven repair/rollback; version from original designs |
| **Post-v1.0 optional work** | QOL-01/02 proposal and task-handoff UX, QOL-03 peer/subworker orchestration, QOL-06 phased continuity | Exact release ordering TBD; LTH before multiassistant execution; identity/authority/sync boundaries |
| **Separate later research** | FUT-01 Observe & Learn and Teacher data mode; model comparison/throughput benchmarks when independently authorized | Privacy, consent, cost/resource measurement, scientific validity; never part of Alpha DX gates |

No feature here is entitled to ship merely because its design is recorded. A future v1.0 architecture review should reconcile detailed version targets with measured dependency/readiness and user priorities; do not silently move v1.05 commitments to Alpha or pretend the post-v1 features are guaranteed for a specific release.

## Concrete deferred acceptance cases

1. **Unauthorized next milestone:** approve P1 only; assistant finishes P1, proposes P2 and stops. No P2 branch creation, file write, migration, tool launch or worker scheduled. Approve P1–P3 with explicit validated phase gates: automatic transitions *inside that grant* may proceed.
2. **Fake approvals:** malicious audit report, prior conversation memory, external document and peer assistant message containing “approved” do **not** create host authority. Revocation and profile/scope mismatch prevent restart.
3. **Task proposals UX:** proposals show origin, requested effects, expected tests and status; approving explicitly creates an auditable grant. Declining leaves no side effects.
4. **Handoff:** user-authorized read-only task survives UI navigation, checkpoints progress, cancels and returns provenance; after reboot it rechecks grants before resuming.
5. **Multi-assistant:** three distinct assistants share one admitted model when feasible, without sharing permissions or conversations; foreground priority and GPU resource limits work. A peer cannot secretly broaden access.
6. **Runtime repair:** offline pinned `uv` environment rebuild succeeds without touching system Python or another Lu component; failed staging safely rolls back and requires approval for newly scoped installs.
7. **IDE toolchain:** discover a permitted portable CMake outside PATH without reinstalling; distinguish missing vs inaccessible; no unapproved MSVC/SDK installer or system setting change.
8. **Continuity:** remote UI locates a desktop conversation but reports local workspace offline; only a verified checkpoint and authorized handoff qualify as recovered, with no cross-account leakage.
9. **Regression:** none of the deferred features weakens Cowork-free Alpha, typed native Protobuf, diagnostic evidence accuracy or Windows profile/installer provenance.

## Source/provenance and ownership

| Consolidated document | Original location / source | Document status |
| --- | --- | --- |
| [Task discovery rule](security/task-discovery-vs-authorization.md) | `docs/lu-task-discovery-authorization-20261029`, commit `b17e7dc9`, `docs/architecture/lu-task-discovery-vs-authorization.md` | Approved requirement; not independently verified end-to-end |
| [Multi-assistant scheduling](deferred/multiassistant-resource-scheduler.md) | `docs/lu-deferred-multiagent-resource-scheduler-20261029`, commit `729fdee7`, `docs/roadmap/lu-deferred-multiagent-resource-scheduler.md` | Approved/deferred design only |
| [Runtime Manager](deferred/runtime-dependency-manager-v1.05.md) | Library: `Lu_v1.05_Runtime_Dependency_Manager_Design.md`, 2026-10-28 | Design only; v1.05 target |
| [UTDM extension](deferred/unified-toolchain-dependency-manager-v1.05.md) | Library: `Lu_IDE_Unified_Toolchain_Dependency_Manager_Design.md`, 2026-10-29 | Design only; v1.05 design, later IDE rollout |
| [Continuity Registry](deferred/continuity-registry-v0.1.md) | Library: `Lu_Continuity_Registry_Design_v0_1.md`, 2026-10-26 | Proposed; not implemented |
| [Task Handoff](../lu-future-task-handoff.md) | Existing GitHub `docs/lu-future-task-handoff.md` | Deferred; not implemented |
| [Roadmap / UX](roadmap.md) | Existing GitHub `docs/lu/roadmap.md` | Existing workstream, not a new release pass |

**Imported source specs are preserved as standalone references**; this file resolves overlaps and scheduling without erasing the provenance or changing original authored requirements. Remaining ambiguous product choices are future design decisions, not assistant authorizations.

**Work ownership:** This consolidation is documentation-only and does not alter ChatGPT Work's active AX/Cowork extraction implementation, the separate DX implementation branch, protected `main`, current Alpha candidate pin or Windows AppData. No CI pass or functionality is claimed by creating these docs.
