# Lu — Unified Toolchain & Dependency Manager (UTDM)

**Status:** Design note; deferred. **Target:** v1.05 design track, with phased IDE Workspace availability after alpha/v1.00. **Platform focus:** Windows x86-64 first. **Authority:** User-approved, conversation/task-scoped Lu native capabilities. **No alpha release dependency.**

## Decision

Expand the planned *Lu Runtime & Dependency Manager* (previously centered on `uv` for Python) into a unified, Lu-native toolchain and dependency orchestration service. This service supplies the **Lu IDE Workspace** with reliable compilers, build tools, language runtimes, native libraries, and SDKs. The user sees capabilities and clear outcomes, not dependency plumbing. IDE Workspace remains a specialized DLC application environment; the underlying manager can be reused by other workspaces/extensions.

This is a wrapper/coordinator over proven managers and distributions, **not** a new general-purpose package resolution algorithm, nor a promise that every tool can be freely redistributed.

## User experience contract

- IDE Workspace offers a verified baseline toolchain at installation; larger and optional SDKs install on demand.
- Users request outcomes: *build*, *test*, *run*, *debug*, *repair project environment*.
- Lu detects required tools, the actual accessible filesystem scope, and existing installations, including extracted portable binaries not on `PATH`.
- Lu uses an already compatible installation when policy permits; otherwise resolves a vetted, pinned tool version from an approved source or verified cache.
- Nontechnical status: **Ready**, **Repairing**, **Permission needed**, **Unavailable**. Offer details only on request. Retain provenance and logs for audit.
- Keep projects isolated: never mutate the user's global Python/site-packages, system toolchain, or existing apps as an incidental repair.
- Repairs are testable and reversible; app updates and `npm ci` must not silently delete managed environments.

## Layers and providers

1. **Lu-native broker and contracts:** requirements, capability discovery, policy, install plan, progress, provenance, failure classification, health check, repair, rollback. Use Lu's Protobuf IPC and native registry, never mandatory MCP transport. Model requests actions; Lu host validates authority and executes.
2. **Provider adapters:** `uv` for Python/runtime and lockfiles; `vcpkg` for C/C++ dependency manifests and binary caches; npm/pnpm as appropriate for JS/TS; an SDK/toolchain installer adapter for official Windows compiler distributions, CMake, Ninja and other approved tooling; optionally evaluate Pixi/Conda-compatible environments for mixed-language projects. Never represent every provider as equivalent.
3. **Trusted artifact catalog:** immutable package coordinates, platform/architecture, version constraints, digests/signatures where supported, distribution source, redistribution license, compatibility matrix, cache provenance. No untrusted executable auto-install simply because the model found a URL.
4. **Toolchain inventory:** detected version, absolute executable location, architecture, compiler/SDK ABI, health result, accessible root, whether visibility is limited, and reason for denial. Distinguish **not installed**, **not on PATH**, **outside authorized search**, **present but incompatible**, **execution denied**, **dependency missing**.
5. **Environment store:** content-addressed downloads and versioned per-project/per-DLC environments outside disposable build outputs; atomic staging and promotion; rollback snapshots; quotas and cleanup only of Lu-owned artifacts.

## IDE Workspace baseline and on-demand tiers

**Small baseline:** environment discovery, project format detection, CMake/Ninja or equivalent build orchestration if legally redistributable, diagnostics, test runner, and approved lightweight utilities. Bundle no tools without checking license, redistribution, architecture and size.

**On demand:** MSVC Build Tools and Windows SDK (subject to Microsoft installer/licensing rules), Clang/LLVM, GCC/MinGW where appropriate, Rust/Cargo, Java, .NET, Python, Node, database client libraries, GPU SDKs, Boost/TinyXML/ZLIB/UTF8-CPP, debuggers and language-specific tooling. Some require administrative privilege, external installer UI, license acceptance or developer account. Request permission instead of bypassing these requirements.

## Discovery and resolution workflow

