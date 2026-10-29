# Lu diagnostics design — historical proposal, rebaselined for Alpha

**Superseded scope (2026-10-29):** the user explicitly moved **end-to-end
causal diagnosis/fault localization** into Alpha and postponed Alpha to make
that possible. The minimal passive host/client breadcrumb prototype is **not**
the completed diagnostic design. Read
[DX fault-localization acceptance](lu-alpha-diagnostics-fault-localization-2026-10-29.md)
for the new binding trace/correlation, subsystem localization, controlled
fault injection, redaction and installed-runtime evidence requirements.
**Benchmarking and unrelated diagnostic features are excluded from Alpha**
and reserved for later revisions. Automated repair and remote Lu-to-Lu
diagnostic bridges likewise remain deferred. The historical discussion below
is useful context, but any conflicting D0/D1-only release scope is overridden.


Status: design only. No diagnostic agent, benchmark, listener, repair action,
or Lu-to-Lu connection is enabled by this document. LU-P4-CANCEL-001 has priority.

## User contract

Diagnostics are disabled by default. A human opens **Help > Check Lu** and sees
the proposed checks, expected duration, CPU/GPU/memory/disk use, data included,
and whether a worker restart or synthetic conversation is involved. Nothing
runs until they approve that concrete scope. Model output cannot approve it.
Benchmarking, disruptive recovery, report export and a remote diagnostic bridge
each require their own explicit authorization. Closing the dialog denies access.

The normal result is plain English: “Model loading was interrupted. Your message
is saved. Select Play to try again.” If a restart is needed, explain what it
interrupts and request approval. Never label a repair successful merely because
its command returned: repeat the approved health check and show its result.
Technical details are optional, with a structured report engineers can inspect.

## Host architecture

- A Lu host diagnostic supervisor runs independently of the inference worker.
  It must remain responsive when loading, generation or worker teardown hangs.
- Use a deterministic runner for lifecycle checks. No second LLM is necessary.
  Queue model workloads; never load two large Qwen models implicitly.
- Track each operation by host-minted run ID, owning conversation ID, approved
  capabilities, expiry, cancellation handle, monotonic deadline and resource
  budget. Store grants in host state, never in model-controlled messages.
- Checks run in disposable profiles under a test workspace. Production AppData,
  user conversations, prompts, model paths and credentials are excluded by
  default. A report contains sanitized codes and timing, not transcript text.
- Separate inference cancellation from diagnostic cancellation. A timed-out
  diagnostic cannot leave its synthetic conversation, listener or worker alive.
- Observe worker PID and exit status from the host. A UI status reset is not
  evidence that model resources were released. Inspect only workers owned by
  this run; never kill another Lu instance or unrelated process.

## Native Protobuf contract to implement

Extend Lu's versioned native contracts with typed requests for starting,
cancelling and querying a diagnostic run. No shell command or arbitrary path
field. A host-validated request references an allowlisted check ID, a host
conversation principal, and a host-issued approval ID. Reject unknown checks,
expired/revoked grants, excessive budgets and wrong-conversation calls.

A report includes schema version, Lu build/commit, OS and architecture,
backend kind, check ID/version, run ID, sequence, approved scope, start/end
times, stage timings, observed terminal state, failure code, recovery guidance,
verification outcome, and evidence provenance. Distinguish passed, failed,
cancelled, skipped and blocked; skipped Vulkan or absent GGUF is never “passed”.
Use bounded records, redact secrets before serialization, and keep reports local
with explicit retention/deletion controls. Export only after a human preview.

## First check suite

1. Cancel before model creation and during delayed load; preserve the original
   prompt ID and attachments; expose Play; generate once on retry.
2. Cancel after model readiness but before any token, during thinking and during
   text output; verify request ownership and terminal state.
3. Switch A to B, cancel A, complete B, return to A and retry. A's cleanup cannot
   change B's progress or acquire B's tool authority.
4. Inject load failure, unload failure, worker crash and dropped event listener.
   Check bounded termination, listener removal and exact failure reporting.
5. Shutdown during load, observe owned worker exit and released resources, then
   launch against the disposable persisted profile and retry the saved turn.
6. Benchmark cold load, time to first token, cancellation-to-idle, shutdown,
   warm retry and sustained throughput. Record CPU/Vulkan and model digest,
   quantization and context size; do not compare unlike configurations silently.

## Separately authorized Lu-to-Lu bridge

Deferred implementation. Local diagnostics approval does not open a bridge.
Require human pairing of named controller and target instances, authenticated
transport and a short-lived scoped capability bound to both instance identities,
the target conversation, allowed check IDs, resource ceilings and expiry.
Use native Protobuf frames with protocol version, request/run IDs, strictly
increasing sequence values, bounded payloads and authenticated integrity.
Reject replay, wrong target, unknown capability, scope escalation and revocation.
Controller requests are evidence-bearing proposals; the target host remains the
authority. No arbitrary shell execution, source rewriting, credential access,
cross-conversation grants, background pairing or automatic remote repairs.
The target's diagnostic supervisor must outlive either inference worker.

## Delivery sequence

Land and verify cancellation regressions first. Next implement the disabled
host runner and approval boundary with fake-backend authorization tests; then
the human-facing dialog and disposable-profile runner. Only after Windows
resource/shutdown acceptance add benchmarks and, under a separate approved
scope, authenticated bridge pairing. This proposal makes no claim of a working
diagnostics facility or verified Vulkan hardware acceptance.
