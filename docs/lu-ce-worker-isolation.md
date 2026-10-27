# Lu Core Extensions: executable isolation gate

**Status:** design and acceptance contract, not an implemented sandbox. Applies to optional, Lu-native DLC Core Extensions (CEs), not MCP servers. Full DLC Workspaces remain separate application environments.

## Non-negotiable boundary

Untrusted CE code **must never be loaded into Lu's privileged desktop process**. A package manifest, SHA-256 match, UI approval, registry entry, or a Rust async task is not proof of isolation. Until a platform backend enforces the controls below, the CE manager must keep external archives **quarantined** and reject executable capabilities.

The current trusted-bundled CE path accepts only read-only declared effects. This restriction applies to already compiled, host-reviewed implementations; it does not make arbitrary native code safe. Model-visible tool declarations are discovery, never authorization.

## Execution architecture

1. **Intake:** accept bounded archive bytes as inert data; reject path traversal, junctions/symlinks, duplicate archive entries, unsupported file types, decompression bombs, and executable files in mutable locations. Store in a private content-addressed quarantine with atomic receipts. The current in-memory intake is not a durable installer.
2. **Authenticity:** verify a publisher signature over canonical manifest metadata and exact artifact digest against an explicit trusted-key store; support key revocation, pinning, expiry and upgrade policy. SHA-256 alone does not authenticate the publisher. No auto-trust from a user-controlled publisher string.
3. **Host approval:** the host binds package identity, version, exact tool/effect set, target profile/project, resource grants, and approval expiry to an authenticated user action. Model text, tool output, documents, and webview-supplied role claims cannot create approvals. Persist approval/revocation in an auditable journal before activation.
4. **Worker isolation:** launch a separately supervised, non-admin worker with a **verified OS-enforced** sandbox. Never load the package as a DLL or dynamic library in Lu's desktop process. The worker receives no ambient home-directory access, inherited privileged handles, secrets, unrestricted network, device access, or ability to elevate. Restrict child processes and process-tree lifetime.
5. **Typed broker:** all file, network, GPU, and device access passes through host-controlled, narrowly scoped brokers. Broker calls require the immutable host-attested session/task origin and exact resource/action authorization. Generated Protobuf decoding, size limits, deadlines, and replay protection apply on both sides of IPC. A model may request, not mint, authority.
6. **Lifecycle:** staged → verified → explicitly approved → enabled → running → draining → stopped. An upgrade requires a new digest/signature and approval comparison. Revoke/disable closes admission before waiting for active calls. Cancel and kill must cover the entire worker process tree, with deadlines and resource limits. Failed activation must roll back to the prior disabled state without granting tools.
7. **Recovery:** on crash, power loss, or restart, fail closed: do not auto-restart an unverified worker or silently resurrect revoked grants. Persist task status and audit events, reconcile interrupted calls, and require revalidation of exact package identity.

## Platform enforcement requirements

- **Windows:** run under a non-admin restricted token or properly configured AppContainer/low-privilege identity, with explicit filesystem and network restrictions. Use a Job Object with kill-on-close, process-tree limits and no unintended breakaway; tightly control handle inheritance, named-pipe ACLs, environment, executable paths, DLL search paths and child creation. **A Job Object alone does not sandbox filesystem, registry or network access.** Test ACL and AppContainer restrictions with real hostile workers.
- **Linux:** enforce a non-root identity plus mount/user/network namespaces, no-new-privileges, seccomp syscall policy, filesystem restrictions (e.g. Landlock where supported), resource cgroups/rlimits and no ambient credentials. Reject launch if the necessary enforcement cannot be established; no Docker or WSL prerequisite.
- **macOS:** use an independently sandboxed helper with restrictive entitlements, filesystem/network access controls and supervised process lifecycle. Do not assume that merely spawning a helper gives it a sandbox.

Each backend must return a host-owned verified enforcement result from **actual OS setup**, not a caller-provided boolean or a manifest assertion. Unsupported or failed setup means no execution. Do not implement a generic “unsafe fallback” launch mode.

## Current implementation versus required guarantees

| Property | Present today | Required before external execution |
| --- | --- | --- |
| Manifest and dependency validation | Strict bounded metadata, version checks | Signed package provenance and durable installation |
| External intake | Digest check, inert quarantine | Safe extraction and persistent content-addressed staging |
| Registry permissions | Host policy; no model grant by registration | Host-attested conversation/task and argument-level broker policy |
| Unload | Per-CE active-call lease, admission closure, retry-after-drain | Worker cancellation, deadline, force-kill and cleanup |
| Isolation | **No external executable loading** | OS-enforced restricted process and IPC broker |
| Audit | In-memory CE metadata | Durable approval, revocation, process and resource-access journal |

## Security acceptance tests (must run on each supported OS)

- A hostile CE cannot read arbitrary home files, other Lu profiles, secrets, or sibling project data, even with symlinks/junctions/reparse points and TOCTOU attempts.
- A hostile CE cannot write outside approved scratch, open arbitrary network sockets, control devices, inherit privileged handles, or spawn an untracked elevated child.
- Expired/revoked grants and forged model/webview user-turn IDs cannot authorize an action.
- Concurrent dispatch versus disable/upgrade cannot start new calls after admission closes; active workers are drained or terminated and cannot retain capabilities.
- CPU, memory, output, time and process-count limits are enforced by the OS and remain effective after a worker forks/spawns children.
- Tampered, unsigned, wrong-key, rollback/downgrade and dependency-confused packages never execute.
- A worker crash or kill cannot corrupt the active CE registry, install directory, task journal or Lu Core; recovery fails closed.
- Negative tests must demonstrate actual access denial by the OS, not just mocked success flags.

**Release gate:** no externally supplied executable CE may be enabled until the above controls have passing real-platform tests. This document is a design contract, not an assertion that the sandbox is finished.