1. Read project manifests (`CMakeLists.txt`, toolchain files, `vcpkg.json`, `pyproject.toml`, `uv.lock`, Node lockfiles, etc.) and the selected build target.
2. Inspect Lu's manifest cache and inventory. Probe only authorized locations, including opted-in Downloads or portable-executable directories. Explicitly report when visibility is restricted without disclosing protected paths.
3. Solve compatible versions and ABI/platform constraints; prefer verified local artifacts and cached binaries. Present required installations and privileges before any sensitive operations.
4. Fetch from an approved registry/vendor endpoint, verify integrity/signatures where available, stage files in a Lu-owned area, install using provider-specific isolation, then run health/compatibility checks.
5. Pin the resolved environment and capture a reproducible build manifest. If any step fails, preserve previous working version, classify the failure and offer a targeted remedy.
6. Provide machine-readable evidence for the agent and short user-facing progress/result messages.

## Security / authority invariants

- Each action must carry valid conversation ID and user-granted task authority. Revocation cancels downloads/install/repair jobs as far as safe.
- Publisher trust, provenance, hash checks, policy and consent gates apply. Do not make arbitrary web downloads executable by default.
- Discovery does not imply execution authority. Hidden or denied locations must not be enumerated without user consent.
- Elevated installations and modifications to global PATH, system registry, Windows services or shared compilers require separate, explicit approval.
- Shell invocations run through host-managed tool interfaces with sandbox boundaries, resource/time limits, audit records and clear failure codes.
- Prefer least-privilege per-project installs and a restricted build account when available. Never modify a production database as part of dependency resolution.

## Acceptance cases (future)

1. **Portable CMake:** extracted `cmake.exe` exists outside PATH, within user-authorized directory; Lu discovers, versions and uses it without reinstalling.
2. **Windows MSVC:** locates `vcvarsall.bat` and compiler/toolset, initializes correct environment, verifies compile and reports restrictions distinctly.
3. **C++ dependencies:** restores pinned Boost/TinyXML/ZLIB dependencies from approved provider and binary cache; avoids ABI mismatch.
4. **Python isolation:** `npm ci` / desktop update does not remove uv-managed environments; missing packages restore from lockfile.
5. **Failure handling:** invalid signature, permission denial, missing SDK and offline registry each receive distinct actionable messages; previous working toolchain stays usable.
6. **Reproducibility:** build manifest records exact compiler, SDK, library versions, hashes and architecture; second clean Windows machine can reproduce within approved licensing/availability limitations.
7. **Security:** denied-path scan and unapproved elevation cannot be bypassed by the model; user revocation takes effect during operations.
8. **IDE UX:** nontechnical user selects Build/Test; repair and installation require no manual package commands, unless license/consent or exceptional recovery requires their action.

## Milestones and explicit deferral

- **Now: Lu alpha** — do not implement UTDM or allow it to block Windows x86-64 alpha release gate.
- **v1.00** — stabilize desktop model inference, native tools, persistence, installer and permission safeguards.
- **v1.05 planning/development** — foundational manager design, inventory, permissions, uv integration, package and toolchain metadata, tested Windows pilot; coordinate with IDE Workspace roadmap.
- **Later IDE Workspace releases** — richer toolchain catalog, cross-language providers, signed mirrors, prebuilt caches, offline bundles, SDK/license workflows, shared user-friendly project environments.
- **v2.00** — optional expansion, not a 100GB mandatory monolithic update.

## Open decisions

- Which compiler/build utilities can legally be bundled in the IDE download versus requiring vendor installers?
- Which package managers should be first-party adapters versus optional advanced providers?
- How to scope tool detection when Windows paths are restricted by LM Studio-style sandboxing or Lu policy?
- Cache quotas, retention and LAN/offline artifact mirror requirements.
- How to represent ABI compatibility, GPU SDK/driver versions and environment lockfiles as a unified reproducibility contract.

**Design principle:** Users manage capabilities and permissions. Lu manages dependencies, proves readiness and repairs what it owns without obscuring the audit trail.