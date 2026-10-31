// Lu native-only design guard: source and manifest invariant checks.
// Static guard only. A Windows installer still needs an installed runtime test.
import assert from 'node:assert/strict'
import fs from 'node:fs'

export function validateNativeOnlySources({ lib, agent, config, capability }) {
  const cfg = (marker, call) => {
    const escaped = call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const ix = lib.indexOf(call)
    assert.ok(ix >= 0, 'missing expected source: ' + call)
    const prefix = lib.slice(Math.max(0, ix - 450), ix)
    assert.ok(prefix.includes(marker), 'unprotected native-only Jan bootstrap: ' + call)
  }
  const noLu = '#[cfg(not(feature = "lu-distribution"))]'
  for (const name of [
    'tauri_plugin_llamacpp::init()',
    'tauri_plugin_agent_tools::init()',
    'tauri_plugin_agent_tools::tools::hooks::set_resolver',
    'setup::migrate_mcp_servers(',
    'setup_mcp(app);',
    'tauri_plugin_updater::Builder::new().build()',
    'core::system::orphans::sweep_orphaned_engines('
  ]) cfg(noLu, name)
  for (const c of ['core::lu::lu_native_tool_execute', 'core::lu_inference::lu_inference_load',
    'core::lu_inference::lu_inference_native_turn', 'stop_lu_native_inference_on_exit'])
    assert.ok(lib.includes(c), 'Lu-native command lost: ' + c)
  assert.ok(/cfg\(all\(feature = "tauri", not\(feature = "lu-distribution"\)\)\)/.test(agent),
    'Jan command macro must be gated out of native-only Lu')
  assert.ok(!agent.includes('let builder = builder.invoke_handler(agent_tools_handler![]);'),
    'Lu must not register inherited empty/common agent tools handler')
  assert.equal(config.productName, 'Lu')
  assert.equal(config.mainBinaryName, 'Lu-Desktop')
  assert.equal(config.identifier, 'ai.lu.preview')
  assert.deepEqual(config.bundle.targets, ['nsis'])
  assert.deepEqual(config.plugins.updater.endpoints, [])
  assert.equal(config.bundle.resources['resources/lu-inference/'], 'lu-inference/')
  for (const input of Object.keys(config.bundle.resources)) {
    assert.ok(!/resources\/bin\//.test(input) && !/jan-llama-worker|bun|uv/i.test(input),
      'Legacy runtime payload mapped: ' + input)
  }
  const permissions = capability.permissions.map(p => typeof p === 'string' ? p : p.identifier)
  assert.deepEqual(capability.windows, ['main'])
  assert.ok(!Object.hasOwn(capability, 'remote'), 'remote origin inherited Lu IPC')
  assert.ok(permissions.includes('core:default'))
  assert.ok(!permissions.some(p=>/^(agent-tools|llamacpp|shell|updater):/.test(p)),
    'legacy plugin authority in Lu main window')
  return true
}

if (process.argv[1]?.endsWith('check-native-only-bootstrap.mjs')) {
  const read = p => fs.readFileSync(p, 'utf8')
  validateNativeOnlySources({
    lib: read('src-tauri/src/lib.rs'),
    agent: read('src-tauri/plugins/tauri-plugin-agent-tools/src/lib.rs'),
    config: JSON.parse(read('src-tauri/tauri.lu.conf.json')),
    capability: JSON.parse(read('src-tauri/capabilities/lu-default.json'))
  })
  console.log('LU_NATIVE_ONLY_BOOTSTRAP_SOURCE_PASS runtime_test=required')
}
