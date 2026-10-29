# Lu — Deferred Multi-Agent Communication & Resource Scheduling

Status: **Design backlog only; not implemented**  
Recorded: 2026-10-29  
Priority: **Do not block Windows x86-64 alpha or v1.0 acceptance**  
Proposed target: Post-v1.0; phase/version allocation to be decided

## User decision

Lu must eventually support **both**:
1. Independent, persistent assistants operating as peers, each with its own conversation, memory context, task identity and scoped tools, able to communicate when the user authorizes it.
2. One primary Lu assistant supervising multiple delegated subworkers, receiving progress, checkpoints and provenance-linked results.

These are two coordination modes using shared underlying infrastructure, rather than different inference engines. The user wants *greater concurrent task throughput*, not merely faster token generation. Local hardware is finite: initial target is one Windows desktop with an AMD Radeon AI PRO R9700 (32 GB VRAM) and 32 GB system RAM. An audible GPU fan at load reinforces the need for thermal/power monitoring. Multiple assistants **must not require** one model copy or GPU each.

## Architecture constraints inherited from Lu

- Keep first-party tools and internal coordination **Protobuf-native**; JSON only when crossing external protocol boundaries.
- Trusted Rust host owns scheduling, worker lifecycle, permission checks, cancellation, checkpoints and effects. **Models request actions but do not grant authority.**
- All delegated actions require a valid conversation/task identity and user-granted capability scope. Peer-to-peer messaging cannot escalate access or silently merge trust contexts.
- Durable revocation cancels affected tasks; cancellation/recovery and effect-journal invariants must survive failures/restarts.
- Linked peer messages and research excerpts are untrusted data, not privileged instructions.
- Protect independent conversations, memories, workspaces and secrets; provide explicit consent for cross-assistant communication.
- Preserve first usable Windows alpha as the immediate goal; no Linux/macOS dependency for this feature.

## Model and hardware sharing

Separate **assistant instance** (identity, instructions, conversation, task state, permission scope) from **inference worker** (one model load/backend/GPU allocation). Multiple assistants may share one loaded model with distinct inference slots and KV contexts. Resident KV and runtime buffers consume VRAM per active request, even if model weights are shared.

Resource scheduler should measure and regulate:
- GPU VRAM, active model loads, KV cache capacity, concurrent prediction slots;
- system RAM pressure, CPU/tool subprocesses, I/O, power and temperature/throttling when available;
- interactive latency versus background task throughput;
- optional second GPU or remote worker later, without changing agent message contracts.

Prototype baseline: **one 27B Qwen model loaded once on R9700; three separate agent identities; at most two active inference slots initially**, benchmarked against one assistant. This is a proposed experiment, not a performance guarantee.

## Proposed execution states

- **Ready/Queued:** assistant has runnable work but no inference allocation.
- **Inferring:** model is generating/consuming context under a scheduler lease.
- **Waiting on tool:** tool job is active; inference allocation released if safe.
- **Paused/Checkpointed:** progress and evidence persisted; inactive KV can be evicted/rebuilt.
- **Completed/Failed/Cancelled:** durable terminal outcome, effects reconciled and surfaced.

Prioritize foreground Lu UI responsiveness. Allow bounded background concurrency, starvation prevention, quotas, timeouts, user kill, and graceful degradation under memory/thermal pressure. Tool processes may continue while model generation is paused, subject to host supervision and permissions.

## Cross-assistant messaging contract (conceptual)

Typed Protobuf envelope with sender assistant ID, recipient or group, originating conversation/task ID, delegation lineage, intent/type, scope, provenance/evidence references, correlation/idempotency key, timeouts, delivery/ack state and cancellation linkage. Do not transmit entire chat histories by default. Use explicit user-consented cross-chat references and redact inaccessible material.

Messages support: request, acceptance/refusal, progress, checkpoint, result, review, correction and cancellation. The trusted host validates both sender and recipient authority. Peer communication **never** enlarges either agent's permissions. Distinguish peer collaboration from supervisor delegation without duplicating transport.

## Development-agent safeguards

Isolate concurrent repository edits through worktrees, file/branch ownership or serialized writes. Preserve source provenance, line references, test evidence and exact revision. Identify real tests versus source-only reasoning. Use shared evidence artifacts for review rather than copy-pasted unbounded context.

## Deferred validation gates

1. Three logically independent assistants share a single local model, with separately persisted chats and permissions.
2. Two concurrent inference slots do not exhaust VRAM or starve the foreground UI; fallback to one slot is clean.
3. Peer A sends a scoped task/evidence to B without human copy-paste; B cannot execute any capability absent from its authorization.
4. Primary assistant delegates to subworkers, tracks progress, cancels one task and recovers after restart without duplicate side effects.
5. Tool-waiting jobs release inference capacity without losing task identity; paused agents can resume after KV eviction.
6. Collect task throughput, first-token latency, tokens/sec, VRAM, RAM, power/thermal readings when available, tool-use accuracy and failure attribution; compare with single-agent baseline.
7. Optional multiple-GPU routing is a later validation gate, **not** a precondition.

## Scheduling / priority

**Deferred future feature; not an alpha or v1.0 release gate.** It may build on Lu Task Handoff, the native worker supervisor, resource diagnostics, memory linkage, and the existing Protobuf/policy system. Reassess version target after the installed Windows alpha and subsequent architectural review.

This document records the user-approved concept, not authorization to implement it now.
