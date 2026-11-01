# Lu post-alpha universal DLC platform — engineering lessons from independent Cognitum research

**Date:** 2026-11-01  
**Classification:** design record / post-alpha proposal — **NOT implementation or release authorization**  
**Repository:** `vjmichael/jan_alt`. Documentation-only branch based on draft `work/lu-mmproj-native-pairing-20261101`, not a claim of a stable or released build.

## Why this record exists

Cognitum's independent scientific-tool development revealed reusable platform requirements for Lu's eventual extension ecosystem: strict typed inputs/outputs, explicit uncertainty and refusal, provenance, optional isolation, durable interruption, and ability to access common host services without reimplementing them. These lessons should inform Lu **after** a decent Windows alpha, during its progression to v1.0 and subsequent DLC work.

**Hard project boundary:** Cognitum remains an independent project. **No Cognitum-to-Lu integration is planned.** The Cognitum team's Lu-Linux test branch is an optional *development environment* only and must always be rebased/recreated from the **latest verified stable Lu build**; neither the current draft Windows alpha nor an experimental Linux fork is automatically "stable." No core imports, hard-coded Cognitum routes or dependencies. Any future optional integration would require a new, explicit user decision.

## Product order and change controls

1. **Alpha first (do not delay):** single installer, trustworthy GGUF+MMProj import, actual text/image answers, verified Windows AMD Vulkan offload, host-authorized native tools, conversation persistence, honest state UI, deterministic cancellation/recovery. An installed, physical Windows run is authoritative for Vulkan.
2. **Post-alpha stabilization toward v1.0:** first-party host-owned worker supervisor, durable authority and effect journal, stable native capability interfaces, cross-platform negative tests.
3. **Universal DLC system once foundations pass:** independently packaged/installed IDE, Film/NVP, Research, Writing and future workspaces. Validate the interface with the IDE DLC before committing to a broad ecosystem. DLCs extend visible behavior, not core trust.

**This ADR does not add an alpha requirement, create a second Lu app, introduce Cognitum dependency, or promote an existing draft.** GitHub is source/version ledger, not the development hub; local builds/tests and real installed acceptance lead.

## Core architecture: built-in SERVICES, external implementations

Create a trusted first-party **Lu Host Services layer**, accessible only through a versioned, typed capability gateway:

- **Model service:** scoped model session/lease on already-loaded model(s), budget/priority scheduling, cancellation, quotas; no direct access to model process, GGUF paths or unrestricted inference parameters.
- **Memory service:** host-authorized read/write/query over ANSF+SQLite provenance and user-approved scopes; do not hand raw databases or whole chat histories to a DLC.
- **Resource broker:** atomic filesystem operations and permitted git/JSON/Protobuf/artifact services via narrow paths or opaque resource handles. Distinct read/write/network/code effects; no general home-folder privilege.
- **Task lifecycle:** task ID bound to authenticated current USER turn/delegation, progress, checkpoint and durable effect journal; cancellation, expiry, revocation and restart reconciliation.
- **Capability/schema registry:** signed code/package identity, semantic version, exact schema digest, effect class, tool catalog registration; *discovery is not permission*.
- **Typed results:** distinguish `completed` (worker executed) from `accepted`, `refused`, `partial`, `unverified`, `assumption_bound` and uncertainty/limitations. Scientific inference is one example, not a privileged special case. The host must never equate numerical output with factual or causal certification.
- **Worker supervisor:** pinned executable or native first-party implementation, OS sandbox, resource quotas, process-tree containment, orphan cleanup and fail-closed cancellation.

Each DLC owns its algorithms, specialist tools, workflows and optional interface. **Do not load arbitrary third-party DLLs/shared libraries into the trusted Lu process**, hand plugins ambient user-token powers, or allow plugins to call direct privileged Tauri commands. First-party built-ins remain reviewed components of Lu; third-party optional code belongs in restricted workers.

## AF_UNIX as a transport candidate, NOT an authority boundary

**Candidate:** local `AF_UNIX` `SOCK_STREAM` may carry framed, versioned Protobuf for Lu<->worker requests and events on Linux and supported Windows, reducing platform-specific parsing and giving one protocol. **The protocol must not depend on Unix-only credential/FD-passing mechanisms.** The same typed protocol can use a different transport (e.g. a tightly ACL-restricted Windows named pipe or inherited anonymous pipe) if Windows AppContainer/LPAC isolation is incompatible with AF_UNIX in the target configuration.

Linux: filesystem-owned socket paths under a private host directory; verify path ownership and prevent symlink substitution/TOCTOU; kernel peer credentials via `SO_PEERCRED` where appropriate; sandbox cgroups/namespaces/Bubblewrap as selected. An abstract socket is **not protected by pathname permissions**.

Windows: test actual Win32 AF_UNIX capability for each supported OS and restricted worker identity. Windows AF_UNIX `SOCK_STREAM` exists but **Linux `SCM_CREDENTIALS`, `SCM_RIGHTS`, `SO_PEERCRED` semantics must not be assumed**. Authenticate package+worker identity via trusted spawn/handle attestation and a scoped, short-lived session handshake; verify endpoint ACL/access and sandbox reachability. If insecure/unavailable, fail closed or choose verified local IPC. Windows needs independent AppContainer/LPAC/Job Object testing. **Do not relax sandbox permissions to make sockets convenient**.

Regardless of transport: strict frame cap, canonical Protobuf/type URLs, request IDs, session epochs, anti-replay, timeout, bounded buffering/backpressure, streaming cancellation and final receipts; no model-supplied filesystem paths or authority tokens. The gateway must bind connection to host-created process identity and task scope; connection success alone authorizes nothing.

## Threat model and non-negotiable controls

