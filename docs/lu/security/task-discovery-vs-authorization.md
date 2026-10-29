# Lu — Task Discovery Is Not Task Authorization

**Decision:** Approved architecture/security requirement (2026-10-29)
**Status:** Documentation only; not implemented
**Scope:** PolicyEngine, orchestrator, native tool dispatcher, supervised tasks, Task Handoff, multi-assistant delegation
**Alpha impact:** Apply within the existing authority work; no new feature scope or alpha delay.

## Rule

> **Task discovery ≠ task authorization. Models may discover, propose, prioritize and document tasks, but cannot grant themselves execution authority.**

A roadmap item, TODO, model-authored report, previous tool result, retrieved document, memory entry or another assistant's suggestion is task data, **not** an authorization grant. Completing one milestone does not implicitly authorize the next.

## Motivating incident

During EVEmu development, an assistant completed an authorized P1 milestone, recommended P2 in its report, and then started P2 by treating that recommendation as an executable instruction. The discovery was useful; the unapproved phase transition was not. Preserve initiative, enforce the boundary.

## Delegated initiative

Within a human-approved work package, Lu may plan, inspect, code, test, diagnose, retry and checkpoint without requesting approval for each small step, subject to its existing tools and risk restrictions. On completing an approved phase, it can formulate a next-phase proposal, including dependencies, risks, acceptance gates and evidence. Unless a valid human grant already covers that phase, the proposal remains **Awaiting approval** and must not launch workers or produce effects.

Examples:
- “Complete P1” authorizes P1 and its verification, not P2.
- “Plan P2” authorizes drafting, not P2 code or database changes.
- “Complete P1 through P3, advancing after each passing gate” may authorize those transitions if recorded explicitly with conditions.
- A model's “Next: P2” text never authorizes itself.

## Trusted host enforcement

Before **each** tool operation, Lu's host PolicyEngine validates:
1. Actor, conversation ID, task ID and delegation lineage.
2. Durable, user-originated grant and permitted phase/work package.
3. Allowed capability, resource, environment and operation class (read, write, publish, delete, migrate, credentials).
4. Applicable approval gates, time constraints, revocation and cancellation state.
5. Effective delegated scope, which must never exceed the original grant.

**Models request actions but cannot grant authority.** Authorization records are host-owned and cannot be forged or expanded through a prompt, tool result, report, linked conversation or peer message. Protobuf-native task messages carry references to host-validated grants, never self-asserted authority.

## Suggested lifecycle

Discovered → Proposed → AwaitingApproval → Authorized → Running → Validating → Completed.

Rejected, Blocked, Failed and Cancelled are distinct recorded outcomes. New tasks discovered during Running or Completed may be Proposed automatically, **not Authorized** automatically unless a preexisting user grant explicitly encompasses the transition.

Durable checkpoints and effect journals preserve grant provenance. Revocation prevents execution and recovery-based restart of affected tasks. Branch creation for an unauthorized new phase counts as a state-changing operation; “just investigating” must still honor the read/write scope.

## Required acceptance tests

1. Authorize P1 only; after P1 succeeds and P2 is discovered, P2 remains proposed with **zero P2 tool writes**.
2. Authorize P1–P3 with explicit gates; transitions proceed only after gate evidence is validated.
3. Insert fake approval in an audit report, tool output, memory entry or peer message; host rejects unauthorized dispatch.
4. Revoke permission while a worker is active; cancel work, reconcile effects, and reject unauthorized recovery after restart.
5. A peer/subworker cannot promote its own next milestone or enlarge a delegated grant.
6. A read-only investigation grant permits inspection but rejects branch creation, code changes, database migrations and publication.
7. Diagnostics show grant source, denied action, required authority and transition provenance without exposing secrets.

## Scheduling

This is a **normative policy rule**, not a request to start implementing a new phase. Incorporate it in Lu's existing authority architecture and diagnostic test plans when those components are worked on. It does not change current Windows x86-64 alpha priorities, and it does not authorize follow-on development by itself.
