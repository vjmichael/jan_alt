import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {validateNativeMonitor} from './check-lu-native-monitor.mjs'
const load=p=>JSON.parse(fs.readFileSync(p,'utf8'))
const values=()=>({
  jan:load('src-tauri/capabilities/system-monitor-window.json'),
  lu:load('src-tauri/capabilities/lu-system-monitor-window.json'),
  config:load('src-tauri/tauri.lu.conf.json')
})
describe('Lu system-monitor vs Jan native-only isolation',()=>{
  it('accepts exact Lu monitor split, Jan unchanged',()=>assert.equal(validateNativeMonitor(values()),true))
  it('rejects inherited Jan llama-router permission',()=>{
    const x=values();x.lu.permissions.push('llamacpp:allow-read-gguf-metadata')
    assert.throws(()=>validateNativeMonitor(x))
  })
  it('rejects use of historical Jan capability in Lu',()=>{
    const x=values();x.config.app.security.capabilities.push('system-monitor-window')
    assert.throws(()=>validateNativeMonitor(x))
  })
  it('requires host hardware system usage rights',()=>{
    const x=values();x.lu.permissions=x.lu.permissions.filter(p=>p!=='hardware:allow-get-system-usage')
    assert.throws(()=>validateNativeMonitor(x))
  })
  it('requires window scoped to system monitor, not main',()=>{
    const x=values();x.lu.windows.push('main')
    assert.throws(()=>validateNativeMonitor(x))
  })
})
