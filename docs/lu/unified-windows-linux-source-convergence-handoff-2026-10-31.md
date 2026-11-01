# Lu Windows + Linux: one-source convergence decision and integration handoff

**Prepared:** 2026-10-31 (America/Phoenix; GitHub UTC 2026-11-01)  
**Status:** architecture and source-reconciliation plan, NOT a merged application, release, or validation pass.  
**Purpose:** coordinate Lu Windows alpha, Lu Linux/Cognitum D04F and experimental IPC development without creating two incompatible Lu applications.  
**Repository role:** source repository and independent verification archive, not the day-to-day development hub. Local-first compilation/testing.

## Decision

**One Lu product, one canonical source tree and ABI, two OS-specific distributables.** The same tagged Git source revision should build a Windows x86-64 NSIS installer and a Linux x86-64 Debian package with the same user-visible Lu feature set (except disclosed OS/backend limitations). There is no literal Windows/Linux universal executable. Two sets of *source branches* may exist for experimental work, but **only one Lu release line** is allowed; no independent Linux app fork or competing Tauri host.

Use the latest **verified Windows native-only Lu core** as the conservative canonical runtime baseline, currently branch **lu/windows-alpha-six-gates-20261031 @ e130dcf53204078661cedf4581eed13e92c9aa93**. Stage the later physical-machine GGUF repair as a separate, not-yet-accepted patch series from **work/lu-win-physical-gguf-registration-20261031 @ 657b5587e50add8314d9939bab75d280a8dee258**. That repair is required before physical Windows acceptance; it must **not** be incorrectly called tested, merged, or released.

Linux source improvements are candidate *modules and tests* for the same runtime, never a replacement for the Windows working tree.

## Audit: source on GitHub versus locally tested code

| Branch / evidence | Last observed head | Actual distinction |
| --- | --- | --- |
| Windows six-gate | e130dcf53204078661cedf4581eed13e92c9aa93 | Real modified Rust/Tauri/frontend/NSIS source; earlier installed CI GGUF/tool/restart PASS on Windows Server 2025; physical Windows 10 Bonsai load failed |
| Windows GGUF fix (unmerged) | 657b5587e50add8314d9939bab75d280a8dee258 | Native OS file-picker, dynamic model admission and OpenSSL-free CPU packaging **staged**, not successfully compiled/released as a whole |
| Linux D04F/P25 next | b335ea0d9cf95ce311fb0e8a9004dcbc50776901 | **31 commits from Linux native host; 29 changed paths, all docs/evidence/.patch, no direct production Rust paths in branch delta** |
| AF_UNIX cross-platform prototype | 75f79fa45ca4d7fd217ada7f1562a0ca92ff0a92 | Real self-contained src-tauri/lu-ipc-common Rust crate and tests, verified independently on native Linux/Windows; not integrated into desktop/tool router |
| Linux kernel/P46 G1 local archive | Library record "README(6).md" | Separate local source fixture: 106/106 Cognitum-enabled Core, 87/87 standard, 11/11 typed policy, 7/7 cgroup probe; read-only cgroup blocked positive kernel proof; Windows fixture **not executed** |
| Original Linux native host | f0238c63c9c0b18b689f60fa3ab3009ba83aaf48 | Source ancestor for developer experiments; NOT the same as a complete D04F reproducible source checkout |

**Do not perform a conventional merge of the Linux D04F documentation branch and assert Cognitum runtime is present.** The complete local D01–D04F source tree, missing intermediate D04B–D04E changes, build dependency closure, and hash-bound fixtures must be recovered first. The Linux branch retains D03, D04A, P46R8 and test patches but not every intermediate production change.

Linux versus Windows branch merge base observed: **c84906528effbfeb1d3a19603de88d8f284727d4**; D04F branch is 33 commits ahead / 66 behind Windows. These counts mean diverged history, not that all 33 commits are runtime changes.

## Common application boundaries: exactly one owner per responsibility

