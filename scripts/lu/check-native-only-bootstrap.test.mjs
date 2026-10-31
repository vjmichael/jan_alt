import { it, describe } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateNativeOnlySources } from './check-native-only-bootstrap.mjs'
const read = p => fs.readFileSync(p, 'utf8')
const baseline = () => ({
  lib: read('src-tauri/src/lib.rs'),
  agent: read('src-tauri/plugins/tauri-plugin-agent-tools/src/lib.rs'),
  config: JSON.parse(read('src-tauri/tauri.lu.conf.json')),
  capability: JSON.parse(read('src-tauri/capabilities/lu-default.json')),
})
describe('Lu native-only bootstrap source guard', () => {
  it('accepts the exact committed source', () => assert.equal(validateNativeOnlySources(baseline()), true))
  it('denies a Jan worker resource mapping', () => {
    const p=baseline();p.config.bundle.resources['resources/bin/']='bin/'
    assert.throws(()=>validateNativeOnlySources(p))
  })
  it('denies remote WebView privilege', () => {
    const p=baseline();p.capability.remote={urls:['http://*']}
    assert.throws(()=>validateNativeOnlySources(p))
  })
  for(const permission of ['agent-tools:default','llamacpp:default','shell:allow-execute','updater:default']) {
    it('denies ' + permission, () => {
      const p=baseline();p.capability.permissions.push(permission)
      assert.throws(()=>validateNativeOnlySources(p))
    })
  }
  it('denies ungated Jan plugin bootstrap', () => {
    const p=baseline();p.lib=p.lib.replace(
      '#[cfg(not(feature = "lu-distribution"))]\n    let builder = builder.plugin(tauri_plugin_llamacpp::init());',
      'let builder = builder.plugin(tauri_plugin_llamacpp::init());')
    assert.throws(()=>validateNativeOnlySources(p))
  })
  it('requires native file tool IPC', () => {
    const p=baseline();p.lib=p.lib.replace('core::lu::lu_native_tool_execute','removed_native_tool')
    assert.throws(()=>validateNativeOnlySources(p))
  })
})
