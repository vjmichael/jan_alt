# Lu: Post-Alpha major code review and v1.0 planning gate

**Status: BLOCKED — do not start until the **REBASELINED Cowork-free** Lu Alpha is BUILT, INSTALLED, and RUNNING.** The former transitional preview no longer satisfies this trigger. See [Alpha architecture decision](lu-alpha-rebaseline-cowork-extraction-and-diagnostics-2026-10-29.md).

## Entry criteria (all required)
1. A distinct **Cowork-free** Lu Windows x86-64 NSIS installer has been built, its source SHA and installer SHA-256 recorded, and it has actually installed and launched on a disposable Windows desktop; AX source/build dependency and bundle exclusion evidence is attached.
2. The installed Lu-only Alpha loads a trusted GGUF and displays a real, persisted assistant reply in its own desktop chat **without Cowork, Jan compatibility runtime or a Jan mock-provider bootstrap**. A Jan preview, isolated worker test, or source-only CI pass is not equivalent.
3. Record real Windows A01–A09 **plus AX-00..04 and DX-00..04** evidence, open defects and the final candidate. The fault-localizing diagnostic chain must be verified. Do not let a partial run, earlier pin or passing fast harness count as installed-desktop proof.

**Not an Alpha blocker:** this *comprehensive* review remains deferred. A narrow **pre-Alpha Cowork/Jan extraction audit and diagnostic fault-localization review are mandatory engineering gates** and are **not** the deferred v1.0 review. Existing W01/W06 and the new AX/DX gates take priority.

## Purpose
Conduct a thorough, evidence-based review of Lu's source, architecture, security, testing and release path to determine the remaining steps toward **Lu v1.0**. Prefer small, independently tested batches over wholesale rewriting Jan.

## Review checklist
- Audit the completed Alpha extraction: **verify that no Cowork or non-inheritable Jan code shipped**, no compatibility fallback remains, and each approved Jan-derived foundation retains Apache-2.0 provenance/NOTICE; look for residual architectural debt *within the allowed Lu-native components*, not a plan to postpone Cowork removal.
- Lu native Protobuf IPC contracts, schema compatibility/versioning, model JSON boundary repair/validation, tool registry/dispatcher, conversation-bound authorization, policy engine, revocation and publisher trust.
- Persistent llama.cpp GGUF runtime, GPU backend selection/fallback, model loading, native chat streaming, persisted messages, UI/host error reporting and recovery.
- Windows install/update/uninstall, worker supervision, process-tree termination, cancellation, checkpoint/effect journal and startup recovery.
- ANSF/SQLite memory, linked conversations, edit history, profile isolation and migration.
- Security review of filesystem scopes, task identity, saved-turn provenance, sandbox boundaries, external connectors, log privacy and provenance evidence.
- UX/accessibility, no-CLI user expectation, performance/memory/latency benchmarks and Windows installed-desktop CI coverage.
- Deferred v1.0 vs post-v1.0 features: Linux/macOS, DLC Workspaces, optional CEs, mobile and cross-device linking.

## Deliverables
1. File/line-grounded module and remaining-Jan dependency map.
2. Prioritized security/reliability/performance issue register with evidence, severity and regression risks.
3. Operational Cowork-free Alpha -> beta -> v1.0 milestones, separating post-Alpha release blockers, opportunistic improvements and deferred features; benchmarking remains a separately scoped later revision.
4. Small testable implementation batches, owners/dependencies, acceptance tests and CI gates.
5. Explicit decisions on retaining/replacing each significant Jan-derived component and preserving license obligations.

## Exit criteria
Written review, actionable prioritized roadmap and traceable gate criteria, with no unapproved large-scale rewrites. Start **only after** the entry criteria are observed, not when a build is merely queued.