1. **One desktop and one app identity:** shared React/Tauri frontend and Lu-branded settings, model management, conversation UI, persistent chats, projects and native tools. Build-time platform resources may differ; no second Linux-only GUI or alternate chat ledger.
2. **One Lu-owned authority and journal:** src-tauri/lu-core owns authenticated conversation/USER turn, per-turn capability/effect grants, native registry/Protobuf validation, memory, checkpoint/effect journal, revocation, cancellation and durable recovery. A model, tool, WebView, transport or Cognitum worker cannot grant itself rights. Host-selected routing must be distinguishable from model-selected routing.
3. **One model/provider service:** shared catalog and model admission API. Operator chooses existing GGUF anywhere via trusted OS picker; files are referenced *in place*, never forced into AppData or an XDG folder. Runtime validates canonical path, regular file/reparse behavior, GGUF preflight and freshness. Use a single load/unload/stream/cancel status contract. Backend implementations are selected by OS/hardware capabilities.
4. **One native-tool dispatcher:** no Jan/Cowork/MCP-required execution in Lu distribution. Optional MCP compatibility remains an adapter. Cognitum is an opt-in native Core Extension, not a second execution stack.
5. **One worker-protection decision model:** host chooses TrustedSupervisedOnly or KernelRequired based on registered capability/effect. Windows uses Job Object and atomic or suspended admission for strict tier; Linux may use trusted process supervision, with cgroup2 only where verified/delegated for kernel-required tier. A cgroup is NOT mandatory for every first-party Cognitum task. Untrusted arbitrary executable DLC admission remains closed until stronger FS/network/code sandbox evidence.
6. **One optional IPC transport interface:** src-tauri/lu-ipc-common may provide native Linux AF_UNIX and Windows Winsock AF_UNIX framed Protobuf. **Transport ≠ authorization, peer identity, execution policy or descendant containment.** The common transport must be wired behind the same host-issued, per-turn authority and tested on both platforms before adoption.

Suggested source ownership (retain existing modules wherever possible):

- Portable engine contracts: src-tauri/lu-core (inference_supervisor, model_admission, conversation_authority, supervised_tool_generation, model_turn_journal, native registry, memory)
- Tauri host adapter: src-tauri/src/core/lu_inference.rs and current Lu-native desktop command surface
- Optional worker transport: src-tauri/lu-ipc-common (not a second public tool API)
- Platform implementation: Windows Job Object + Vulkan loader / Windows installer; Linux process/cgroup policy + Vulkan loader / Debian package
- Optional Cognitum CE: feature-gated fixed worker, exact fraction operation, bounded host-approved route catalog and non-authoritative P46 recovery observations
- Shared UI: web-app Lu model picker, conversation, projects, diagnostics, settings
- Packaging: platform-specific engine bundles and prerequisites, with shared upstream provenance and source hash

## Conflict and data-migration priorities

**Highest-risk shared paths, require manual three-way reconciliation:**

- lu-core/src/supervised_tool_generation.rs: Windows bounded unknown-tool retry and single-dispatch protection versus Linux host-selected Cognitum tool feedback. NEVER retry an executed host route or grant a tool via recovery.
- lu-core/src/model_turn_journal.rs: Windows durable effect semantics versus Linux HOST_ROUTE_SELECTED transaction/migration. Selection is **not** execution; preserve idempotent SQLite upgrades and event-order checks.
- lu-core/src/conversation_authority.rs, model.rs and native_chat_ids.rs: retain Windows trusted USER-turn identity, reparse/path denial, cross-profile capability isolation. Linux routes may only act on canonical admitted tool descriptors/effects.
- src-tauri/src/core/lu_inference.rs: preserve the Windows working installed chat/send/restore and desktop diagnostics while adding Linux developer host and model/projection options behind explicit flags.
- inference_supervisor.rs/model_admission.rs and frontend picker: preserve the physical Windows bug fix only after new CI/compiler and physical Windows tests; text-only CPU functionality is not yet multimodal or Vulkan.
- Worker manager and IPC: Windows current process-tree cleanup proof is not equal to atomic Job Object containment; Linux read-only cgroup recovery tests are not kernel cleanup proof. Do not silently weaken either tier.
- Installer manifests: both OS packages include exact pinned executable and all dynamically loaded libraries. Windows previous CPU package missed libssl-3-x64.dll because llama.cpp optional OpenSSL was on; fix is -DLLAMA_OPENSSL=OFF + reject PE libssl/libcrypto imports before release, with an actual installed Windows 10 check.
- Existing Jan-origin UI/metadata plugins: native Lu distribution must not call the disabled legacy llama.cpp import API. Preserve upstream Apache-2.0 attribution while removing Jan as an active runtime dependency and cleaning legacy Jan branding.

## Integration sequence / evidence gates

**UC-00: recover complete Linux source** — D04F checked-out exact local tree, L16/P0/D01–D04F patches including missing D04B/C/D/E, source hash, lockfile, worker/fixture hash and tests. For every missing artifact, record exact owner/source and leave gate BLOCKED. No recreating missing code by assuming docs equal source.

**UC-01: freeze common contracts** — shared versioned Protobuf messages, native tool descriptor/effect semantics, conversation IDs, SQLite migration, profile layout and cancellation/worker lifecycle types. Written decision for defaults and optional features. Validate source formatting, tests, Clippy on Windows and Linux; no default requirement for Python, Docker, MCP or development debug socket.

**UC-02: transplant portable Linux functionality into verified Windows host** — optional Cognitum rational bridge, narrow host-reviewed routing, durable HOST_ROUTE_SELECTED provenance, graded worker-protection policy. Independent negative tests for spoofed selected route, stale grant, denied tool, ambiguity, duplicate effects, crash before journal, cancellation and restore. In normal vanilla Lu, the CE is absent or disabled and baseline chat still passes.

