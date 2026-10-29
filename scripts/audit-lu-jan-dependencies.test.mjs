import test from 'node:test'
import assert from 'node:assert/strict'
import { AUDITED_FILES, dependencyAudit } from './audit-lu-jan-dependencies.mjs'

function fixture() {
  const input = Object.fromEntries(Object.keys(AUDITED_FILES).map(key => [key, '']))
  input.ordinaryChat = 'sendLuNativeConversation'
  input.coworkRunner = 'abortRun'
  input.coworkDispatch = 'executeLuNativeTool'
  input.coworkTransport = 'CustomChatTransport'
  input.chatTools = 'CHAT_AGENT_TOOL_NAMES'
  input.agentServer = 'execute_builtin_with_diff'
  input.legacyHandlers = 'execute_builtin_with_diff'
  input.legacyCommands = 'execute_tool_streaming'
  input.legacyBridge = 'register_legacy_builtins'
  input.luInference = 'run_supervised_native_turn_with_effects'
  input.luHost = [
    'tauri_plugin_agent_tools::workspace::thread_workspace',
    'tauri_plugin_agent_tools::workspace::threads_dir',
    'tauri_plugin_agent_tools::workspace::session_workspace',
    'tauri_plugin_agent_tools::workspace::sessions_dir',
    'tauri_plugin_agent_tools::workspace::permanent_store',
  ].join('\n')
  input.inventory = JSON.stringify({
    license: 'Apache-2.0',
    verifiedFiles: [{ path: AUDITED_FILES.legacyHandlers }],
  })
  input.license = 'Copyright 2025 Menlo Research'
  input.notice = 'Jan Apache 2.0 attribution'
  return input
}

test('reports legacy dependencies without declaring Jan removed', () => {
  const result = dependencyAudit(fixture())
  assert.deepEqual(result.errors, [])
  assert.equal(result.janWorkspaceCalls.length, 5)
  assert.ok(result.janWorkspaceCalls.every(row => row.locations.length === 1))
})
test('fails when a required Jan-to-Lu migration seam changes unreviewed', () => {
  const source = fixture()
  source.luHost = source.luHost.replace('tauri_plugin_agent_tools::workspace::permanent_store', 'unknown_new_path')
  assert.ok(dependencyAudit(source).errors.some(item => item.includes('permanent_store')))
})
test('does not confuse missing Jan notice with independent Lu authorship', () => {
  const source = fixture()
  source.notice = 'Lu only'
  assert.ok(dependencyAudit(source).errors.some(item => item.includes('attribution')))
})
test('detects loss of host-owned cancellable durable native tool route', () => {
  const source = fixture()
  source.luInference = 'run_supervised_native_turn_journaled'
  assert.ok(dependencyAudit(source).errors.some(item => item.includes('durable desktop turn')))
})
test('rejects missing source rather than reporting misleading zero dependencies', () => {
  const source = fixture()
  delete source.agentServer
  assert.ok(dependencyAudit(source).errors.some(item => item.includes(AUDITED_FILES.agentServer)))
})
