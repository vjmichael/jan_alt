# Lu Alpha — revised architecture and diagnostic release decision

**Decision date:** 2026-10-29  
**Authority:** User's explicit engineering directive; supersedes earlier Alpha compatibility assumptions.  
**Status:** Approved *requirements and gate plan*, NOT implemented or accepted. Alpha is **rescheduled / release date not committed**. Windows x86-64 remains the only Alpha distribution target.

## Executive decision

Lu Alpha is no longer a transitional Jan/Cowork-backed desktop preview. **Alpha must run as a Lu-owned application without Cowork and without any Jan-origin code or feature that has not been explicitly approved for inheritance.** Cowork is **not** an Alpha component, compatibility mode, fallback, optional module, bundled resource, registered command, or disabled-but-shipped feature.

Lu's trustworthy host, inference, tools, worker supervision, IPC and UI composition must form an independent, verifiable execution path. The repository's Jan history may remain in Git for attribution and migration, but that is not permission to include Cowork in the Alpha executable or JS/Rust dependency closure. An archived migration-only source tree is not a shipped feature; the final Alpha build graph and NSIS bundle must be Cowork-free.

**Prerequisite:** advance Lu's diagnostic design to an effective **end-to-end, fault-localizing subsystem** before attempting final Alpha acceptance. This is more than accumulating log lines. It must establish the last confirmed and first unconfirmed stage of a failed operation, with safely correlated spans/outcomes, bounded time/resource observations and a useful cause-proximity report. It need not claim an impossible perfect internal explanation of arbitrary LLM failures; when evidence is insufficient, say so and identify the unobserved boundary.

**Explicitly deferred:** benchmarking/speed comparisons, model-scoring and evaluation harnesses, statistical performance experiments, continuous GPU profiling beyond fault diagnosis, automatic model tuning, Lu-to-Lu remote diagnostic bridge, proactive/remote telemetry, and nonessential diagnostic feature expansion. An active diagnostic probe or repair that changes state requires separate human approval; passive, content-free observation of an already-authorized operation must not grant authority or start extra workloads.

## Scope boundary — what inherited Jan code means

Each build-reachable Jan-origin module/asset must receive an explicit disposition with owner, source path and evidence:

| Class | Alpha treatment |
| --- | --- |
| **Lu-owned/replacement** | Preferred: Lu native engine, conversation/permission authority, typed Protobuf IPC, tool registry, worker/task supervisor, host-side trace and standalone Lu chat path |
| **Explicitly approved Jan-derived foundation** | May remain *only* when it is a deliberately inherited reusable component, has no Cowork/runtime fallback dependency, has tests, and retains required Jan/third-party notices |
| **Jan non-inheritable feature** | Remove/exclude from Lu Alpha source build graph, registrations, UI/routes, feature flags and NSIS bundle; replace essential functionality with a Lu implementation |
| **Cowork (all surfaces)** | **Prohibited for Alpha.** No use or shipment of Cowork runners, dispatch, transports, session/approval machinery, UI, commands or embedded resources |
| **Unknown/unclassified** | **Fail-closed** for Alpha acceptance until origin, ownership and dependency reachability are reviewed; no implicit grandfathering |

"Jan-origin" is not automatically "non-inheritable": proven reusable Jan-derived foundations can remain under attribution when consciously accepted. "No Cowork" is absolute for the shipped Alpha. Removing code never removes Apache-2.0/NOTICE obligations on the Jan-derived files and binaries actually retained. Keep copyright, modified-file notices, license manifests and historical repository attribution.

## New Alpha blocking gate order

**AX-00 — classification and reachability inventory** (before deleting): enumerate actual imports/calls from desktop entrypoints through TypeScript, Tauri/Rust, native tool/plugin registries, IPC, worker and bundle. Account for `web-app/src/lib/coworkRunner.ts`, `coworkDispatch.ts`, `coworkTransport.ts`, `coworkTools.ts`, `custom-chat-transport.ts`, `agentTools.ts`, `src-tauri/plugins/tauri-plugin-agent-tools/` and `src-tauri/src/core/agent/`. Paths here are **audit leads**, not claims that every named file is wholly Cowork or must be indiscriminately deleted.

