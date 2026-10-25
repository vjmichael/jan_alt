# Lu Core: Module Contracts and Native Tool Registry (Phase 0)

This is the **first, intentionally isolated** implementation milestone for Lu:
a general-purpose, modular personal AI desktop operating environment derived
from Jan. It does **not** modify Cowork, Tauri IPC, or existing built-in tools.

## Scope

- Pure Rust library, no Tauri or MCP dependency.
- Versioned module manifests with `Core` versus `Workspace` ownership.
- Native tool registration, discovery, and conflict-safe module loading.
- Async dispatch through a `NativeTool` trait, with an explicit
  `ToolAuthorizer` check on each invocation.
- Declared effects (workspace reads/writes, code execution, web, devices,
  elevation), with no automatic privilege assigned to any declaration.
- Protobuf type URLs and opaque payload bytes for *future* generated-message
  adapters. **This does not yet serialize, decode, or validate Protobuf.**
- Unloadable workspace registrations; protected core module registrations.
  Unloading blocks future calls but does not cancel calls already in flight.
- Placeholder metadata for UI panel and workflow contributions.
- Unit/integration tests for registration atomicity, duplicates, namespaces,
  type mismatch, authorization, and unload behavior.

## Non-goals / security boundaries

- **NOT integrated into Jan/Cowork yet.** No end-user tools change behavior.
- No dynamic library loading, archive/manifest installation, signing,
  dependency resolution, hot reload, Protobuf code generation, agent routing,
  background workers, durable effect journal, model-boundary adapter,
  workspace instantiation, or module-to-module capability resolution.
- Protobuf `ProtoPayload` bytes are untrusted and are not decoded or validated.
  The concrete tool or generated-schema adapter must validate them.
- `ModuleManifest` declares features; it never grants access.
- The runtime `ToolAuthorizer` must be backed by an authoritative policy
  engine and must verify all user/workspace permission scopes and effects.
- Registration is a **trusted-host operation** for now. Untrusted packages
  must not be allowed to label themselves `Core` or forge ownership; package
  identity and signing/verification are deferred to the workspace loader.
- Registration and removal are atomic under an in-memory lock. This registry
  is **not durable** and does not journal side effects.
- `workspace_id` currently requires only nonempty scope for workspace
  modules. The future host must bind instances to installed packages and
  verify that binding in authorization.
- Never bridge to arbitrary shell commands as a substitute for a native
  capability without assessing effect-specific permissions.

## Repo-local validation

From the repository root, on a machine with Rust installed:

```sh
cargo test --manifest-path src-tauri/lu-core/Cargo.toml
cargo clippy --manifest-path src-tauri/lu-core/Cargo.toml --all-targets -- -D warnings
```

The code was authored via GitHub's file API in an environment that lacks
`cargo` and `rustc`. **It has not been compiled or executed here.**

## Integration plan, after review

1. Audit current Cowork/Jan native dispatch behavior and capture regression
   tests for desktop chat, Cowork, and headless CLI.
2. Introduce an explicit `lu-core` dependency on the Rust host layer behind
   a feature flag, with **no behavior change**.
3. Register an existing low-risk native tool through a compatibility adapter;
   compare its behavior, error paths, and permissions with legacy dispatch.
4. Add generated Protobuf request/result types and strict validation at the
   model/API and IPC adapters (retain JSON at external model boundaries).
5. Move first-party Lu tools into the registry by capability domain, retaining
   tested Jan safeguards. Make general chat and Cowork use the same capability
   catalog, with separate context-sensitive authorizations.
6. Add installed workspace lifecycle, signature/trust rules, UI panels,
   task cancellation, durable effect journaling, and recovery.
7. Keep MCP a separate optional integration adapter, not a prerequisite to
   packaged Lu-native tools.

## Ethics and governance

A capable general-purpose AI environment must distinguish *behavioral
guidance* from *enforceable authority*. Policies should be transparently
versioned, inspectable, attributable to a trusted owner, auditable, and
revisable through deliberate human authorization rather than silently
interchanged by a model or an untrusted workspace. That design discussion
remains open; the registry enforces only the narrow authorization requirement
defined above.

## Intended future model

Lu Core offers general capabilities, while separately installable workspace
packages (NVP, research, code, IoT) extend tools, panels, and workflows without
rewriting the host. No workspace has access to higher privileges merely by
being installed.
