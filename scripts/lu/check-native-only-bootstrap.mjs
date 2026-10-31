// Source-only guard: fail closed when Lu native-only accidentally boots Jan.
// This does not certify a Windows-installed release or tool authorization.
import assert from 'node:assert/strict'
import fs from 'node:fs'

export function validateNativeOnlySources({lib, agent, config, capability}) {
  assert.equal(typeof lib, 'string')
  const required = [
    [/#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*let builder = builder\.plugin\(tauri_plugin_llamacpp::init\(\)\);/, 'Jan llama-router initialization'],
    [/#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*let builder = builder\.plugin\(tauri_plugin_agent_tools::init\(\)\);/, 'Jan agent-tools initialization'],
    [/#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*tauri_plugin_agent_tools::tools::hooks::set_resolver/, 'Jan agent-hooks startup'],
    [/#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*if let Err\(e\) = setup::migrate_mcp_servers\(/, 'Jan MCP migration'],
    [/#\[cfg\(not\(feature = "lu-distribution"\)\)\]\s*setup_mcp\(app\);/, 'Jan MCP server bootstrap'],
    [/#\[cfg\(all\(\s*not\(any\(target_os = "ios", target_os = "android"\)\),\s*not\(feature = "lu-distribution"\)\s*\)\)\]\s*app\.handle\(\)\s*\.plugin\(tauri_plugin_updater::Builder::new\(\)\.build\(\)\)\?;/, 'Jan updater plugin'],
    [/#\[cfg\(all\(\s*not\(any\(target_os = "ios", target_os = "android"\)\),\s*not\(feature = "lu-distribution"\)\s*\)\)\]\s*\{\s*let data_folder = get_jan_data_folder_path\(app\.handle\(\)\.clone\(\)\);\s*tauri::async_runtime::spawn_blocking\(move \|\| \{\s*let killed = core::system::orphans::sweep_orphaned_engines\(/, 'Jan orphan sweep'],
    [/#\[cfg\(all\(not\(any\(target_os = "android", target_os = "ios"\)\), feature = "lu-distribution"\)\)\]\s*let app_builder = app_builder\.invoke_handler\(invoke_commands_with_extras!\[\]\);/, 'Lu native-only updater IPC quarantine'],
    [/#\[cfg\(all\(not\(any\(target_os = "android", target_os = "ios"\)\), not\(feature = "lu-distribution"\)\)\)\]\s*let app_builder = app_builder\.invoke_handler\(invoke_commands_with_extras!\[\s*core::updater::commands::check_for_app_updates,\s*core::updater::commands::is_update_available,/, 'Normal Jan updater IPC']
  ]
  for (const [pattern, label] of required) {
    assert.match(lib, pattern, 'Missing feature guard for ' + label)
  }
  for (const method of [
    'core::lu::lu_native_tool_execute',
    'core::lu_inference::lu_inference_load',
    'core::lu_inference::lu_inference_native_turn',
    'stop_lu_native_inference_on_exit'
  ]) assert.ok(lib.includes(method), 'Lu-native entry point missing: ' + method)

  assert.match(agent, /#\[cfg\(all\(feature = "tauri", not\(feature = "lu-distribution"\)\)\)\]\s*macro_rules! agent_tools_handler/)
  assert.doesNotMatch(agent, /#\[cfg\(feature = "lu-distribution"\)\]\s*let builder = builder\.invoke_handler/,
    'Inherited agent tools handler must never be registered for native-only Lu')
  assert.ok(!agent.includes('let builder = builder.invoke_handler(agent_tools_handler![]);'),
    'Inherited empty/common agent handler still registered for Lu')

  assert.equal(config.productName, 'Lu')
  assert.equal(config.mainBinaryName, 'Lu-Desktop')
  assert.equal(config.identifier, 'ai.lu.preview')
  assert.deepEqual(config.bundle.targets, ['nsis'])
  assert.deepEqual(config.plugins.updater.endpoints, [])
  assert.equal(config.bundle.resources['resources/lu-inference/'], 'lu-inference/')
  for (const requiredLicense of ['resources/LICENSE', 'resources/NOTICE', 'resources/licenses/Apache-2.0.txt']) {
    assert.ok(config.bundle.resources[requiredLicense], 'Missing upstream license/notice')
  }
  for (const input of Object.keys(config.bundle.resources)) {
    assert.ok(!/(?:resources\/bin\/|jan-llama-worker|(?:^|\/)bun(?:\/|\.|$)|(?:^|\/)uv(?:\/|\.|$))/i.test(input),
      'Legacy runtime payload mapped: ' + input)
  }
  assert.deepEqual(capability.windows, ['main'])
  assert.ok(!Object.hasOwn(capability, 'remote'), 'Remote origin inherited Lu IPC')
  const perms = capability.permissions.map(p => typeof p === 'string' ? p : p.identifier)
  assert.ok(perms.includes('core:default'))
  assert.ok(!perms.some(p => /^(agent-tools|llamacpp|shell|updater):/.test(p)),
    'Inherited Jan plugin permission in Lu main WebView')
  return true
}

if (process.argv[1]?.endsWith('check-native-only-bootstrap.mjs')) {
  const read = path => fs.readFileSync(path, 'utf8')
  validateNativeOnlySources({
    lib: read('src-tauri/src/lib.rs'),
    agent: read('src-tauri/plugins/tauri-plugin-agent-tools/src/lib.rs'),
    config: JSON.parse(read('src-tauri/tauri.lu.conf.json')),
    capability: JSON.parse(read('src-tauri/capabilities/lu-default.json'))
  })
  console.log('LU_NATIVE_ONLY_BOOTSTRAP_SOURCE_PASS installed_test=required')
}
