// Read-only, no-network capability inventory for Linux-first Lu engineering.
// It does not install dependencies, fetch models, start GitHub Actions, or
// treat a compiler's mere presence as a successful build.
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const COMMANDS = {
  core: ['cargo', 'rustc', 'node'],
  engine: ['cmake', 'gcc', 'git'],
  desktop: ['pkg-config', 'yarn'],
}
const LIBRARIES = [
  'webkit2gtk-4.1', 'javascriptcoregtk-4.1', 'gtk+-3.0',
  'libsoup-3.0', 'openssl', 'ayatana-appindicator3-0.1', 'librsvg-2.0',
]
export function inspectLinuxEnvironment({ platform, arch, hasCommand, hasPackage }) {
  const supported = platform === 'linux' && arch === 'x64'
  const groups = {}
  for (const [name, commands] of Object.entries(COMMANDS)) {
    groups[name] = Object.fromEntries(commands.map(cmd => [cmd, Boolean(hasCommand(cmd))]))
  }
  const packages = Object.fromEntries(LIBRARIES.map(pkg => [pkg, Boolean(hasPackage(pkg))]))
  const coreReady = supported && Object.values(groups.core).every(Boolean)
  const engineReady = coreReady && Object.values(groups.engine).every(Boolean)
  const desktopReady = engineReady && Object.values(groups.desktop).every(Boolean) &&
    Object.values(packages).every(Boolean)
  const missing = {
    core: Object.entries(groups.core).filter(([, has]) => !has).map(([key]) => key),
    engine: Object.entries(groups.engine).filter(([, has]) => !has).map(([key]) => key),
    desktop: Object.entries(groups.desktop).filter(([, has]) => !has).map(([key]) => key),
    libraries: Object.entries(packages).filter(([, has]) => !has).map(([key]) => key),
  }
  return {
    schema: 'lu-linux-preflight-v1', platform, arch,
    supported, coreReady, engineReady, desktopReady, missing,
    note: 'Capability checks only; no Lu build or real GGUF test is implied',
  }
}

function probe(executable, args) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8', timeout: 3000, stdio: 'ignore',
  })
  return result.status === 0 && !result.error
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectLinuxEnvironment({
    platform: process.platform,
    arch: process.arch,
    hasCommand: cmd => probe(cmd, ['--version']),
    hasPackage: pkg => probe('pkg-config', ['--exists', pkg]),
  })
  console.log(JSON.stringify(result, null, 2))
  // Exit 0 for read-only diagnostic completion, even when dependencies are
  // missing; consuming scripts decide which gate is appropriate.
}
