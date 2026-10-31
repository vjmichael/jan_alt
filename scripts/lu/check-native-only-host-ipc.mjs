// Fail closed if the native-only Lu Tauri app-handler accidentally retains
// Jan legacy MCP/Cowork/agent, raw filesystem, updater, or unsafe server IPC.
// This is a SOURCE contract; installed Windows WebView checks remain required.
import assert from 'node:assert/strict'
import fs from 'node:fs'

export function auditLuNativeOnlyHostIpc(source) {
  const code=source.replaceAll('\r\n','\n')
  const start=code.indexOf('// Lu-alpha webview IPC allowlist.')
  const end=code.indexOf('#[cfg(not(feature = "cli"))]\nstatic SHUTTING_DOWN:',start)
  assert.ok(start>=0 && end>start, 'Lu native-only generate_handler macro not found')
  const lu=code.slice(start,end)
  const head=code.slice(0,start)
  assert.match(lu, /#\[cfg\(all\(not\(feature = "cli"\), feature = "lu-distribution"\)\)\]\s*macro_rules! invoke_commands_with_extras/)
  assert.match(head, /#\[cfg\(all\(not\(feature = "cli"\), not\(feature = "lu-distribution"\)\)\)\]\s*macro_rules! invoke_commands_with_extras/,
    'Jan must retain a separate, incompatible legacy command map')
  const gather=s=>[...s.matchAll(/core::(?:[a-z_]+::)*[a-z_]+/g)].map(m=>m[0])
  const registered=gather(lu)
  const jan=gather(head)
  assert.ok(registered.length>20 && new Set(registered).size===registered.length,'Lu command list missing or duplicated')
  for(const term of [
    'core::lu::lu_native_tool_execute',
    'core::lu_inference::lu_inference_native_turn',
    'core::lu_inference::lu_inference_load',
    'core::lu_inference::lu_inference_cancel',
    'core::threads::commands::list_threads',
    'core::threads::commands::list_messages',
    'core::app::settings_store::settings_get'
  ]) assert.ok(registered.includes(term),'Missing required Lu handler: '+term)
  for(const path of registered) {
    assert.ok(!/^core::(?:mcp|agent|server|updater)::/.test(path), 'Jan legacy IPC exposed in Lu: '+path)
    assert.ok(!/^core::filesystem::commands::(?!open_dialog$|save_dialog$)/.test(path),
      'Raw filesystem IPC in native-only Lu: '+path)
    assert.ok(!/^(?:core::system::shutdown|core::system::commands::(?:factory_reset|launch_claude|clear_claude|relaunch))/.test(path),
      'Unsafe inherited system command in Lu: '+path)
  }
  assert.ok(jan.includes('core::mcp::commands::call_tool'),'Jan backwards compatibility MCP call registration lost')
  assert.ok(jan.includes('core::filesystem::commands::write_file_sync'),'Jan historical file handler altered')
  return {luCommands:registered.length,janCommands:jan.length,legacyLuCommands:0}
}
if(process.argv[1]?.endsWith('check-native-only-host-ipc.mjs')) {
  const outcome=auditLuNativeOnlyHostIpc(fs.readFileSync('src-tauri/src/lib.rs','utf8'))
  console.log('LU_NATIVE_ONLY_CORE_IPC_ALLOWLIST_PASS '+JSON.stringify(outcome))
}
