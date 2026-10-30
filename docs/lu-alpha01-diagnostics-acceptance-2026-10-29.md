# Lu Alpha diagnostics — D0 prototype and revised DX acceptance

> **2026-10-29 user decision supersedes the D0-only Alpha scope below:**
> Alpha is postponed, and **end-to-end diagnostic fault localization** must be
> implemented before release, alongside removal of Cowork/non-inheritable
> Jan features. Plain event logging and the bounded passive prototype are
> necessary groundwork but **not sufficient**. Follow the binding
> [DX-00..04 spec](lu-alpha-diagnostics-fault-localization-2026-10-29.md)
> and the [Cowork-free Alpha release decision](https://github.com/vjmichael/jan_alt/blob/work/lu-alpha01-release-gate-20261029/docs/lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).
> Benchmarking, model scoring, automatic tuning, remote bridges and unrelated
> diagnostic features remain deferred to later revisions.

## Historical D0 passive observability foundation (not complete DX)


Historical D0 decision: **bounded, read-only first-run/native-turn diagnostic trace in Alpha**. The revised user goal additionally requires a full fault-localization lifecycle, correlated stages/attempts, failure interval and tested evidence across frontend, host, engine, native tools, persistence and UI. Windows x86-64 only; no benchmarking.

## Evidence motivating the change

Real Windows WebView2 run [40893477319](https://github.com/vjmichael/jan_alt/actions/runs/40893477319) showed W02 host denials passed, W04 cancellation passed, the GGUF loaded with a stable PID, but the W01 visible assistant replies were missing. Current `luDiagnostics.ts` exports frontend phase/status and a small in-memory event list. It cannot answer whether the native request crossed the Rust boundary, passed persisted USER-role validation, entered the actual model/tool loop, returned from the loop, streamed its reply, or persisted an assistant message. Simply collecting more logs is not sufficient.

## Two diagnostics classes, with distinct authority

**Passive breadcrumbs (Alpha, built in):** fixed allowlisted stage codes, bounded monotonic counters/timings, terminal state and generic error classification for a turn already initiated by the user. In-memory only, no file writes, no network telemetry, no raw prompts, tokens, tool arguments, filesystem paths, model filenames, secrets, profile/conversation/user/message identifiers or untrusted exception strings. No additional model invocation, privileged action, restart or permission grant. Only a trusted main Lu window can request the snapshot, and export is user initiated. A missing/busy/poisoned trace must not stall normal generation.

**Active Help > Check Lu (deferred unless scoped active fault probes are necessary to meet DX-02/03):** enumerated/synthetic health checks, isolated workspace, approved resource budget, interruption/restart, cleanup, deterministic validation and user-visible consent. Not bundled as an unrestricted "auto repair" helper, not called implicitly. Even an approved check does not authorize access to unrelated sessions or processes.

## D0 minimal event vocabulary and correlation

Local frontend states:
- `user-turn-persisted` (after confirmation of the saved user turn; must not include content/ID);
- `native-turn-start`, `native-ipc-invoked`, `native-ipc-returned`, `native-stream-closed`, `native-turn-failed`;
- `assistant-message-persisted` only after a verified write, not merely an AI SDK stream finish.

Local host stages:
- `native-turn-received`, `native-session-ready`, `saved-user-attested`, `native-task-registered`, `native-worker-entered`, `native-task-authorized`, `native-model-loop-entered`, `native-model-loop-returned`, `native-turn-succeeded`, `native-turn-failed`, `native-cancel-signalled`.

A bounded ring (maximum 64 host events, 32 client events), with fixed codes, an incrementing local sequence and elapsed milliseconds since host process start, is enough. The host record must remain readable without acquiring the generating engine's lock. An anonymous, short-lived host correlation token is optional; do not expose persistent account/profile IDs as trace identifiers. On a user-approved export, label which layer is reporting; do not claim that "stream closed" proves the assistant was saved.

## D1 failure localization contract

| Last confirmed stage | Next subsystem to examine |
| --- | --- |
| No user-turn-persisted | Webview state/JSONL write and verified message ID |
| User persisted, no native-turn-received | AI SDK transport selection, request prevalidation or Tauri IPC |
| Host received, no saved-user-attested | Session, ownership, canonical stored USER role, read-only context |
| Host attested, no native-model-loop-entered | Authority opening, worker scheduling, journal initialization |
| Model loop entered, no return | Engine request, model JSON boundary, tool loop or cancellation |
| Host returned, no native-ipc-returned | Tauri response/exception delivery |
| IPC returned, no stream closed | UIMessageChunk stream framing and AI SDK consumer |
| Stream closed, no assistant persisted/rendered | Assistant persistence and React rendering |

These are **diagnostic hypotheses**, not automatic root-cause claims. A stopped trace also needs a current engine status snapshot and timeout classification; absence of an event may mean dropped diagnostic evidence.

## Privacy and failure safety

1. No raw Rust `Debug` strings, prompt bytes, model output, file paths, tool parameters, worker command lines, API keys or registry contents in diagnostic records or frontend error strings.
2. Bounds are enforced at the recording site and again at the export/Webview boundary.
3. No extra Tauri command accepts a free-form diagnostic action, shell, file path or model argument. Main-window-only snapshot is read-only.
4. No blocking synchronous disk writes in generation/permission/cancellation hot paths. Diagnostics must be best effort, including lock contention.
5. No automatic telemetry, implicit upload or long-term retention. CI may attach a sanitized snapshot from its **disposable** Windows instance on W01 timeout; any exported report remains locally controlled.
6. Do not weaken conversation-bound authorization, durable revocation, recovery journal, native Protobuf boundary, or Jan Apache-2.0 packaging to enable tracing.

## Original D0/D1 completion gates (subset only; **not sufficient for revised Alpha**)

- D0: source compiled with/without `lu-foundation`; client and host allowlists tested; fixed-size ring tested; no tool permission/API expansion beyond snapshot.
- D1: real Windows WebView2 test retrieves sanitized host and client event sequence **without** making a second generation request. On a failing W01, CI produces a diagnostic artifact naming the last checkpoint (not raw contents).
- D1: with a successful GGUF reply, traces reach native loop return, UI message completion, and confirmed persisted reply. W02 denial and W04 cancellation remain passing.
- D1: intentional failures produce informative failure classification without leaking user data or causing hangs; a diagnostic error does not cancel the real task.
- Actual installed Alpha A01–A09 and W06 upgrade/license checks are separate release gates, and this document is not proof they passed.

## Explicitly deferred

- Benchmark workloads, cold-load/throughput/TPS measurements, controlled quantization or cross-model comparisons: **post-Alpha revision**.
- Interactive synthetic probes, automated recovery and destructive repairs: post-Alpha unless a specific blocker is established and independently approved.
- Lu-to-Lu diagnostic bridge, network service, automatic support upload and continuous collection: later independent design with explicit pairing/consent.

**Revised working order:** D0 passive checkpoints → full DX-00/01 causal correlation and deterministic fault localization DX-03 → tool/cancel/recovery/persistence diagnostics DX-02 → safety/performance-containment DX-04. Coordinate removal of Cowork and unapproved Jan features as mandatory parallel AX gates. W01/W06 remain regression inputs, not Alpha completion. Benchmarking remains later. The major v1.0 review still follows the **new** working Cowork-free Alpha.
