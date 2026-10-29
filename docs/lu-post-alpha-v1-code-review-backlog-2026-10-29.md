# Lu: Post-Alpha major code review and v1.0 planning gate

**Status: BLOCKED — do not start until Lu Alpha 0.1 is BUILT, INSTALLED, and RUNNING.**

## Entry criteria (all required)
1. A distinct Lu Windows x86-64 NSIS installer has been built, its source SHA and installer SHA-256 recorded, and it has actually installed and launched on a disposable Windows desktop.
2. The installed Alpha loads a trusted GGUF and displays a real, persisted assistant reply in Lu's desktop chat. A Jan preview, isolated worker test, or source-only CI pass is not equivalent.
3. Record the observed Windows acceptance evidence, open defects and remaining Alpha gates. Do not let a partial run or passing fast harness count as installed-desktop verification.

**Not an Alpha blocker:** This review is intentionally deferred until Alpha is usable. W01/W06 and other Alpha/4H gates take priority.

## Purpose
Conduct a thorough, evidence-based review of Lu's source, architecture, security, testing and release path to determine the remaining steps toward **Lu v1.0**. Prefer small, independently tested batches over wholesale rewriting Jan.

## Review checklist
- Remaining Jan monolith, Cowork/TypeScript/Rust coupling, boundaries for native extraction, and Jan Apache-2.0 provenance, LICENSE/NOTICE, third-party attributions, historical upgrade debt.
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
3. Alpha -> beta -> v1.0 milestones, clearly separated release blockers, opportunistic improvements and deferred work.
4. Small testable implementation batches, owners/dependencies, acceptance tests and CI gates.
5. Explicit decisions on retaining/replacing each significant Jan-derived component and preserving license obligations.

## Exit criteria
Written review, actionable prioritized roadmap and traceable gate criteria, with no unapproved large-scale rewrites. Start **only after** the entry criteria are observed, not when a build is merely queued.
