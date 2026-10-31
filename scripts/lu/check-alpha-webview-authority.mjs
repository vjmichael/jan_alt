// Lu alpha main WebView must not expose inherited agent IPC or shell spawning.
// Checks source configuration; runtime authorization needs separate acceptance.
import assert from 'node:assert/strict'
import fs from 'node:fs'
const forbidden = ['agent-tools:', 'llamacpp:', 'shell:']
export function assertLuMainAuthority(config) {
  assert.equal(config?.identifier, 'lu-default', 'unexpected capability identifier')
  assert.deepEqual(config.windows, ['main'], 'Lu main authority must not apply to other windows')
  assert.equal(Object.hasOwn(config, 'remote'), false, 'remote web origins cannot have Lu IPC')
  assert.ok(Array.isArray(config.permissions), 'permission list is required')
  for (const permission of config.permissions) {
    const name = typeof permission === 'string' ? permission : permission?.identifier
    assert.equal(typeof name, 'string', 'permission must have an explicit identifier')
    assert.equal(forbidden.some(prefix => name.startsWith(prefix)), false,
      'legacy agent/model/shell permission cannot reach Lu main WebView')
  }
  return true
}
if (process.argv[1]?.endsWith('check-alpha-webview-authority.mjs')) {
  const file = new URL('../../src-tauri/capabilities/lu-default.json', import.meta.url)
  assertLuMainAuthority(JSON.parse(fs.readFileSync(file, 'utf8')))
  console.log('LU_MAIN_WEBVIEW_AUTHORITY_SOURCE_PASS')
}
