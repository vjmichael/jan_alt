#!/usr/bin/env bash
# Build Lu's pinned first-party llama.cpp CPU engine on Linux. No downloads.
# This is engineering preparation, NOT real GGUF/desktop acceptance.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
expected="7fe450e19305b828c199d602c23a8337aaa1f03b"
if [[ $# -lt 2 || $# -gt 3 || ( "$1" != '--check' && "$1" != '--build' ) ]]; then
  echo 'Usage: bash scripts/build-lu-linux-llama-local.sh [--check|--build] <pinned-llama-source> [package-output]' >&2
  exit 2
fi
mode="$1"
source_arg="$2"
package_arg="${3:-$root/src-tauri/resources/lu-inference}"
if [[ "$(uname -s)" != 'Linux' || "$(uname -m)" != 'x86_64' ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED requires_linux_x86_64' >&2
  exit 3
fi
if ! command -v git >/dev/null 2>&1; then
  echo 'LU_LLAMA_BUILD_BLOCKED missing=git' >&2
  exit 3
fi
if [[ ! -d "$source_arg" ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED source_directory_missing' >&2
  exit 3
fi
source_dir="$(cd "$source_arg" && pwd -P)"
actual="$(git -C "$source_dir" rev-parse HEAD 2>/dev/null || true)"
if [[ "$actual" != "$expected" ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED upstream_commit_mismatch' >&2
  exit 3
fi
if [[ -n "$(git -C "$source_dir" status --porcelain --untracked-files=no)" ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED tracked_source_modified' >&2
  exit 3
fi
for file in CMakeLists.txt tools/server/CMakeLists.txt; do
  if [[ ! -f "$source_dir/$file" ]]; then
    printf 'LU_LLAMA_BUILD_BLOCKED missing_source=%s\n' "$file" >&2
    exit 3
  fi
done
if [[ "$mode" == '--check' ]]; then
  echo "LU_LLAMA_PIN_CHECK_PASS commit=$expected build=not_attempted"
  exit 0
fi
for command in cmake gcc g++ node pkg-config; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'LU_LLAMA_BUILD_BLOCKED missing=%s\n' "$command" >&2
    exit 3
  fi
done
# The Debian 13 preview must not accidentally link against a newer OpenSSL.
openssl_version="$(pkg-config --modversion openssl 2>/dev/null || true)"
if [[ ! "$openssl_version" =~ ^3\.5\.[0-9]+$ ]]; then
  printf 'LU_LLAMA_BUILD_BLOCKED target_debian_13_requires_openssl_3_5 found=%s\n' "$openssl_version" >&2
  exit 3
fi
if [[ $# -eq 3 && -e "$package_arg" ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED package_output_exists' >&2
  exit 3
fi
build_dir="$source_dir/build/lu-linux-cpu"
CMAKE_BUILD_PARALLEL_LEVEL="${LU_LLAMA_BUILD_JOBS:-2}"
if [[ ! "$CMAKE_BUILD_PARALLEL_LEVEL" =~ ^[1-9][0-9]?$ ]]; then
  echo 'LU_LLAMA_BUILD_BLOCKED invalid_parallelism' >&2
  exit 3
fi
export CMAKE_BUILD_PARALLEL_LEVEL
cmake -S "$source_dir" -B "$build_dir" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGGML_NATIVE=OFF \
  -DGGML_CUDA=OFF \
  -DGGML_VULKAN=OFF \
  -DLLAMA_BUILD_TESTS=OFF \
  -DLLAMA_BUILD_EXAMPLES=OFF \
  -DLLAMA_BUILD_SERVER=ON \
  -DLLAMA_BUILD_UI=OFF \
  -DLLAMA_USE_PREBUILT_UI=OFF \
  -DLLAMA_CURL=OFF
cmake --build "$build_dir" --target llama-server --parallel "$CMAKE_BUILD_PARALLEL_LEVEL"
exe="$build_dir/bin/llama-server"
if [[ ! -x "$exe" ]]; then
  echo 'LU_LLAMA_BUILD_FAIL no_executable' >&2
  exit 4
fi
# The actual native executable must launch. Version-only, no model inference.
LD_LIBRARY_PATH="$build_dir/bin" timeout 15s "$exe" --version
node "$root/scripts/stage-lu-linux-engine.mjs" "$source_dir" "$build_dir/bin" "$package_arg"
echo "LU_LLAMA_CPU_ENGINE_BUILD_PASS commit=$expected inference=not_tested desktop=not_tested"
