# Lu release roadmap — decisions and phase order

Updated 2026-10-28. Planning targets, **not** promises of schedule or completed implementation.

## Alpha: standalone Windows foundation
Four gates are specified in [alpha acceptance](alpha-acceptance.md). Do not expand alpha with v1.0/v2.0 scope.

## Lu v1.0: complete vanilla core
Order follows dependencies. Security applies throughout, not only during its dedicated audit.
1. **Runtime stabilization / Jan decoupling**: model lifecycle, Windows packaging, Protobuf IPC, reliable cancellation and state ownership; document intentionally inherited Jan code.
2. **Lu-native tool foundation**: filesystem search/read/write/batches, safe rename/trash/restore, source navigation/Git, research/browsing, structured tool results, document/export operations; permissions and conversation scope enforced.
3. **ANSF + SQLite desktop integration**: retrieval, indexing, memory pane and search, cross-chat links without duplication, edited provenance, belief/context revision; make Browse Memory and Sync Lu Memory work.
4. **Security completion audit**: PolicyEngine, scoped durable grants, cancellation upon revocation, publisher trust/rotation/recovery, consent UI and audit.
5. **Everyday UX**: dual-pane conversations, queue/soft interrupt, reliable model status, task checklist and progress, user-chosen document output paths, themes/preferences, edits and continuity.
6. **Durable jobs / recovery**: supervised workers, progress/heartbeat, checkpoints, cancel/kill and completion notices; avoid unsupported claims of continuous autonomous work.
7. **Opt-in diagnostics and science**: disabled-by-default, human-confirmed testing/benchmarking, reproducible baselines, structured traces and plain-English results. External AI / Lu-to-Lu bridge may be staged into v1.x if not release-ready; no autonomous permissions.
8. **Integration and release hardening**: automated Windows smoke tests, real tool invocation, persistence, cross-component regressions, installer checks, accessible user documentation.

Each phase is accepted only after integrated behavior, passing automated tests, and evidence tied to an exact build. Parallelize independent tasks but avoid destabilizing the alpha branch.

## Lu v1.x
Maintenance, performance, dependency/package management (including previously discussed uv experience improvements), more rigorous diagnostics, and supervised Lu-assisted development. No claim that Lu can deploy itself without human authorization.

## Lu v2.0: DLC expansion
Launch the DLC platform, Core Extension lifecycle, and specialized Workspaces. Priorities: a **minimal useful IDE Workspace** for coding/Git/build/test; **NVP Film Studio Workspace** as the major flagship; optional **Cognitum CE** after standalone smoke tests, matched WITH/WITHOUT baselines, real workloads and Lu-native Protobuf integration. These are not equal-sized projects. Vanilla Lu remains available and useful without DLCs.

NVP should be model/provider-neutral: local and cloud models selected by capability, reliability, privacy and cost; no fixed dependence on Qwen. Cognitum research remains independent of Lu until integration is authorized; scientific efficacy must be measured, not assumed.

## Operating principles
- Windows x86-64 first; Linux/macOS deferred.
- Native first-party tools use Lu's registry and Protobuf IPC, not required MCP servers.
- Models propose actions but cannot grant authority.
- Minimize routine HTP: CI and machine-to-machine evidence, manual acceptance only when necessary.
- Keep plans, evidence and decision changes in [component register](component-register.md).