**UC-03: consolidate model/provider manager** — keep one Lu-owned model catalog, lifecycle and Protobuf events on both OSes. Bring external GGUF picker and no-SSL engine fix to passing state. Add optional Vulkan engine/backend choice with safe CPU fallback; do not embed CPU-only flags as global architecture. MMProj requires real projector support and matching model/backend tests, not just import acceptance.

**UC-04: integrate IPC only after authority proof** — optional AF_UNIX worker transport with OS private endpoint controls, authenticated peer/proof, protected token delivery, host-owned launch and same native dispatcher/journal. Windows atomic job assignment and Linux real delegated cgroup are **distinct** strict containment gates. Trusted-supervised first-party workers still work without cgroup.

**UC-05: same-source installed desktop tests on both OSes** — from one exact Git SHA build Windows NSIS and Debian .deb separately. Verify install -> native GGUF selected from arbitrary existing folder -> real model response -> authorized native Protobuf tool -> user/assistant persisted -> visible cold restart -> cancellation/revocation/worker teardown -> uninstall/upgrade. Record engine hashes, installer hashes and dependency closure. Repeat isolated tests under Windows 10/11 and supported Linux desktop; no CI-only GPU claim.

**UC-06: release decision and regression** — compare Cognitum OFF versus ON honestly, split hostRoutedCalls versus model toolCalls, preserve 0.5B and 27B evidence separate, run positive/negative platform worker suites, confirm single Lu app ID and no inherited Jan runtime. Promote only after a witnessed cross-platform acceptance matrix and explicit user approval. The Windows alpha's narrow tests need not wait for a stronger untrusted DLC kernel sandbox.

## Explicit current failures and nonclaims

- User's real Windows 10 UI showed invalid legacy metadata import and missing libssl-3-x64.dll at model launch; old Windows CI PASS is **not** physical machine pass.
- On Windows repair branch, source-level inference supervisor and five synthetic PE-import tests passed. Full desktop type-check CI currently failed because it invoked the **unmodified Jan default Tauri Windows config**, which requires an absent bun-x86_64-pc-windows-msvc.exe; correct next run must prepare the disposable native-only Lu platform overlay before using Cargo. This does **not** independently establish whether the new picker code type-checks.
- Windows native inference package currently includes hardcoded --n-gpu-layers 0; Vulkan and MMProj are future shared-backend capabilities.
- Linux D04F real GGUF/host-selected fractions are locally demonstrated; source reconstruction on a clean unified checkout is **not** yet demonstrated.
- Common IPC tests exercise an isolated crate. A production Lu-host launch, Windows ACL/atomic assignment, or cgroup-positive cleanup have **not** been verified.
- No unification code merge, fresh unified installer, or cross-platform release acceptance was performed by writing this document.

## Coordination with Cognitum Dev Convo 9

Cognitum development should complete and export **source-complete, content-hashed D04F patches** and fixture manifests from the locally working Linux reconstructed tree. This enables accurate file-level replay into the shared Windows-based Lu core without preserving a second Linux application fork. Lu Windows work retains source/installed desktop authority, GGUF model manager, UI/packaging and platform Job Object ownership; the Cognitum test workspace never gains authority to widen the main Lu production policy or tool grants.

Only one integration owner should apply runtime patches to the eventual shared source branch at a time. Until then, both developers may retain isolated experimental branches and exchange manifests/patches. This handoff is the source-ownership and acceptance contract, not a competing attempt to independently implement the same convergence.

## Related evidence

- [Linux additions and source-gap inventory](https://github.com/vjmichael/jan_alt/blob/lu/linux-p46-p25-next-gates-20261031/docs/lu-linux/lu-linux-development-additions-and-convergence-inventory-2026-10-31.md)
- [Linux D04F real desktop follow-up](https://github.com/vjmichael/jan_alt/blob/lu/linux-p46-p25-next-gates-20261031/docs/lu-linux/cognitum-d04f-desktop-p46r8-p25-followup-2026-10-31.md)
- [Cross-platform IPC transport/worker evidence](https://github.com/vjmichael/jan_alt/blob/lu/ipc-common-af-unix-20261031/docs/lu/ipc/ipc-lcx-acceptance-ledger-2026-10-31.md)
- [Windows physical GGUF/OpenSSL repair report](https://github.com/vjmichael/jan_alt/blob/work/lu-win-physical-gguf-registration-20261031/docs/lu/windows-physical-gguf-import-and-openssl-2026-10-31.md)
- [Windows alpha acceptance contract](https://github.com/vjmichael/jan_alt/blob/lu/windows-alpha-six-gates-20261031/docs/lu/alpha-acceptance.md)

**Bottom line:** converge one Lu **source**, not two separately written desktops. Do not merge missing Linux runtime from documents, do not erase the currently verified Windows host, and do not use a transport/security experiment to create another authority stack.
