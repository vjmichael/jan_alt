// Compile-free source preflight for Lu's experimental native-only NSIS bundle.
import assert from 'node:assert/strict'
import fs from 'node:fs'
export function validateLuNativeOnlyBundle(config) {
  assert.equal(config.productName, 'Lu')
  assert.equal(config.mainBinaryName, 'Lu-Desktop')
  assert.equal(config.identifier, 'ai.lu.preview')
  assert.deepEqual(config.bundle.targets, ['nsis'])
  assert.deepEqual(config.plugins.updater.endpoints, [])
  assert.equal(config.bundle.resources['resources/lu-inference/'], 'lu-inference/')
  for (const required of ['resources/LICENSE','resources/NOTICE','resources/licenses/Apache-2.0.txt']) {
    assert.ok(config.bundle.resources[required], 'attribution resource missing')
  }
  for (const source of Object.keys(config.bundle.resources)) {
    assert.ok(!source.includes('/bin/') && !/jan-llama|bun|uv/.test(source.toLowerCase()),
      'legacy Jan worker or external runtime cannot be bundled in native-only Lu')
  }
  return true
}
if (process.argv[1]?.endsWith('check-native-only-distribution.mjs')) {
  const file = new URL('../../src-tauri/tauri.lu.conf.json', import.meta.url)
  validateLuNativeOnlyBundle(JSON.parse(fs.readFileSync(file,'utf8')))
  console.log('LU_NATIVE_ONLY_NSIS_SOURCE_PASS')
}
