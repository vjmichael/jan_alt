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
