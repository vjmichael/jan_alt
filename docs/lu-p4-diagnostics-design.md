# Lu P4 diagnostics proposal

Status: **split on 2026-10-29**. Lightweight **passive, local, content-free
diagnostic checkpoints** are now pre-Alpha 0.1 engineering work, alongside
W01; this is not an end-to-end diagnostic pass. The six-support-gate branch
already supplies a bounded frontend diagnostic export and recovery messages.
It is insufficient by itself to locate native host hangs.

The interactive diagnostic supervisor, synthetic checks, automated repair,
benchmarking, and Lu-to-Lu bridge remain separate future milestones. No
diagnostic agent, remote service, model repair, or autonomous benchmark is
enabled by this document. See `docs/lu-alpha01-diagnostics-acceptance-2026-10-29.md`.

## User contract

**Two separate modes (do not conflate them):** passive bounded *status
breadcrumbs* for an already user-authorized normal turn may run locally without
a new permission, provided they collect only fixed stage codes and elapsed
times, never prompts, identifiers, paths, secrets or raw exceptions. They do
not invoke tools, generate tokens, open listeners or modify files. Export is
a separate, user-initiated local action, with report preview.

**Active diagnostics remain disabled by default.** A human opens **Help > Check Lu** and sees
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
6. **Deferred to a post-Alpha benchmarking revision:** measure cold load,
   time to first token, cancellation-to-idle, shutdown, warm retry and
   sustained throughput with controlled CPU/Vulkan, model digest,
   quantization, context and thermal conditions. No benchmark workload
   or comparison is executed in the Alpha diagnostic path.

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

## Revised delivery sequence

**Alpha D0 (now, independently testable):** add fixed-code, bounded, in-memory
host turn checkpoints that remain readable while the inference worker is busy.
Link these to the existing user-requested, locally generated redacted JSON
export. Add W01 timeout evidence capture from the disposable WebView2 runner.
No extra model, trace collection service, filesystem scan, new worker, remote
telemetry or privileged tool capability. Diagnostic failure cannot block or
alter an authorized user turn. Reuse existing supervised engine status.

**Alpha D1 (before release acceptance):** report both frontend and Rust
checkpoints, with terminal outcomes, from an actual installed Windows build.
Prove the negative privacy contract in tests, the stop/cancel path, and the
main-window-only read-only diagnostics boundary. A timed-out turn must show
which stage was last reached. No diagnostic event is a permission grant.

**Post-Alpha D2 (separately authorized):** implement the interactive **Help >
Check Lu** supervisor for synthetic checks, crash reproduction, worker restart
and verification under disposable profiles, with explicit user approval and
resource budgets. This may be accelerated for a concrete Alpha blocker only
if passive D0/D1 evidence proves it necessary; it must not silently become a
release-wide prerequisite.

**Later revisions:** reproducible benchmarking and the separately paired,
authenticated Lu-to-Lu bridge. Neither belongs on Alpha's critical path.

This revision does not claim a working diagnostic supervisor, a certified
installer, or verified hardware benchmarking.
