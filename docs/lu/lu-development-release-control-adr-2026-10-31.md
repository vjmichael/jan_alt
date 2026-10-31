# ADR-LU-DRC-001 — Disposable Development Runtime and Development & Release Control

**Decision date:** 2026-10-31  
**Status:** **ACCEPTED AS LU CORE ARCHITECTURE; NOT YET IMPLEMENTED OR RELEASE-CERTIFIED**  
**Owner:** Lu Core / native host and independent Guardian  
**Platform first:** Windows x86-64; Windows 10 and Windows 11 require separate real-host acceptance  
**Related design:** [Lu Development Mode shared-inference RFC](https://github.com/vjmichael/jan_alt/blob/lu/ide-dev-mode-shared-inference-rfc-20261031/docs/lu/lu-development-mode-shared-inference-rfc-2026-10-31.md). This ADR governs if that earlier RFC conflicts (notably its optional second interactive development GUI and default embedded IDE implementation).  
**Prerequisite:** Complete and independently verify the existing Lu-Win native chat, installed NSIS, native Protobuf tool and recovery alpha gates. This ADR does not declare that alpha complete.

## Binding architectural decision

**Lu Main is the developer. Lu Dev is a disposable test/execution environment.** The user works with the protected, known-good Lu Main interface. Lu Main plans changes, directs development, reads evidence and presents promotion choices. Lu Dev is not a second assistant the user must operate; it is an isolated, ordinarily **headless**, recreatable set of source workspaces, builds, test profiles, and bounded test processes.

Lu Main and any model-dependent test client borrow the **same single resident model** from a separately supervised and authenticated inference broker. A Lu Dev build does not auto-load another 27B-class model. Model-free headless compilation and component tests need no inference session. A disposable GUI is launched only when actual WebView/visual behavior requires it. Model session identity is separate from filesystem/tool authority.

**Development and Release Control (DRC)** is a Lu Core capability available to the IDE DLC and other future workspaces, not an IDE-only feature. It is local/offline-first and uses standard local Git for history, branching and merges. GitHub may archive source and verification milestones but is never a necessary control-plane dependency for local development, rollback or promotion.

### Four separated trust boundaries

| Role | Responsibilities | Cannot do |
|---|---|---|
| **Lu Main (stable)** | User-facing assistant/IDE; propose edits; request bounded development tasks; present diffs/evidence and ask for promotion approval | Directly rewrite its own running executable or protected release records; mint its own promotion approval |
| **DDR — Lu Dev** | Disposable isolated branch/clone; compile, test, benchmark and debug; optional test GUI; emit structured evidence | Write stable install/profile/Guardian/trusted Git refs, use production chat secrets or promote itself |
| **Shared inference broker / Resource Guardian** | Own one model-weight residency, independent client sessions, scheduling, cancellation, VRAM/RAM/CPU budgets, worker supervision | Treat a model-generated instruction as a tool grant; share a production context or secret with the DDR |
| **Independent release Guardian** | Own protected release catalog, immutable artifact verification, staged activation, health checks, rollback and recovery launcher | Trust Lu Dev's self-reported success without verification; destroy a known-good fallback merely to install a candidate |

The resource manager and release Guardian may be separately deployed processes with different privileges; do **not** assume that a process sharing Lu Main's Windows user token is an adequate security boundary.

## Non-negotiable invariants

- **DRC-I01 — Stable immutability:** DDR never edits the active executable, DLLs, manifest, installed plugin files or production conversation database in place.
- **DRC-I02 — Protected authority:** Only the independently authorized Guardian can change a protected installation or activate a stable release; Lu Main may request, never impersonate this authority.
- **DRC-I03 — Offline history:** Source commits, branches, reviews, test receipts and release catalogs work offline. Remote Git operations are optional, distinct, authorized actions.
- **DRC-I04 — Branch any stable source:** Lu can spawn an isolated development branch from **any retained, verified stable source revision**. The installed Lu Main version need not move.
- **DRC-I05 — Stable rollback availability:** A rollback target requires an intact verified binary/package (or a reproducible, reverified build), protected manifest, matching platform, and compatible state snapshot/migration plan. **A Git tag alone does not guarantee a runnable rollback.**
- **DRC-I06 — Data safety:** Never silently roll back databases across incompatible/irreversible migrations. Preserve newer conversations and offer snapshot/forward-port/export when a direct downgrade is unsafe.
- **DRC-I07 — No self-certification:** DDR's logs and test claims are untrusted until an independent host verifier validates tests, observed process state, artifact hashes, and evidence provenance.
- **DRC-I08 — Merge is not deployment:** A successful branch merge, staging integration, build or individual test never automatically changes Lu Stable.
- **DRC-I09 — User-governed promotion:** Core binary, native ABI, Guardian or destructive schema promotion requires explicit user approval tied to an immutable candidate digest and a rollback plan. An AI cannot approve its own promotion. Automatic Guardian rollback on failed health checks is allowed.
- **DRC-I10 — One model by default:** Shared broker owns one resident GGUF; dev clients have independent authenticated sessions and scoped cancellations. Missing or stale VRAM telemetry must not trigger duplicate model loading.
- **DRC-I11 — Headless default:** Headless DDR runs unit, Rust, Protobuf, SQLite, Cognitum, benchmark and native-worker tests; GUI is opt-in by test requirement, not a second regular user-facing Lu.
- **DRC-I12 — Bounded failure:** A failed build, crash, cancellation, timeout, IPC mismatch, invalid tool request or malicious test must remain inside DDR and never require reinstalling Lu Stable.
- **DRC-I13 — Evidence-scoped authorization:** Models can propose code/tool calls but never authorize themselves; every host operation is conversation/task scoped, cancellable and journaled. Tool discovery ≠ tool authorization.
- **DRC-I14 — Release integrity:** Promotion uses a source commit ID, deterministic/reproducible build information, binary SHA-256, independently trusted manifest or signature, test-receipt IDs, schema compatibility metadata, and provenance; no mutable "latest" pointer can substitute.
- **DRC-I15 — Rescue without AI:** The Guardian's launcher, last-known-good catalog and rollback UI/CLI must function without Lu Main, the DDR, GitHub, the inference model, or an intact network connection.

## Local Git development/release model

Use a **Guardian-protected canonical Git repository/release ledger** and isolated DDR clones or restricted worktrees. A naive shared worktree under the same unrestricted Windows token is *not* isolation: a compromised test process could rewrite shared Git refs or object stores. Provide OS-enforced filesystem/token separation or a host-controlled Git operation broker with write access restricted to disposable refs; the protected release ledger remains outside DDR authority.

Source refs (illustrative, not authorization): \`lu/stable/<version>\` immutable protected tags; \`lu/dev/<task-id>\` disposable feature branches; \`lu/staging/<candidate-id>\` integration branch; \`lu/release/<release-id>\` immutable candidate snapshot. Require conflict resolution and full *post-merge* regression evidence. Rebase/cherry-pick may be used only in dev/staging and must not rewrite the attested stable release record.

**Branch-from-stable:** Lu Main chooses any retained stable revision, asks the host Git broker for an isolated clone/workspace, and develops there. This never downgrades Lu Main or changes the current production data. Past stable versions can anchor multiple independent experiments, including tests of regressions introduced in later versions.

**Release catalog:** Each stable entry pins:
1. Source commit + protected stable tag and source archival availability.
2. Exact installed binaries/resources/package digest and architecture.
3. Build/toolchain/ABI/Protobuf schema versions and license/provenance inventory.
4. Validation receipt digest, independent verifier identity and passed gate list.
5. Data schema compatibility range, migration direction and snapshot/backup references.
6. Prior known-good slot and tested rollback protocol.

Retain at least a **current** and **previous** known-good install slot, plus configurable archived stable releases and checksummed snapshots within disk quotas. Never prune the only safe fallback. When the user asks to roll back to an older stable version whose artifacts are missing or incompatible, show the limitation and offer reverified rebuilding or a compatible migration—never pretend any arbitrary commit can just be installed.

## Development → independent release pipeline

1. **Branch:** Lu Main opens a change request from an explicitly identified stable commit or staging baseline; host authorizes a disposable clone/workspace and scopes filesystem permissions.
2. **Develop:** Lu Main uses one shared AI model to reason and edit; DDR compiles/tests in headless bounded workers. A GUI test process is created only if needed.
3. **Test:** Run unit/component, IPC/Protobuf contract, security/authorization, native-tool, resource and relevant real-model checks. Timeouts and cancellation count as failed or inconclusive evidence, never success.
4. **Verify:** Independent host validates test receipts, binaries, source diff, regression coverage, resource and profile boundaries; it must detect contradictory, missing, replayed or unverifiable evidence.
5. **Merge into staging:** Protected merge policy ensures review and conflicts are resolved. **All integration gates rerun against the merged tree**, not just the pre-merge feature branches.
6. **Release candidate:** Package exactly the staged revision into an immutable, checksummed signed/locally attested artifact; exercise the *installed* package on target Windows, including launch, real GGUF chat, authorized native tool execution, saved-conversation recovery, shutdown, reinstall/upgrade and uninstall.
7. **User approval:** Lu Main presents a human-readable change summary, diff, known risks, test matrix and rollback/data compatibility. The Guardian requires approval for the exact candidate digest before touching stable files.
8. **Staged promotion:** Guardian prepares Lu B in an inactive slot and snapshots compatible data. Close/drain Lu A; activate B with its own policy/permissions, perform independent heartbeat/startup/storage/native-tool smoke checks. Do not delete A on successful activation.
9. **Automatic recovery:** On crash, failed health criteria or failed migration, Guardian switches back to retained Lu A and restores a compatible snapshot, preserving unmerged newer user data for review/export. Log failure without secrets.
10. **Post-release:** Only after a defined healthy interval may B become a **verified stable** catalog entry; archive releases according to retention policy. Later development may branch from A, B or any older retained stable.

**No automatic model-driven core self-upgrade.** Lu Main may ask to develop and validate an improvement; it cannot decide to install that improvement just because DDR reported functional tests passing. "Merge" and "Promote" are distinct host actions with separate privileges.

## Windows-specific safety

- Ordinary Lu/DDR operation uses standard-user privilege. Production installation protected by Windows ACLs (e.g., appropriately restricted Program Files installation) and an independently privileged/narrow Guardian update service where appropriate. An ordinary same-user user-writable installation cannot claim strong OS-enforced separation from arbitrary same-user native tools.
- Headless/test workers use restricted tokens/AppContainer or equivalent, explicit path brokers, supervised process trees and Windows Job Objects for memory/CPU/process containment where applicable. Job Objects do not implement a VRAM quota or substitute for ACLs.
- No unsupported hot replacement of loaded Windows Rust/Tauri core DLLs or executable. Native workers may use versioned drain/swap with a validated IPC handshake; core promotion is a controlled restart. All update paths must handle locked files, child/descendant termination and interrupted transactions.
- A separately supervised model broker may outlive a restarted GUI only if its lifecycle, client leases, authentication, reaping, idle shutdown and revocation are independently correct. Today's alpha intentionally unloads the Lu-owned inference child on desktop exit; do not weaken that contract before the independent broker exists.
- Test Windows 10 x86-64 and Windows 11 separately. A Windows 11 CI pass does not certify Windows 10 support.

## Explicit failure cases to prove

DDR compile fail; model/tool JSON invalid; unauthorized file write; malicious altered Git ref; resource exhaustion; canceled build with grandchildren; Tauri/WebView startup failure; bad native ABI/Protobuf handshake; timed-out post-promotion health check; simulated power interruption during slot switch; missing or corrupt stable artifact; outdated rollback target and forward-only database migration; disk-full snapshot/retention; compromised/replayed verifier receipt; Guardian unavailable; stale inference lease; attempted unapproved promotion.

For every case: either no stable change occurs, or the independently controlled Guardian safely restores a viable known-good application and compatible user data. User gets a bounded failure report and a manual rescue option.

## Scope and implementation order

Keep current Windows alpha/installer/native-tool work as first priority. Then implement: DRC local Git host broker + protected release catalog; disposable headless DDR + OS isolation; independent evidence verifier; one-model broker/resource Guardian; staging/merge gates; dual-slot release Guardian; compatible data-snapshot/rollback; Windows 10 and 11 install/rollback acceptance; optional GUI-on-demand and DLC integrations. See [DRC acceptance matrix](./lu-drc-acceptance-gates-2026-10-31.md) and [machine-readable design contract](./lu-drc-policy-v1.json).

**Non-goals:** unrestricted recursive self-modification, unsupervised core deployment, relying on GitHub CI for local progress, making the user operate a second Lu GUI, trusting model output as evidence, or promising that a missing/incompatible historical version can be restored without prerequisites.

**Interpretation:** This is an auditable software-development/release-control design, not autonomous uncontrolled "self-improvement." An AI that can change its code is useful; a system that can prove those changes safe and recover from its mistakes is the actual objective.
