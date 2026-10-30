#!/usr/bin/env bash
# Developer-only local Linux harness; never starts GitHub Actions or a real Lu
# profile. Run from a disposable Lu checkout with cached Rust dependencies.
set -euo pipefail
repo="$(cd "$(dirname "$0")/.." && pwd)"
mode="--quick"
if [[ $# -gt 0 ]]; then mode="$1"; fi
if [[ "$mode" != "--quick" && "$mode" != "--full" ]]; then
  printf 'Usage: bash scripts/test-lu-linux-offline.sh [--quick|--full]\n' >&2
  exit 2
fi
cd "$repo"
export CARGO_NET_OFFLINE=true
export RUSTUP_AUTO_INSTALL=0
export YARN_ENABLE_NETWORK=0
export CARGO_TARGET_DIR="$repo/src-tauri/lu-core/target/lu-linux-offline"
export TMPDIR="$repo/src-tauri/lu-core/target/lu-linux-offline/temp"
export JAN_E2E_HOME="$repo/src-tauri/lu-core/target/lu-linux-offline/profile"
mkdir -p "$CARGO_TARGET_DIR" "$TMPDIR" "$JAN_E2E_HOME"
printf 'LU_LINUX_OFFLINE_START mode=%s network=disabled actions=unused\n' "$mode"
node --test scripts/tests/stage-lu-linux-engine.test.mjs
node scripts/prepare-lu-linux.mjs --check
if ! command -v cargo >/dev/null 2>&1; then
  printf 'LU_LINUX_RUST_BLOCKED missing=cargo (no automatic install attempted)\n' >&2
  exit 3
fi
manifest="src-tauri/lu-core/Cargo.toml"
cargo fmt --manifest-path "$manifest" -- --check
if [[ "$mode" == "--quick" ]]; then
  cargo test --offline --manifest-path "$manifest" --test model_json_boundary
  cargo test --offline --manifest-path "$manifest" --test native_agent_tool_turn
  cargo test --offline --manifest-path "$manifest" --test supervised_native_turn
  cargo test --offline --manifest-path "$manifest" --lib persistent_llama_backend::tests
else
  cargo test --offline --manifest-path "$manifest" --all-targets
  cargo clippy --offline --manifest-path "$manifest" --all-targets -- -D warnings
fi
printf 'LU_LINUX_OFFLINE_PASS mode=%s network=disabled actions=unused alpha=not_claimed\n' "$mode"
