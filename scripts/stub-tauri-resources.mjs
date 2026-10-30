// The Tauri build script validates resources, externalBin, icons and
// frontendDist exist. Create stubs so a compile-only run succeeds in CI, where
// none of them are built.
//
// Node rather than shell because a stock Windows box has neither `bash` nor
// `sh` on PATH -- a default Git for Windows install puts only `Git\cmd` there,
// which is `git.exe` alone. Every caller already needs `node`, and this uses
// only builtins, so it also runs before `yarn install` has produced a
// node_modules (which is the state the rust-check workflow calls it in).
import { execFileSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved against the repo root, not the caller's cwd: the callers are a
// package.json script, a Makefile recipe, two workflows and rust-coverage.sh,
// and not all of them pin where they run from. (import.meta.dirname would say
// this more directly, but it needs Node 20.11 and CI only asks for 20.)
const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const path = (...parts) => join(repoRoot, ...parts)

// Every stub is guarded so we never clobber a real local build or churn the
// cargo:rerun-if-changed stamps these paths emit.
function touch(target) {
  if (!existsSync(target)) writeFileSync(target, '')
}

const triple = execFileSync('rustc', ['-vV'], { encoding: 'utf8' })
  .split('\n')
  .find((line) => line.startsWith('host:'))
  .slice('host:'.length)
  .trim()

for (const dir of [
  'src-tauri/resources/bin',
  'src-tauri/resources/pre-install',
  'src-tauri/icons',
  'web-app/dist',
]) {
  mkdirSync(path(dir), { recursive: true })
}

touch(path('src-tauri/resources/LICENSE'))
touch(path('web-app/dist/index.html'))
if (readdirSync(path('src-tauri/resources/pre-install')).length === 0) {
  touch(path('src-tauri/resources/pre-install/.gitkeep'))
}

// The executable suffix, and the ggml runtime that ships beside the engine
// worker. `libggml*` is a glob in the bundle config, and a glob that matches
// nothing is an error (GlobPathNotFound), not an empty set -- so one stub
// library is required, not optional.
let exe = ''
let lib
if (process.platform === 'darwin') {
  lib = 'libggml-base.dylib'
  // macOS also bundles the MLX server and the resource bundle beside it.
  touch(path('src-tauri/resources/bin/mlx-server'))
  mkdirSync(path('src-tauri/resources/bin/mlx-swift_Cmlx.bundle'), {
    recursive: true,
  })
} else if (process.platform === 'win32') {
  exe = '.exe'
  lib = 'ggml-base.dll'
} else {
  lib = 'libggml-base.so'
}

// Tauri resolves an externalBin entry to `<name>-<triple><exe>`. The shell
// version omitted the suffix, which nothing caught because it could not run on
// the one platform where the suffix is not empty.
for (const bin of ['uv', 'bun']) {
  touch(path('src-tauri/resources/bin', `${bin}-${triple}${exe}`))
}

for (const bin of ['jan-llama-worker']) {
  touch(path('src-tauri/resources/bin', `${bin}${exe}`))
}

// Any name mentioning ggml that carries the platform's library extension
// counts, matching what the bundle config globs for.
const libExt = lib.slice(lib.lastIndexOf('.'))
const haveRuntime = readdirSync(path('src-tauri/resources/bin')).some((name) => {
  const ggml = name.indexOf('ggml')
  return ggml !== -1 && name.indexOf(libExt, ggml) !== -1
})
if (!haveRuntime) touch(path('src-tauri/resources/bin', lib))

// Icons are gitignored; generate_context!() requires them at compile time.
// These compile-only resources are NEVER valid NSIS/production package inputs.
// Keep real upstream or Lu-owned icons intact: all stubs are missing-file only.
for (const icon of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.icns']) {
  const target = path('src-tauri/icons', icon)
  if (!existsSync(target)) copyFileSync(path('src-tauri/icons/icon.png'), target)
}

// Windows RC.EXE requires an actual ICO 3.00 resource container, not PNG bytes
// with an .ico suffix. Produce a tiny deterministic 32-bit BMP-backed ICO as
// an explicitly non-shipping compile fixture, with no image tools/dependencies.
// The existing stub erroneously copied icon.png to icon.ico; this made every
// Windows cargo check fail before it could validate Lu's Rust host.
const icoTarget = path('src-tauri/icons/icon.ico')
if (!existsSync(icoTarget)) {
  const side = 32
  const pixelBytes = side * side * 4
  const maskStride = Math.ceil(side / 32) * 4
  const maskBytes = maskStride * side
  const bitmapBytes = 40 + pixelBytes + maskBytes
  const icon = Buffer.alloc(22 + bitmapBytes)

  // ICONDIR + ICONDIRENTRY (one uncompressed 32x32 32-bpp bitmap).
  icon.writeUInt16LE(1, 2) // ICO image type
  icon.writeUInt16LE(1, 4) // image count
  icon[6] = side
  icon[7] = side
  icon.writeUInt16LE(1, 10) // color planes
  icon.writeUInt16LE(32, 12) // bits per pixel
  icon.writeUInt32LE(bitmapBytes, 14)
  icon.writeUInt32LE(22, 18) // bitmap offset

  // BITMAPINFOHEADER: ICO DIB height includes XOR and AND masks.
  icon.writeUInt32LE(40, 22)
  icon.writeInt32LE(side, 26)
  icon.writeInt32LE(side * 2, 30)
  icon.writeUInt16LE(1, 34)
  icon.writeUInt16LE(32, 36)
  icon.writeUInt32LE(pixelBytes + maskBytes, 42)
  // Opaque neutral pixels; the zero-initialized AND mask is all visible.
  for (let i = 0; i < pixelBytes; i += 4) {
    icon[62 + i] = 0x40 // blue
    icon[62 + i + 1] = 0x70 // green
    icon[62 + i + 2] = 0x90 // red
    icon[62 + i + 3] = 0xff // alpha
  }
  writeFileSync(icoTarget, icon)
}
