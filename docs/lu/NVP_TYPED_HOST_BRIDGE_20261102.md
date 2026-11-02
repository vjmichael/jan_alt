# Lu ↔ NVP Film Workspace: typed host bridge

**Date:** 2026-11-02 (development integration branch)
**Status:** Rust source implemented; native compilation/desktop integration NOT verified.
**Branch:** lu/nvp-workspace-contract-smoke-20261102, draft PR #107.
**Base:** work/lu-generic-dlc-containment-20261101.
**Not part of Lu Windows alpha; not a released signed DLC installer.**

## Concrete implementation (Lu-owned)

- src-tauri/lu-core/proto/lu/v1/core.proto now defines:
  - NvpProjectReadRequest / NvpProjectSnapshot
  - NvpGenerateProposalRequest
  - NvpSaveProposalRequest / NvpProposalReceipt
  - NvpStreamFrame / NvpStreamText / NvpStreamStopped
- src-tauri/lu-core/src/workspace.rs adds a GENERIC, policy-checked,
  registered-Workspace admission path for streaming work. It verifies a
  registered descriptor and exact input Protobuf type, active package
  instance and the same Lu authorizer used for normal native tool dispatch.
  Admission is rechecked during streams and before writes.
- src-tauri/lu-core/src/nvp_film_bridge.rs adds an in-process Lu bridge:
  - trusted Rust NvpHostScope, non-serializable and not generated from a UI
    project ID, linked to HostSessionRegistry and OwnershipStore;
  - typed canonical request decoding (rejects unknown fields/duplicates);
  - host-owned app-data SQLite movie/project snapshot storage;
  - NVP writing stage generation via the already-loaded Lu model;
  - streamed typed text frames (per-frame current-scope authorization);
  - task-scoped cancellation and RAII cleanup;
  - revision-checked proposal-only storage, with Lu EffectJournal preparing
    before side effects, marking APPLIED only after SQLite commit;
  - duplicate/uncertain effects refused without blind replay.
- ExistingLuSupervisor adapter borrows the actual trusted
  TrustedInferenceSupervisor that owns Lu's current GGUF. It uses the same
  model/session, queues out with BUSY when already occupied, emits its typed
  inference text frames and cancels through the supervisor's distinct
  cancellation mutex. It NEVER calls model load/unload or starts a server.
- src-tauri/src/core/lu_inference.rs supplies a TRUSTED RUST-ONLY accessor for
  the shared supervisor adapter, not exposed directly to the WebView.

## Ownership and tool IDs

Module: nvp.film, ModuleKind::Workspace.
Required registered descriptors from nvp_host_descriptors():
- nvp.film.project.read: ReadWorkspace, NvpProjectReadRequest -> NvpProjectSnapshot
- nvp.film.story.generate: ExecuteCode, NvpGenerateProposalRequest -> NvpStreamFrame
- nvp.film.story.propose: WriteWorkspace, NvpSaveProposalRequest -> NvpProposalReceipt

Those effect classes do not themselves grant authority. A trusted host must
register the module after signed/DLC vetting and issue current
per-workspace/per-effect policy grants. A model or UI cannot issue grants.
The bridge cannot run until the host has registered those exact descriptors
and bound an active Workspace instance, enrolled owner/profile/conversation,
and separately authorized the exact effect. NVP cannot choose the host path,
raw model filename, network URL, or privileged worker executable.

## Host call sequence

1. Lu's trusted window lifecycle binds principal and enrolled conversation.
2. Lu opens NVP Workspace instance and issues approved policy grants.
3. Lu calls NvpFilmBridge.trusted_open_scope with verified window/context,
   NOT WebView-supplied identity fields.
4. NVP reads an authorized film using a canonical empty
   NvpProjectReadRequest. Response has project ID/title/idea/script/revision.
5. User requests NvpGenerateProposalRequest(stage,instructions,revision,
   max_new_tokens). Lu checks ownership and active instance.
