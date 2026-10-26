// Packaging-only transformation: keep Jan's checked-in Cargo manifest intact.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const config = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json', 'utf8'))
assert.equal(config.identifier, 'ai.lu.preview')
assert.equal(config.productName, 'Lu')
assert.equal(config.mainBinaryName, 'Lu-Desktop')
assert.deepEqual(config.plugins.updater.endpoints, [])
assert.deepEqual(config.bundle.targets, ['nsis'])

const path = 'src-tauri/Cargo.toml'
let cargo = fs.readFileSync(path, 'utf8')
for (const [before, after] of [
  ['default-run = "Jan-Desktop"', 'default-run = "Lu-Desktop"'],
  ['name = "Jan-Desktop"', 'name = "Lu-Desktop"'],
]) {
  assert.equal(cargo.split(before).length - 1, 1, `Expected one Cargo manifest occurrence: ${before}`)
  cargo = cargo.replace(before, after)
}
assert.match(cargo, /lu-distribution = \["lu-foundation"\]/)
fs.writeFileSync(path, cargo)
console.log('Prepared Lu-Desktop bin name for isolated Windows preview packaging')
