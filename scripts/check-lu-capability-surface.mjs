// Validate the Lu packaging overlay's main-window ACL independently of Jan.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
const config = read('src-tauri/tauri.lu.conf.json')
const lu = read('src-tauri/capabilities/lu-default.json')
const jan = read('src-tauri/capabilities/default.json')
const selected = config.app.security.capabilities
assert.ok(selected.includes('lu-default'), 'Lu capability not selected by packaging overlay')
assert.ok(!selected.includes('default') && !selected.includes('desktop'), 'Jan broad capability selected by Lu')
assert.equal(lu.identifier, 'lu-default')
assert.deepEqual(lu.windows, ['main'])
assert.ok(jan.permissions.includes('agent-tools:default'), 'Jan compatibility capability unexpectedly changed')

const permissions = lu.permissions.map((entry) => typeof entry === 'string' ? entry : entry.identifier)
assert.ok(permissions.includes('core:default'), 'Lu core window permission missing')
assert.ok(!Object.hasOwn(lu, 'remote'), 'Remote web origins must not inherit Lu IPC permissions')
for (const permission of permissions) {
  assert.ok(!/^(agent-tools|llamacpp|shell|updater):/.test(permission),
    `Legacy Jan agent/model/shell/updater permission in native-only Lu: ${permission}`)
}
assert.ok(jan.permissions.includes('agent-tools:default'),
  'Normal Jan capability must retain its own agent-tools compatibility')
// Cowork's historical `openPath(**)` is unnecessary in Lu. The only
// retained Settings operation opens host-derived logs via a pathless command.
assert.ok(jan.permissions.includes('opener:allow-open-path'), 'Jan opener compatibility altered')
assert.ok(!permissions.includes('opener:allow-open-path'), 'Lu grants arbitrary opener paths')
assert.ok(!lu.permissions.some(p => typeof p === 'object' &&
  p.identifier === 'opener:allow-open-path'), 'Lu retains scoped wildcard opener')
const host = fs.readFileSync('src-tauri/src/core/system/commands.rs', 'utf8')
const desktop = fs.readFileSync('src-tauri/src/lib.rs', 'utf8')
const general = fs.readFileSync('web-app/src/routes/settings/general.tsx', 'utf8')
assert.match(host, /pub fn lu_open_logs_folder<R: Runtime>\(app: AppHandle<R>\)/)
assert.match(host, /let logs = root\.join\("logs"\)/)
assert.match(host, /logs\.parent\(\) != Some\(root\.as_path\(\)\)/)
assert.match(desktop, /core::system::commands::lu_open_logs_folder/)
assert.match(general, /if \(LU_BRAND\)\s*\{[\s\S]*?invoke\('lu_open_logs_folder'\)/)
console.log(`Lu main-window capability has ${permissions.length} explicit entries; legacy Cowork and wildcard opener permissions excluded`)
