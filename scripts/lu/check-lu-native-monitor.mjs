import assert from 'node:assert/strict'
import fs from 'node:fs'
const from=p=>JSON.parse(fs.readFileSync(p,'utf8'))
export function validateNativeMonitor({jan, lu, config}) {
  assert.equal(jan.identifier,'system-monitor-window')
  assert.ok(jan.permissions.includes('llamacpp:allow-read-gguf-metadata'),
    'Jan monitor must retain its original permission for backward compatibility')
  assert.equal(lu.identifier,'lu-system-monitor-window')
  assert.deepEqual(lu.windows,['system-monitor-window'])
  assert.deepEqual(lu.platforms,['linux','macOS','windows'])
  assert.ok(lu.permissions.includes('hardware:allow-get-system-info'))
  assert.ok(lu.permissions.includes('hardware:allow-get-system-usage'))
  assert.ok(!lu.permissions.some(p=>
    (typeof p==='string'?p:p.identifier).startsWith('llamacpp:')),
    'Lu monitor cannot request Jan llama router permissions')
  assert.ok(config.app.security.capabilities.includes('lu-system-monitor-window'))
  assert.ok(!config.app.security.capabilities.includes('system-monitor-window'),
    'Lu must not inherit Jan system monitor permissions')
  return true
}
if (process.argv[1]?.endsWith('check-lu-native-monitor.mjs')) {
  validateNativeMonitor({
    jan:from('src-tauri/capabilities/system-monitor-window.json'),
    lu:from('src-tauri/capabilities/lu-system-monitor-window.json'),
    config:from('src-tauri/tauri.lu.conf.json')
  })
  console.log('LU_NATIVE_ONLY_MONITOR_AUTHORITY_PASS legacy_llamacpp=false')
}
