#!/usr/bin/env bash
# Developer-only offline build. --desktop changes Cargo.toml: use a disposable checkout.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mode="--preflight"
if [[ $# -gt 0 ]]; then mode="$1"; fi
if [[ "$mode" != '--preflight' && "$mode" != '--core' && "$mode" != '--desktop' ]]; then
  printf 'Usage: bash scripts/build-lu-linux-local.sh [--preflight|--core|--desktop <llama-source> <llama-build-bin>]\n' >&2
  exit 2
fi
# Reject malformed invocations before creating files or compiling Rust.
if [[ ( "$mode" == '--desktop' && $# -ne 3 ) ||
      ( "$mode" != '--desktop' && $# -gt 1 ) ]]; then
  printf 'LU_LINUX_BUILD_BLOCKED invalid_argument_count\n' >&2
  exit 2
fi
cd "$root"
# The read-only prerequisite probe must not receive write-target variables.
node scripts/check-lu-linux-env.mjs
if [[ "$mode" == '--preflight' ]]; then
  printf 'LU_LINUX_PREFLIGHT_COMPLETE build=not_attempted actions=0\n'
  exit 0
fi
export CARGO_NET_OFFLINE=true RUSTUP_AUTO_INSTALL=0 YARN_ENABLE_NETWORK=0
export CARGO_TARGET_DIR="$root/src-tauri/target/lu-linux-local"
export TMPDIR="$root/src-tauri/target/lu-linux-local/temp"
export JAN_E2E_HOME="$root/src-tauri/target/lu-linux-local/profile"
mkdir -p "$CARGO_TARGET_DIR" "$TMPDIR" "$JAN_E2E_HOME"
if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  printf 'LU_LINUX_BUILD_BLOCKED requires_linux_x86_64\n' >&2
  exit 3
fi
if ! command -v cargo >/dev/null || ! command -v rustc >/dev/null; then
  printf 'LU_LINUX_BUILD_BLOCKED requires_rustc_cargo_1.98.0\n' >&2
  exit 3
fi
if [[ "$(rustc --version)" != 'rustc 1.98.0 '* ]]; then
  printf 'LU_LINUX_BUILD_BLOCKED wrong_rust_toolchain\n' >&2
  exit 3
fi
node --test scripts/tests/*.test.mjs
node scripts/prepare-lu-core-lock.mjs --check
if [[ ! -f src-tauri/lu-core/Cargo.lock ]]; then
  node scripts/prepare-lu-core-lock.mjs --write
fi
cargo fmt --manifest-path src-tauri/lu-core/Cargo.toml -- --check
cargo test --offline --locked --manifest-path src-tauri/lu-core/Cargo.toml --all-targets
cargo clippy --offline --locked --manifest-path src-tauri/lu-core/Cargo.toml --all-targets -- -D warnings
printf 'LU_LINUX_CORE_PASS toolchain=1.98.0 offline=true actions=0 alpha=not_claimed\n'
if [[ "$mode" == '--core' ]]; then exit 0; fi
if ! command -v yarn >/dev/null; then
  printf 'LU_LINUX_DESKTOP_BLOCKED missing_yarn\n' >&2
  exit 3
fi
for pkg in webkit2gtk-4.1 javascriptcoregtk-4.1 gtk+-3.0 libsoup-3.0 openssl ayatana-appindicator3-0.1 librsvg-2.0; do
  if ! pkg-config --exists "$pkg"; then
    printf 'LU_LINUX_DESKTOP_BLOCKED missing_pkg=%s\n' "$pkg" >&2
    exit 3
  fi
done
if [[ -d src-tauri/resources/lu-inference ]]; then
  printf 'LU_LINUX_DESKTOP_BLOCKED engine_package_already_exists\n' >&2
  exit 3
fi
receipt="$(node scripts/stage-lu-linux-engine.mjs "$2" "$3" src-tauri/resources/lu-inference)"
LU_TRUSTED_LLAMA_SERVER_SHA256="$(printf '%s\n' "$receipt" | sed -n 's/^LU_TRUSTED_LLAMA_SERVER_SHA256=//p')"
LU_TRUSTED_LLAMA_PACKAGE_SHA256="$(printf '%s\n' "$receipt" | sed -n 's/^LU_TRUSTED_LLAMA_PACKAGE_SHA256=//p')"
for digest in "$LU_TRUSTED_LLAMA_SERVER_SHA256" "$LU_TRUSTED_LLAMA_PACKAGE_SHA256"; do
  if [[ ! "$digest" =~ ^[0-9a-f]{64}$ ]]; then
    printf 'LU_LINUX_DESKTOP_BLOCKED invalid_engine_digest\n' >&2
    exit 3
  fi
done
export LU_TRUSTED_LLAMA_SERVER_SHA256 LU_TRUSTED_LLAMA_PACKAGE_SHA256
node scripts/prepare-lu-linux.mjs --prepare
marker="$CARGO_TARGET_DIR/lu-deb-build-start"
touch "$marker"
yarn tauri build --features lu-distribution \
  --config src-tauri/tauri.lu.conf.json \
  --config src-tauri/tauri.lu.linux.conf.json --bundles deb
bundle_dir="$CARGO_TARGET_DIR/release/bundle/deb"
shopt -s nullglob
artifacts=("$bundle_dir"/*.deb)
# Ignore pre-existing packages and prove every reported file is new.
new_artifacts=()
for file in "${artifacts[@]}"; do
  if [[ "$file" -nt "$marker" ]]; then
    new_artifacts+=("$file")
  fi
done
if [[ ${#new_artifacts[@]} -eq 0 ]]; then
  printf 'LU_LINUX_DESKTOP_FAIL no_new_debian_package\n' >&2
  exit 4
fi
for file in "${new_artifacts[@]}"; do
  dpkg-deb --info "$file" >/dev/null
  sha256sum "$file"
done
printf 'LU_LINUX_DEB_BUILT count=%s model_test=not_run gui_test=not_run windows_alpha=not_claimed\n' "${#new_artifacts[@]}"