6. NvpFilmBridge uses ExistingLuSupervisor and streams NvpStreamFrame text.
   Cancellation is accepted only for same Rust host scope + host call ID.
7. On successful generation, the host reauthorizes, validates filmable
   screenplay heading if applicable, and stores only a status=proposed
   draft at the still-current revision. The EffectJournal records the result.
8. A NvpProposalReceipt terminal event is sent only after durable APPLIED.
   If cancelled/refused/failed, stream contains a host-controlled stopped
   code. A late cancellation cannot claim to roll back a committed proposal.

## Tests and verification

- tests/nvp_film_bridge.rs contains 11 Rust tests: project read and exact
  canonical request rejection, streamed proposal/journal, denied writes,
  real concurrent script edit, manual proposal idempotency, cancellation,
  workspace suspension, window revocation, unloaded model, invalid output,
  policy revocation, and borrowing an already-loaded fake Lu supervisor.
- tests/nvp_workspace_boundary.rs contains 2 Rust tests for registration,
  instance ownership and Protobuf type refusal.
- All 13 tests are COMMITTED but have NOT been executed against Rust.
  The authoring host has no rustc/cargo toolchain; do not mark them PASS.
- NVP's independent Python foundation: 32 tests passed locally in
  /mnt/data/nvp_next, including 10 fake Lu host-port regressions.
  Those do NOT substitute for native Rust tests.

Run when a complete Lu local development toolchain is available:

    cd src-tauri/lu-core
    cargo fmt -- --check
    cargo test --test nvp_workspace_boundary
    cargo test --test nvp_film_bridge
    cargo test --lib
    cargo clippy --all-targets -- -D warnings

Then validate with the already-loaded actual GGUF through Lu's desktop
supervisor on Windows and Linux. Record SHA, OS, driver and model/backend
evidence separately, without claiming fake-backend tests prove Qwen/AMD.

## Critical remaining integration and security gates

1. The main Tauri desktop has NOT yet installed/registered the external NVP
   Workspace or bound a real host-attested Film UI session. The internal
   supervisor accessor is intentionally NOT a public WebView IPC command.
   A signed DLC loader and publisher trust path, especially on Windows,
   remain prerequisites to production exposure.
2. An actual desktop event projection/command adapter must retrieve window
   identity from trusted Tauri context, reconcile the Lu user profile,
   enroll authorized film-project ownership, and obtain explicit durable
   effect grants; never allow the WebView to submit principal, window label,
   workspace instance, project path or signed-worker identities.
3. No filesystem broker for Blender/renderer exists in this slice. No 3D
   animation/rendering or Lu/NVP film UI integration is accepted.
4. The current model supervisor remains one interactive slot. Model resource
   policy and foreground priority arbitration should be verified before
   heavy NVP+render concurrent GPU use.
5. Rust journal and SQLite are separate connections to one file, so a crash
   after the draft commit and before journal APPLIED is an UNCERTAIN effect.
   Do not replay. Use immutable proposal_id and independent reconciliation.
6. Scope revocation rechecks on each emitted chunk and immediately before
   write; hard cancellation of a noncooperative underlying backend still
   requires Lu's worker supervisor containment. A main-window/profile
   switch or package uninstall must cancel first and drain tasks.
7. The film-specific schema is development-v1. Incompatible changes require
   a versioned migration; no unreviewed NVP-only privileges go in Lu Core.

## Product ownership and isolation

NVP remains a separate optional Film Workspace DLC. The generic Lu host
owns execution/permissions, while NVP owns film production data, story
prompts and editing UX. The development host bridge module currently uses
NVP-specific messages to prove the contract, but it must be refactored into
a host-owned, vetted package/service registration for the final DLC loader.
Do not merge this experimental bridge into the shipping core without review.

GitHub records source/decisions only; perform actual compilation, model
benchmarking and GPU desktop acceptance locally.
