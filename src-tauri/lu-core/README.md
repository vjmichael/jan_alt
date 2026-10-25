# Lu Core — modular foundation (experimental)

Lu is a **general-purpose AI operating environment** built from the Jan fork.
Domain-specific workspaces (NVP, Code, Research, Writing, IoT) extend Lu Core
without becoming core dependencies. This directory is an isolated integration
foundation, **not yet wired into the shipping Jan desktop or Cowork**.

## Implemented on this branch

- `contracts.rs`: versioned core/workspace manifests, tool descriptors, effect
  declarations, native async tool interface and caller-supplied authorizer.
- `registry.rs`: conflict-safe, atomic in-memory native registration, lookup,
  dispatch with authorization/type checks, and protected core registrations.
- `proto/lu/v1/core.proto` and `wire.rs`: generated Protobuf v1 call/reply
  envelopes, size/version checks, typed message names and explicit outcomes.
  `proto3 optional` distinguishes absent workspace/diff from empty values.
- `workspace.rs`: trusted-host registration, active/suspended instance states,
  instance-to-module authorization and guarded uninstall.
- `journal.rs`: SQLite WAL/FULL-sync durable effect intent and receipts,
  PREPARED → EXECUTING → APPLIED/FAILED/UNCERTAIN state transitions and
  restart reconciliation. Replayed effects are **not** automatically rerun.
- `durable.rs`: opt-in native dispatcher using journaled call IDs and stored
  Protobuf receipts; ambiguous execution failures become UNCERTAIN.
- `tasks.rs`: SQLite-backed task state, durable incremental checkpoints,
  heartbeats, progress and interrupted-state recovery. A heartbeat does
  **not** impose an arbitrary timeout.
- `tests/*`: registration, permissions, workspace lifecycle, Protobuf, effect
  journal, duplicate-effect blocking and task checkpoint test coverage.
- `../plugins/tauri-plugin-agent-tools/src/lu_bridge.rs`: **feature-gated**
  native compatibility adapter wrapping Jan's built-in tools, without MCP.
  Reuses Jan's permission gate and denies operations needing an unanswered
  permission prompt. Legacy JSON tool args are contained in a transitional
  Protobuf message; new tools should define their own typed Protobuf requests.
- `.github/workflows/lu-core-ci.yml`: tests, Clippy and headless legacy bridge
  compilation/integration tests (sandbox-dependent pre-existing Jan shell
  tests are not treated as bridge tests).

## Intentional boundaries and non-goals

This is **not yet a release-ready agent runtime**.

- Not integrated into Cowork, ordinary chat, or Tauri desktop IPC. Mainline Jan
  behavior and tool availability remain unchanged.
- The adapter demonstrates reusing Jan native tools, but is not a new tool
  installer, dynamic worker loader, or external MCP server. It is dormant
  without the opt-in `lu-bridge` feature.
- Protobuf envelopes are generated and decoded; per-tool request bytes must be
  decoded/validated using the schema for that tool, including payload limits.
  A legacy JSON string inside Protobuf is a transitional compatibility path.
- The model-facing JSON-schema adapter, model tool-call validation/repair,
  tool catalog selection, and actual Tauri IPC integration remain future work.
- Workspace packages are supplied by a trusted host. No artifact signing,
  dependency solver, untrusted package execution, package installation, or
  live hot-reload is implemented. The workspace host checks instance-to-module
  bindings; a direct registry user must install an equally strict policy.
- Effect journal and task checkpoint storage are implemented, but the
  production orchestrator/worker scheduler does not use them yet. A single
  durable owner and a startup recovery protocol must be enforced at integration.
  There is no automatic recovery of external/physical side effects.
- Atomic registry unload blocks **new** calls; already-running calls need a
  separate worker cancellation/termination protocol.
- No complete generalized native toolbox, NVP workspace, sandbox policy
  replacement, or cybersecurity guarantees are claimed by this milestone.

## Validation

From the repository root with Rust installed:

```sh
cargo fmt --manifest-path src-tauri/lu-core/Cargo.toml -- --check
cargo test --manifest-path src-tauri/lu-core/Cargo.toml --all-targets
cargo clippy --manifest-path src-tauri/lu-core/Cargo.toml --all-targets -- -D warnings

# Headless compile and bridge-specific tests; uses no MCP server:
cargo check --manifest-path src-tauri/plugins/tauri-plugin-agent-tools/Cargo.toml --no-default-features --features lu-bridge
cargo test --manifest-path src-tauri/plugins/tauri-plugin-agent-tools/Cargo.toml --no-default-features --features lu-bridge lu_bridge::tests::
```

The GitHub Actions run for this branch is the authoritative compilation record.
Earlier runs proved the initial registry/Protobuf/journal/workspace tests passed
but revealed a Rust ownership error (fixed) and a Clippy style issue (fixed).
New commits require fresh validation before merging. Running the ENTIRE legacy
Jan test suite on GitHub-hosted Linux also revealed expected shell-sandbox
environment failures; those tests must be rerun where sandbox enforcement is
available. This chat itself has no local `cargo` toolchain.

## Next integration stages

1. Get all Lu Core and bridge-specific CI checks green, pin dependency versions,
   and verify on Windows (the primary user target).
2. Add a capability-filtered model-facing JSON tool catalog and strict JSON →
   typed Protobuf boundary adapters. Keep MCP only as an optional external
   adapter. Avoid advertising huge tool sets to small local models.
3. Add feature-flagged Lu dispatch in the host, with clear policy prompts and
   owner-bound workspace instances; compare Jan legacy dispatch behavior using
   regression tests before changing the Cowork path.
4. Integrate the user's original, advanced native toolkit. Audit each tool's
   permissions, structured error handling, recoverability and Windows behavior.
   Reuse Jan safeguards selectively instead of cloning its limited tool set.
5. Integrate durable task/effect checkpoints with real workers, cancellation,
   deterministic restart, and independent result/artifact storage.
6. Implement signed or otherwise explicitly trusted workspace installation,
   UI panels, module update/removal lifecycle and per-module scopes. Then build
   specialized NVP/Code/Research/Writing/IoT packages.
7. Migrate ordinary chat and Cowork to one coherent capability catalog while
   keeping context-specific policies and gradual rollback/fallback.
8. Run end-to-end tests on local/cloud models, tool-invocation failure cases,
   malicious/accidental input, memory persistence and crash recovery.

## Machine ethics and software governance

The registry's authority boundary is **not** a moral theory. A useful machine
ethics framework should coexist with independently enforceable controls:
versioned rule ownership, authorization for policy changes, provenance,
auditability, least privilege, reversible decisions and explicit emergency
stops for physical devices. An AI should not grant itself new privileges simply
because a model or third-party module rewrites a policy statement.
