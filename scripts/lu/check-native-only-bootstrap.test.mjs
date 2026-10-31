import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateNativeOnlySources } from './check-native-only-bootstrap.mjs'
// Windows checkout may convert LF to CRLF; mutation tests operate on
// semantic Rust lines, not platform-specific line-ending bytes.
const read = p => fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n')
const baseline = () => ({
  lib: read('src-tauri/src/lib.rs'),
  agent: read('src-tauri/plugins/tauri-plugin-agent-tools/src/lib.rs'),
  config: JSON.parse(read('src-tauri/tauri.lu.conf.json')),
  capability: JSON.parse(read('src-tauri/capabilities/lu-default.json'))
})
describe('Lu native-only distribution bootstrap', () => {
  it('accepts the exact checked-in source', () => assert.equal(validateNativeOnlySources(baseline()), true))
  it('denies reintroduced Jan worker resources', () => {
    const p=baseline(); p.config.bundle.resources['resources/bin/']='bin/'
    assert.throws(()=>validateNativeOnlySources(p))
  })
  it('denies remote IPC origins', () => {
    const p=baseline(); p.capability.remote={urls:['http://*']}
    assert.throws(()=>validateNativeOnlySources(p))
  })
  for (const permission of ['agent-tools:default','llamacpp:default','shell:allow-execute','updater:default']) {
    it('denies ' + permission, () => {
      const p=baseline();p.capability.permissions.push(permission)
      assert.throws(()=>validateNativeOnlySources(p))
    })
  }
  for (const [label,needle] of [
    ['llama router', '#[cfg(not(feature = "lu-distribution"))]\n    let builder = builder.plugin(tauri_plugin_llamacpp::init());'],
    ['agent plugin', '#[cfg(not(feature = "lu-distribution"))]\n    let builder = builder.plugin(tauri_plugin_agent_tools::init());'],
    ['MCP startup', '#[cfg(not(feature = "lu-distribution"))]\n            setup_mcp(app);'],
    ['MCP migration', '#[cfg(not(feature = "lu-distribution"))]\n            if let Err(e) = setup::migrate_mcp_servers('],
  ]) {
    it('denies ungated ' + label, () => {
      const p=baseline(); assert.ok(p.lib.includes(needle))
      p.lib=p.lib.replace(needle,needle.replace('#[cfg(not(feature = "lu-distribution"))]\n',''))
      assert.throws(()=>validateNativeOnlySources(p))
    })
  }
  it('requires native Protobuf tool entry point', () => {
    const p=baseline();p.lib=p.lib.replace('core::lu::lu_native_tool_execute','no_native_tool')
    assert.throws(()=>validateNativeOnlySources(p))
  })
})