**AX-01 — Lu-owned replacements:** implement and verify the Lu-native conversation/tool/worker/UI paths needed for Alpha, preserving saved USER-turn host authority, Protobuf internal transport, JSON repair-then-validate only at model/external boundaries, durable effect journal, cancellation and recovery. Reuse audited inheritable utilities rather than rewriting safe core libraries without evidence.

**AX-02 — Cowork and non-inheritable Jan exclusion:** no Cowork import/dispatch/routing/registration; no Jan compatibility fallback selectable or reachable; no Cowork UI/feature enabled or bundled, even behind a feature flag. Inspect optimized built JS, native registration/dependency artifacts, Windows NSIS resource inventory and clean install. A text-search-only check is insufficient; demonstrate absence via dependency graph and runtime negative probes.

**DX-00 through DX-03 — diagnostic localization acceptance:** end-to-end correlated trace of GUI event -> persisted user turn -> IPC -> host authority -> worker/runtime -> model/tool loop -> structured completion/error -> frontend stream -> assistant persistence -> UI render. Track monotonic stage/order, terminal status, elapsed time and generic failure code with an explicit evidence-gap category. Capture deterministic fault-injection cases and a redacted failure report without a user-data leak. See `lu-alpha-diagnostics-fault-localization-2026-10-29.md`.

**AX-03 — revised installed Windows Alpha acceptance:** only after AX-00/01/02 and DX gates pass, rerun the existing A01–A09 and W01–W06 functional/security/NSIS tests against **a new pinned source SHA and a new build**. All original identity, package-integrity, profile-isolation, permission-denial, cancellation, attribution, uninstall and real GGUF/native-tool checks remain necessary. Prior test runs may validate isolated components but cannot certify the newly separated application.

**AX-04 — provenance/compliance release check:** enumerate intentionally retained Jan-derived source and third-party binaries, confirm modified-file notices, verify Jan Apache-2.0 LICENSE/NOTICE in the distributed installer and effective package licensing, and retain source/binary bill of materials. No "100% original code" or "Jan license irrelevant" claim.

The existing nine-gate synthetic evidence schema validates only A01–A09 and is **not sufficient** to approve this revised Alpha. Add independent, fail-closed evidence/manifest fields for AX and DX gates before release; don't silently reinterpret an older green A01–A09 file as proof of architectural separation.

## Consequences for current work

- **4G extraction becomes Alpha-critical**, not optional background work to postpone until v1.0. It now owns extraction inventory + implementation planning and proof; coordination is required so 4H does not reintroduce Cowork/Jan compatibility fallbacks.
- **4H W01/W06 remain engineering regression work** but their old transitional installers are not releasable Alpha. W01 positive acceptance must use Lu's own thread bootstrap and model path rather than a Cowork/Jan provider fallback; tests that bootstrap with a mock Jan provider require migration before serving as Alpha proof.
- **Diagnostics move forward** from design-only/limited front-end breadcrumbs to an integrated DX gate useful for fault localization. The bounded passive prototype is groundwork, not a completed diagnostic system.
- **Rebaseline release:** the previously recorded candidate pin and its checksums remain immutable as historical evidence. They are *superseded for eligibility*, not mutated in place. Create a new candidate pin only after the new build graph and DX gates are satisfied.
- **No launch ETA.** Pushing Alpha back is authorized. Do not trade away the separation or diagnostic gates to preserve the former timeline.
- **No pre-Alpha comprehensive v1.0 review:** the large post-Alpha code review remains after the new Alpha is actually built/installed/running; focused *pre-Alpha extraction/diagnostic reviews* are release engineering, not that deferred review.
- Windows x86-64 remains first. No mandatory MCP for first-party Lu native tools, no Docker/WSL2 requirement for end users, and no broad DLC/Workspace/NVP/Cognitum work as an Alpha blocker.

## Definition of done

A verified Windows NSIS installation runs the Lu desktop, loads an admitted GGUF, produces and persists genuine user-visible replies, performs a conversation-scoped native Protobuf tool turn, cancels/restarts cleanly, retains profile isolation, and uninstalls/upgrades with correct source/package/license attribution. Its build graph, binary/JS bundles and dynamic tests prove no Cowork or unapproved Jan features are shipped or reachable. The diagnostic pipeline can localize injected and real failures to a bounded subsystem/stage interval and produces redacted evidence. All evidence is linked to the **same exact build and artifact**.

**Present status:** a revised target and acceptance plan only. Do **not** mark AX/DX gates or Alpha completed based on this documentation.
