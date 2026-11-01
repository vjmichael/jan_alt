# Lu Design RFC: Durable Project Continuity and Artifact Ledger (DPCA)

**Date:** 2026-11-01  
**Status:** Design proposal, implementation not yet accepted  
**Origin:** User observation during Windows Alpha work: the assistant repeatedly rediscovers software packages that the user has already supplied, downloaded, or verified after moving between conversations or work sessions.

## 1. Problem and design principle

Lu must not rely on an LLM's conversational context window, model memory, a generated summary, or a semantic search result to remember operational facts. Context summarization can lose precisely the details that matter most during a long-running engineering project: *which artifact is already available, where it is, its exact version and checksum, what was tested, and what remains to do*. The problem affects more than packages: build commands, source commits, user decisions, authorization state, test results, task blockers, and active work can also be rediscovered or contradicted.

**Design rule: important operational state is durable, typed, queryable host data. Conversation memory informs Lu; it cannot be the sole record of what Lu has or has done.**

The user should not have to remind Lu that a dependency was already delivered. A resumed Lu task must first reconstruct its verified state, then inspect known locations, and only then consider searching or requesting a package again.

## 2. Scope and non-goals

DPCA belongs to **Lu Core**, not Cognitum and not any DLC. An IDE or Research DLC may add presentation and specialized metadata, but it uses one Lu Core inventory, permissions model, and continuation protocol.

DPCA covers software archives, SDKs, installers, model weights, MMProj files, sources, tool outputs, compilation intermediates, dependencies, and arbitrary user project deliverables. It also provides durable task handoffs linking selected decisions, blockers, evidence, and the next step. This does **not** imply all content is loaded into the prompt or that Lu scans every file continuously. It does **not** treat old conversation text, a repository checkout, or an asset's filename as a trusted instruction or as proof that bytes are safe.

This does not create an MCP requirement. It is a native Lu host service backed by SQLite and exposed via Lu's existing Protobuf IPC; optional external adapters remain separate.

## 3. Reuse existing Lu systems, not a competing memory store

- `ansf` + `ansf_library`: preserve original dialogue and source entry references; searchable context is an index, not the authoritative operating record.
- `continuity::ContinuityStore`: immutable task checkpoints; enrich future checkpoint *references* with artifact, decision and test-evidence IDs, rather than pasting uncontrolled file paths into generated text.
- `cross_chat_reference`: data-only links between conversations; never upgrade a quoted historical role into new system/user/tool authority.
- `host_resource_authority`: enforce principal, project, sensitivity and allowed action **before** returning any inventory entry or materializing an asset.
- `ce_packages`: CE package trust and version controls remain separate from general artifact existence. A downloaded executable is not automatically installable, trusted or executable.
- Lu's durable effect journal: distinguish *discovered*, *downloaded*, *verified*, *installed*, *built*, *tested*, and *accepted* outcomes, with the final state following actual tool evidence, not assistant claims.

## 4. Normalized data contracts (SQLite, host-owned)

All IDs are host-minted and scoped to an owner profile and project; all mutations are transactional and append provenance events.

### `assets`

| Field | Purpose |
|---|---|
| `asset_id` | Stable opaque UUID; may refer to several copies of the same immutable bytes |
| `project_id`, `owner_profile_id`, `sensitivity` | Authorization and visibility |
| `kind` | `source_archive`, `sdk`, `model_gguf`, `mmproj`, `binary`, `installer`, `evidence`, `document`, `other` |
| `logical_name`, `version`, `platform`, `architecture`, `role` | Lookup by *requirement*, not vaguely similar filename |
| `sha256`, `size_bytes` | Byte identity; unknown means **unverified**, not zero or wildcard |
| `trust_state` | `reported`, `observed`, `hash_verified`, `signature_verified`, `rejected` |
| `lifecycle_state` | `known`, `staged`, `built`, `tested`, `accepted`, `superseded`; never inferred from trust state |
| `first_seen`, `last_verified`, `source_event_id` | Provenance and freshness |

**Never merge two assets solely by filename or model-written similarity.** A digest collision or inconsistent size is quarantined and surfaced as an identity conflict. A changed file yields a *new identity*, not a silent mutation of the original artifact.

