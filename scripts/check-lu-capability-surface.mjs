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
const agentPermissions = permissions.filter((p) => p.startsWith('agent-tools:'))
assert.equal(new Set(agentPermissions).size, agentPermissions.length, 'Duplicate Lu agent-tools permission')
assert.ok(permissions.includes('core:default') && permissions.includes('llamacpp:default'))
assert.ok(permissions.includes('agent-tools:allow-thread-workspace-path'))
for (const permission of permissions) {
  assert.ok(
    !/^agent-tools:(?:default|allow-(?:execute-tool(?:-streaming)?|session-|subagent-|blackboard-|start-monitor|stop-monitor|stop-session-monitors|list-monitors|preview-|attachment-import|skill-invoke))/.test(permission),
    `Legacy Cowork execution/session permission in Lu: ${permission}`
  )
}
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
