# Lu / NVP Film Workspace contract smoke (2026-11-02)

This is an **isolated test-only branch** from Lu's generic DLC containment
candidate. It does not change Lu's Windows alpha or install NVP.

The fixture uses Lu's actual WorkspaceHost and ModuleManifest contracts:
- NVP is ModuleKind::Workspace, not CoreExtension.
- Module registration does not grant a call permission.
- Only an active workspace instance with a current host grant can dispatch.
- A wrong or missing workspace instance is rejected.
- Suspension denies use; uninstall is blocked while an instance is active.
- A mismatched Protobuf input type URL fails closed.

The fixture tool is read-only and returns empty bytes. It does not read any
real private movie, run a model, start a worker or render video.

Verification on a complete Lu source tree with Rust installed:
    cd src-tauri/lu-core
    cargo test --test nvp_workspace_boundary

This test has not been compiled or executed in the authoring environment;
no Rust compiler is installed there. A passing test would establish a
generic host registration gate, NOT actual NVP inference, signed Windows
external DLC installation or a production security review.

NVP's separately testable Python side is in vjmichael/nvp_offline_film,
backend/nvp_lu_workspace.py. Lu must implement its host-owned project
broker and shared inference port before the two sides can communicate.