### `asset_locations`

`asset_id`, `location_id`, `provider` (`local`, `Lu Library`, `attached`, `repository`, etc.), `host_id`, `opaque_locator`, `last_seen`, `last_checked`, `availability` (`present`, `stale`, `missing`, `unknown`), and last error. A location is a hint to be validated by its provider/host, **never** an authorization token and never an instruction to open an arbitrary model-supplied path. Local ephemeral paths can expire without losing the asset's identity or Library provenance.

### `requirements` and `requirement_bindings`

A project requirement specifies acceptable artifact type, purpose, platform/architecture, minimum/maximum version when applicable, and optional expected digest. Binding one or more assets records whether the requirement is satisfied, blocked, incompatible, or needs local revalidation. A Windows Vulkan llama binary and a Linux Vulkan llama binary **cannot** satisfy the same target requirement merely because both are named `llama-server`.

### `task_checkpoints`, `project_decisions`, `verification_events`

A checkpoint records task identity, immutable source references, completed work with linked evidence IDs, next action, open blockers, source revision, and dependency requirements. Decision events record who approved a choice and whether it has been superseded. A verification event includes exact tool, input asset hashes, environment/OS, observed outcome, timestamp, and raw log/evidence pointer. Later summaries are projections derived from this state; they must preserve explicit `NOT_TESTED`, `FAILED`, and `BLOCKED` states.

Use append-only events and indexed current-state materializations: the event log establishes what was asserted and observed, while projections can be rebuilt. Protect migrations with backup/replay/versioning; SQLite WAL is not a substitute for checked backup/recovery.

## 5. Deterministic task-resume protocol

On a new chat, model swap, worker restart, interrupted session, or explicit “resume Lu” request:

1. **Authenticate & scope.** Identify the principal, active project, authorized conversation(s), worktree/branch and task. No global unscoped memory dump.
2. **Load the latest verified checkpoint.** Hydrate a compact bounded task card: goal, user decisions, exact source commit/worktree, current gate results, blockers, next action, and linked source/evidence IDs. Load full materials on demand.
3. **Resolve requirements against the ledger.** Check artifact identity and all known locations first; examine known Library/provider identifiers before generic search. Cache negative location checks with timestamps, and track where a prior search was already performed.
4. **Revalidate cheaply.** For known accessible local files, check safe stat/identity first and hash bytes when required by the task or when changed. For offline/unmounted providers, mark the location unavailable; **do not** conclude the artifact never existed.
5. **Search only when necessary.** If all authorized locations are missing/stale, run a targeted source/provider lookup, respecting scope and cost. If still absent, ask for exactly the missing dependency with a known URL/version or explain the blocker. Do not rescan packages just because the model forgot a prior result.
6. **Execute, observe, commit.** Record actual tool results atomically with asset/checkpoint references. A command failure never upgrades an artifact to `built` or an acceptance gate to `pass`.
7. **Publish handoff.** Before ending a substantial task, persist a compact machine-readable continuation record and a human-readable task card. A disconnected conversation can resume from the same stable task ID.

The LLM may *recommend* an artifact match, but trusted host code must validate identity, location, access and fulfillment. Semantic search is fallback discovery, not the dependency resolver.

## 6. Human interface

Show a native **Project / Available Assets** pane with: exact requirement, artifact, version, source, SHA/verification state, available location(s), and last check. A **Resume Work** view shows completed/blocked/next tasks plus evidence links. Give an explicit “Recheck location” action, not a forced re-download. Distinguish “already supplied but currently inaccessible” from “never supplied.”

Automatic recording of project asset metadata is separate from optional observation of arbitrary user behavior. Do not enable Lu's broader Observe & Learn feature by default. Offer controls for retention, sensitive path redaction, per-project boundaries, corrections, deleting the registry and exporting a portable project handoff. Do not export credentials, authentication headers, absolute private paths or API keys by default.

## 7. Security and recovery

