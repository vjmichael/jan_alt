// Packaging-only transformation: keep Jan's checked-in Cargo manifest intact.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

const config = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json', 'utf8'))
assert.equal(config.identifier, 'ai.lu.preview')
assert.equal(config.productName, 'Lu')
assert.equal(config.mainBinaryName, 'Lu-Desktop')
assert.deepEqual(config.plugins.updater.endpoints, [])
assert.deepEqual(config.bundle.targets, ['nsis'])
assert.ok(config.bundle.icon.every((icon) => icon.startsWith('icons/lu/')))
assert.match(config.build.beforeBuildCommand, /LU_BRAND=true/)
assert.deepEqual(config.bundle.externalBin, [],
  'Lu must explicitly declare no inherited Jan/Bun/UV binaries')

// Tauri automatically merges tauri.windows.conf.json when targeting Windows,
// EVEN when --config src-tauri/tauri.lu.conf.json is supplied. The repository's
// shared Windows config contains Jan-only resources/bin and externalBin
// entries, which silently added bun.exe and uv.exe to the Lu NSIS installer.
// This rewrite affects only this disposable packaging checkout. It preserves
// the Windows WebView2 bootstrap configuration and leaves Jan's checked-in
// Windows config intact in Git, not the user's installed Jan application.
if (process.platform === 'win32') {
  const platformPath = 'src-tauri/tauri.windows.conf.json'
  const windows = JSON.parse(fs.readFileSync(platformPath, 'utf8'))
  assert.deepEqual(
    windows.bundle?.externalBin,
    ['resources/bin/bun', 'resources/bin/uv'],
    'Unexpected Jan platform sidecars: inspect before stripping any dependencies'
  )
  assert.ok(
    windows.bundle?.resources?.includes('resources/bin/jan-llama-worker.exe'),
    'Expected inherited Jan Windows worker resource not found'
  )
  assert.ok(windows.bundle.windows?.webviewInstallMode,
    'Windows WebView2 bootstrap policy must remain configured')
  const luWindows = {
    bundle: { windows: windows.bundle.windows },
  }
  fs.writeFileSync(platformPath, JSON.stringify(luWindows, null, 2) + '\n')
  console.log('Lu packaging suppressed inherited Jan Windows resources and Bun/UV sidecars')
}

const path = 'src-tauri/Cargo.toml'
let cargo = fs.readFileSync(path, 'utf8')
for (const [before, after] of [
  ['default-run = "Jan-Desktop"', 'default-run = "Lu-Desktop"'],
  ['name = "Jan-Desktop"', 'name = "Lu-Desktop"'],
]) {
  assert.equal(cargo.split(before).length - 1, 1, `Expected one Cargo manifest occurrence: ${before}`)
  cargo = cargo.replace(before, after)
}
assert.match(cargo, /lu-distribution = \["lu-foundation", "tauri-plugin-agent-tools\/lu-distribution"\]/)
// Generate Lu-only icons without replacing Jan's checked-in icon assets.
// Generate before changing Cargo.toml so a conversion failure leaves it intact.
const icon = spawnSync('yarn', ['tauri', 'icon', 'src-tauri/icons/lu-icon.svg', '--output', 'src-tauri/icons/lu'], {
  stdio: 'inherit', shell: process.platform === 'win32',
})
if (icon.error || icon.status !== 0) {
  throw new Error('Failed to generate Lu icons: ' + (icon.error?.message ?? icon.status))
}
fs.writeFileSync(path, cargo)
console.log('Prepared Lu-Desktop binary and Lu-only icons for Windows preview packaging')