**Adversary:** malicious or compromised DLC worker, forged manifests, hostile content from files/web/model outputs, stale connections, race during update, replayed requests, resource exhaustion, worker descendant escape and late results after cancellation.

Control chain (every hop required):
1. Verify publisher/trust policy + content-addressed package signature, explicit install/enable per profile. Package identity `!=` permission.
2. Spawn under restricted OS principal and token; deny file/network/device/elevation by default. Keep processes out of Lu's unrestricted user identity. No plain unsandboxed execution fallback.
3. Host validates current authenticated human turn or durable delegation, conversation, task, effect, exact arguments/resources/destination, schema and grant at *execution time*. Untrusted model suggestions are inert until approved.
4. Use host-only resource handles, narrow broker operations, per-task quotas, timeouts and rate limits.
5. Revocation/cancel must stop new work, terminate worker **and descendants**, invalidate session tokens and prevent uncertain effects from replay. Preserve durable receipts; never claim rollback of an effect that might have occurred.
6. Zero implicit cross-DLC data access. Every service crossing has a fresh scoped grant and audit metadata without leaking private content or executable paths.
7. Independent negative tests for forged current-user turns, schema mismatches, privilege requests, network egress, filesystem escape, stale session replay, cancellation/revocation during work, restart, package substitution, and diagnostics without content exfiltration.

## Compatibility with Lu's CURRENT implementation (2026-11-01)

- Lu Core already has first-party conversation authority, Protobuf IPC, native tool registry, durable journal, `CoreExtensionHost`, package/grant/staging/broker prototypes and a generic reviewed route selector. **Built-in DLC route list is deliberately empty.**
- The signed-worker Linux prototype uses a sealed executable and Bubblewrap. The Windows external signed-worker runtime intentionally returns `NoSandbox`; an AppContainer diagnostic test **is not** arbitrary signed-worker admission.
- The current native Windows inference turn constructs a **read-only** registry and passes `None` as host-reviewed DLC candidate. Hence a registered manifest or working Linux test does not imply the Windows alpha executes external DLCs.
- Current Lu Windows alpha PR #106 is an unmerged source candidate, not a verified installed multimodal Vulkan release; separate compiler/NSIS smoke fixtures are not Lu Alpha acceptance.
- Therefore **do not implement or enable the universal external DLC gateway during the current alpha rescue** and do not cite the Cognitum standalone 980-case E2E as Windows Lu integration.

## Post-alpha acceptance matrix

| Gate | Required positive proof | Required negative proof |
|---|---|---|
| Native transport | Same canonical Protobuf transcript on Linux and Windows; framed streaming with bounded deadlines | malformed/oversize/duplicate/replayed frames and peer impersonation fail closed |
| OS isolation | Host-spawned signed external worker runs under verified Linux and Windows restricted identities | direct home/secret/loopback/device access denied; worker descendants killed on revoke |
| Host authority | Exact current user turn and explicit resource/effect grants permit reviewed operations | model-only, stale chat, revoked or forged grants cannot execute |
| Host services | Model lease, memory/artifact broker and task API work with an inert generic fixture | cross-DLC reads/writes and ambient DB/model process access denied |
| Lifecycle | crash, cancel, restart, disabled/uninstalled DLC recover cleanly and reproducibly | no orphan processes, uncertain effect replay or silent fallthrough |
| Product packaging | One reviewed source SHA yields installed Windows NSIS and Linux packages; IDE DLC verifies real task | DLL/package replacement and missing sandbox abort installation/execution |
| Extensibility | A generic sample or IDE DLC adds capability/UI without editing Lu Core routing | no add-on-specific core IDs, implicit permission or Jan/Cowork fallback |

## Concrete later design work

- Compare AF_UNIX/Windows named-pipe/inherited-pipe reachability under real restricted worker identities; decide one wire protocol with multiple transport adapters.
- Specify first-party `HostServiceRequest`, `HostServiceResponse`, `Progress`, `Cancel`, `Refusal`, `EffectReceipt` Protobuf versioning and exact limits. No new special-case Cognitum message.
- Specify read-only initial broker surface and model-session sharing scheduler before any mutating or code-execution DLC service.
- Add signed package trust/update/revocation and recovery integration, then test hostile generic workers on Windows and Linux.
- Validate host services with IDE DLC workloads and full installed acceptance; only then generalize to Film/Research/Writing DLCs.

## Source references and provenance

Lu internal design context:
- `docs/lu/dlc-generic-interface-containment-gate-2026-10-31.md` (generic fixture and OS limitations).
- `docs/lu/ALPHA_NATIVE_REPLACEMENT_DECISION_20261101.md` (alpha gate and Jan retirement).
- `src-tauri/lu-core/src/capability_router.rs`, `core_extension.rs`, `ce_schema.rs`; `src-tauri/plugins/tauri-plugin-agent-tools/src/tools/ce_signed_runtime.rs`.
- Cognitum research-only findings include typed refusals, immutable receipts, 980 independent JSON-host cases and eight native test-harness cases; those **do not authorize a Cognitum-to-Lu integration**.

External platform facts:
- Microsoft Win32 IPC: https://learn.microsoft.com/en-us/windows/win32/ipc/interprocess-communications
- Microsoft AF_UNIX implementation/limitations: https://devblogs.microsoft.com/commandline/af_unix-comes-to-windows/
- Microsoft Windows AppContainer launcher and isolation: https://learn.microsoft.com/en-us/windows/win32/secauthz/implementing-an-appcontainer
- Linux unix(7) peer credentials, pathname vs abstract sockets: https://man7.org/linux/man-pages/man7/unix.7.html

**Promotion:** This is a *deferred design note*. The user will revisit DLC platform architecture after a decent Lu alpha and on the path to v1.0. No architecture implementation, release or Cognitum product integration is approved by this note.
