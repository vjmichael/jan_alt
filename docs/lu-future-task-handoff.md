# Future Feature — Lu Task Handoff (LTH)

**Status: DESIGN BACKLOG / NOT IMPLEMENTED.** This is a future Lu-native experience, not a requirement for Core Extension execution, Cognitum, or Lu 1.0 security gates. It does not authorize background execution today.

**Cross-feature consolidation (2026-10-29):** [deferred feature register](lu/deferred-feature-backlog-2026-10-29.md) identifies this as **QOL-02**. Handoff consumes the same host-owned task ledger, scoped grants and review states as [task discovery ≠ task authorization](lu/security/task-discovery-vs-authorization.md); a discovered next phase must remain a proposal unless specifically preauthorized. [Peer and subworker coordination](lu/deferred/multiassistant-resource-scheduler.md) reuses LTH supervision infrastructure later, not a second authority system. No new Alpha or v1.0 implementation requirement is created here.

## Goal and experience

From an ordinary Lu conversation, a user can explicitly hand a scoped, potentially long-running task to Lu's local work executor and continue chatting. Lu displays a durable task card showing owner, purpose, inputs, progress, checkpoints, pending approvals, cancellation, and the final result. This resembles a work handoff in UX, but is implemented entirely through Lu-owned local task, memory, capability, and workspace services; it is **not an MCP server** or mandatory cloud dependency.

An optional installed DLC Workspace (IDE, Film Studio, etc.) can serve as an execution destination, but vanilla Lu must remain usable and customizable without any DLC. A Workspace may provide specialized UI and workflows, not new implicit privileges.

## User actions

- **Hand off:** user chooses a bounded task, expected outputs, target Lu execution environment and permission scope. The host shows the plan and the exact intended side effects before work begins.
- **Observe:** user sees task state, step-by-step progress, execution history, resource use, errors, checkpoints and source links. One Lu chat can continue without lending its session authority to the worker.
- **Control:** pause/resume, cancel, edit allowed scope (by reapproval), or return a task to interactive chat. Cancellation stops active workers and broker-mediated effects; results clearly distinguish completed effects from rolled back or uncertain ones.
- **Return:** deliver an artifact or structured results with provenance, verification results, unresolved issues, and traceable references to the originating task and conversation.

## Required architecture

1. **ContextEnvelope (information, not authority):** protobuf-native origin identifiers, conversation and user-turn provenance, objective, constraints, input artifact references, expected output contract, model/extension selection, and checkpoint/revision references. Cross-chat retrieval can reference prior context while preserving source identities.
2. **Non-transferable AuthorityGrant:** separately approved, revocable and least-privilege authority bound to local profile, authenticated user intent, task ID, specific operations/resources, expiry, and execution origin. A handoff never silently copies a chat's permissions, external tokens, credentials or execution authority to another session, model, or Workspace. Every new privileged action is broker-checked.
3. **Supervisor / task registry:** host-owned durable task state machine (proposed, awaiting-approval, queued, running, paused, cancelling, cancelled, failed, completed), heartbeat, bounded retries, cancellation propagation, crash recovery and stale-task reconciliation. Restart must not resume side effects without revalidating grants and inputs.
4. **Work execution:** invoke Lu-native Core Extensions through the signed loader and host-controlled resource broker, or approved built-in tools. Untrusted worker output is validated against generated Protobuf types and semantic contracts. Optional Workspace-specific execution adapters can be registered without changing Core's authority model.
5. **Memory and continuity:** store minimal provenance-linked summaries, artifacts and explicit revisions in ANSF/Continuity Plane; preserve superseded decisions and user updates rather than trusting a stale task description. Sensitive data stays profile-isolated.
6. **UI:** compact handoff/return affordances in vanilla Lu, plus task dashboard with progress, live logs, permission prompts and accessibility support. No surprise background actions or opaque delegation.

## Security and privacy invariants

- Offline-first; network is available only through explicitly approved, host-brokered access.
- No automatic privileges from a model suggestion, CE manifest, retrieved document, other chat, or DLC.
- Revocation takes effect at the broker gate and cancels affected tasks. No continued writes after revocation commits. Terminate non-cooperative isolated workers.
- Use scoped artifact handles, immutable provenance records, durable audit logs, secret redaction, and per-profile storage boundaries.
- Replanning or switching model/workspace cannot silently broaden authority.
- Do not promise exactly-once execution across crashes. Use idempotency keys, effect journal, and user-visible reconciliation for unknown outcomes.

## Suggested future phases and acceptance criteria

**LTH-0 (later):** protobuf messages and design review for `ContextEnvelope`, `HandoffRequest`, `TaskCheckpoint`, `AuthorityGrantRef`, `HandoffResult`. Explicitly distinguish contextual references from executable authorization.

**LTH-1:** local handoff of a read-only task; durable task registry, chat task card, cancellation, resume after restart, and return with source references.

**LTH-2:** bounded write-capable handoffs under brokered, user-approved permissions; effect journal, task-scoped resources, revocation tests, failure reconciliation, and approval UX.

**LTH-3:** optional DLC Workspace destinations, multi-stage workflows, model switching and handoff between task workers without privilege inheritance.

Before shipping: prove profile isolation, cross-chat provenance, crash recovery, no side effects after revocation, hostile-worker containment, and source-resolved final outputs across Windows/macOS/Linux. Benchmarks should compare foreground and handed-off work for correctness, latency, resource costs and failure handling.

## Dependencies / non-goals now

LTH depends on authenticated host enrollment, signed CE runtime isolation, durable publisher trust, host resource policy, Protobuf validation, and reliable ANSF/Continuity integration. This file documents future intent only; **do not wire LTH into the live desktop or widen existing Core Extension permissions as part of current security work.**
