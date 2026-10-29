# Lu release roadmap — decisions and phase order

Updated 2026-10-29. Planning targets, **not** promises of schedule or completed implementation.

## Alpha: **rebaselined** Cowork-free Windows x86-64 foundation

**Release postponed; no new ETA.** The older four-outcome "standalone Jan
compatibility" baseline is superseded. New binding acceptance:
[Alpha acceptance](alpha-acceptance.md) and
[architecture/extraction/DX decision](../lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).

Before Alpha, **remove Cowork completely from Lu's bundled/build-reachable
code, IPC/feature registrations, UI and runtime; remove or replace all
non-inheritable Jan code/features**. Audit retained Jan-origin foundations
separately, preserve required Apache-2.0 attribution. No Jan/Cowork fallback
or mock-Jan-provider bootstrap may qualify as Alpha release evidence.

Also before Alpha, implement **causal, end-to-end diagnostics for accurate
fault localization** with correlated stages and bounded failure evidence,
including the user turn, authorization, model/tool loop, delivery, persistence,
render, cancellation and worker recovery. Mere frontend logs/rings are
insufficient. See the
[DX design](../lu-alpha-diagnostics-fault-localization-2026-10-29.md).
Keep deterministic targeted fault probes as needed for diagnosis, but defer
benchmark datasets and performance comparison features.

The original Windows GGUF/Protobuf/permission, cancellation, profile,
installer and license gates all remain required **in addition to** AX/DX.

Detailed phase-by-phase implementation and verification gates: [v1.0 implementation and qualification](v1-implementation-verification.md).

## Lu v1.0: complete vanilla core
Order follows dependencies. Security applies throughout, not only during its dedicated audit.
1. **Runtime stabilization / audit already-independent Lu**: refine model lifecycle, Windows packaging, Protobuf IPC, reliable cancellation and state ownership *after Alpha's mandatory Cowork and unapproved Jan-feature extraction*. Do not defer Cowork removal to v1.0.
2. **Lu-native tool foundation**: filesystem search/read/write/batches, safe rename/trash/restore, source navigation/Git, research/browsing, structured tool results, document/export operations; permissions and conversation scope enforced.
3. **ANSF + SQLite desktop integration**: retrieval, indexing, memory pane and search, cross-chat links without duplication, edited provenance, belief/context revision; make Browse Memory and Sync Lu Memory work.
4. **Security completion audit**: PolicyEngine, scoped durable grants, cancellation upon revocation, publisher trust/rotation/recovery, consent UI and audit.
5. **Everyday UX**: dual-pane conversations, queue/soft interrupt, reliable model status, task checklist and progress, user-chosen document output paths, themes/preferences, edits and continuity.
6. **Durable jobs / recovery**: supervised workers, progress/heartbeat, checkpoints, cancel/kill and completion notices; avoid unsupported claims of continuous autonomous work.
7. **Diagnostics maturation and optional research**: extend Alpha's fault localization into consented health checks, reliability reporting and future research tools. **Benchmarking remains deferred to a later revision**, with its own consent, controlled baselines and no Alpha release dependence. Lu-to-Lu bridge is a separately authorized future milestone; no autonomous permissions.
8. **Integration and release hardening**: automated Windows smoke tests, real tool invocation, persistence, cross-component regressions, installer checks, accessible user documentation.

Each phase is accepted only after integrated behavior, passing automated tests, and evidence tied to an exact build. Parallelize independent tasks but avoid destabilizing the alpha branch.

## Lu v1.x and later diagnostic/benchmark revisions
Maintenance, dependency/package management (including previously discussed uv experience improvements), more rigorous diagnostics, and supervised Lu-assisted development. Define benchmarking scope **only after** Alpha's operational diagnostic system is validated; do not bundle throughput or comparison testing into Alpha. No claim that Lu can deploy itself without human authorization.

## Lu v2.0: DLC expansion
Launch the DLC platform, Core Extension lifecycle, and specialized Workspaces. Priorities: a **minimal useful IDE Workspace** for coding/Git/build/test; **NVP Film Studio Workspace** as the major flagship; optional **Cognitum CE** after standalone smoke tests, matched WITH/WITHOUT baselines, real workloads and Lu-native Protobuf integration. These are not equal-sized projects. Vanilla Lu remains available and useful without DLCs.

NVP should be model/provider-neutral: local and cloud models selected by capability, reliability, privacy and cost; no fixed dependence on Qwen. Cognitum research remains independent of Lu until integration is authorized; scientific efficacy must be measured, not assumed.

## Operating principles
- Windows x86-64 first; Linux/macOS deferred.
- Native first-party tools use Lu's registry and Protobuf IPC, not required MCP servers.
- Models propose actions but cannot grant authority.
- Minimize routine HTP: CI and machine-to-machine evidence, manual acceptance only when necessary.
- Keep plans, evidence and decision changes in [component register](component-register.md).
