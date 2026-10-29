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
    !/^agent-tools:(?:default|allow-(?:execute-tool(?:-streaming)?|session-|subagent-|blackboard-|start-monitor|stop-monitor|stop-session-monitors|list-monitors|preview-))/.test(permission),
    `Legacy Cowork execution/session permission in Lu: ${permission}`
  )
}
console.log(`Lu main-window capability has ${permissions.length} explicit entries; legacy Cowork execution/session permissions excluded`)