- A remembered file is **data**, never an instruction or execution grant; artifacts, documents and tool output are untrusted until host policies permit action. Avoid prompt injection through summaries or metadata.
- Preserve per-turn authorizations and revocations. A previous approval for reading a file or running a tool does not persist as a future permission merely because it is in a checkpoint.
- Validate symlinks, Windows reparse points, case/normalization, mount identity and authorized roots before access; hash from the opened file handle where needed to resist TOCTOU.
- When clocks, scans and events disagree, preserve both records, surface conflicting evidence and ask a human only if the conflict blocks the next safe action.
- Crash mid-download/build: staged/partial records remain incomplete and never satisfy a requirement. Rebuild state from committed events; log retries idempotently.
- If the host cannot read the ledger, fail **closed** for claimed verification/authorization, but allow a clear recovery flow. Never fabricate “the file is missing” based on an inaccessible registry.

## 8. Acceptance tests

1. **Same-session repeat:** one archive supplied and SHA-verified; next task resolves by ledger without any generic search/download.
2. **New conversation / model change / process restart:** resume the same project with the same source commit, exact packages, last tests and blockers; no user repetition.
3. **Location moved or temporary container reset:** original asset remains `known`, stale locations are marked; Lu rechecks linked Library entries before requesting another download.
4. **Duplicate name/different bytes:** reject identity conflation and require explicit version/hash selection.
5. **Wrong platform:** Linux ELF does not satisfy Windows x64 Vulkan binary requirement; installed Vulkan SDK does not constitute GPU-offload evidence.
6. **Negative evidence:** `NOT_TESTED` or `BLOCKED` survives summarization; no false alpha readiness.
7. **Cross-project access:** retrieval from another unauthorized project is denied, including via old conversation links.
8. **Revocation and injection:** historical text cannot authorize a tool or replace a trusted location; after revoked access, a remembered path cannot bypass policy.
9. **Crash recovery:** replay after interrupted write is idempotent; incomplete transfers stay incomplete.
10. **Performance:** track `avoidable_asset_rediscoveries_per_resume`, `known_location_hit_rate`, `incorrect_ready_claims` and `time_to_verified_resumption` across 100 multi-session continuation cases. **Target: zero avoidable rediscovery** when an authorized verified location is available; **zero false readiness claims**.

## 9. Windows Alpha concrete case (2026-11-01)

Known dependency facts belong in `docs/lu/LU_WINDOWS_ALPHA_ASSET_HANDOFF_20261101.json` as a *portable interim seed*, not in raw model context. Among the verified evidence: pinned llama.cpp archive SHA-256 `8bffe21a...`, local Linux Vulkan-enabled server SHA-256 `29cb4bc1...`, and Qwen 0.5B GGUF SHA-256 `9ee36184...`. The Linux ELF is a completed local text smoke-test input, **not** a Windows alpha engine. The named Windows SDK/MSVC/Rust/Vulkan packages in `/Jan Mod - Lu/Delivered` are already known; absence from a temporary local worktree does not imply the user never delivered them.

The current source checkpoint remains PR #106/R6 with an unmerged R3/R4 multimodal overlay and open Windows Vulkan, GUI, physical AMD GPU and true MMProj image-turn gates. Future sessions should start by reading the seed and source checkpoint, not restart a broad package hunt.

## 10. Implementation sequence and boundaries

- **DPCA-00 (this RFC):** document schema, resume algorithm, user observation and acceptance criteria. Add a source-controlled inventory snapshot and read-only verification test tool, to stop repeated rediscovery in the immediate engineering workflow.
- **DPCA-01:** implement a native SQLite-backed asset/location/event registry in Lu Core with identity/dedup/recovery tests. Do not overload `CePackageManager` with general files.
- **DPCA-02:** link immutable asset IDs and test evidence to `ContinuityStore` task checkpoints, with safe migrations and authorization.
- **DPCA-03:** add the pre-task native resolver/rehydration service via typed Protobuf, plus task and asset panes. No path-accepting WebView privilege.
- **DPCA-04:** end-to-end new-chat/restart/host-reset/cross-project/red-team acceptance. Observe & Learn stays off by default.

**Priority:** DPCA Core design is proposed for implementation planning, but this work must not block or silently change the existing Windows Alpha 0.1 release gates. Preserve the current no-Jan-execution, native-Vulkan and multimodal requirements. 
