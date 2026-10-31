import {it,describe} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {auditLuNativeOnlyHostIpc} from './check-native-only-host-ipc.mjs'
const source=()=>fs.readFileSync('src-tauri/src/lib.rs','utf8').replaceAll('\r\n','\n')
const target='core::lu::lu_native_tool_execute,'
describe('Lu native-only host IPC allowlist',()=>{
  it('accepts committed Lu/Jan two-table handler source',()=>{
    const r=auditLuNativeOnlyHostIpc(source())
    assert.ok(r.luCommands>20)
    assert.equal(r.legacyLuCommands,0)
  })
  for(const added of [
    'core::mcp::commands::call_tool,',
    'core::agent::commands::agent_skill_invoke,',
    'core::filesystem::commands::write_file_sync,',
    'core::server::commands::start_server,',
    'core::system::commands::launch_claude_code_with_config,'
  ]) it('rejects '+added,()=>{
    const s=source().replace('// Lu-alpha webview IPC allowlist.','// Lu-alpha webview IPC allowlist.')
    const loc=s.lastIndexOf(target)
    assert.ok(loc>=0)
    assert.throws(()=>auditLuNativeOnlyHostIpc(s.slice(0,loc)+added+'\n            '+s.slice(loc)))
  })
  it('rejects removal of native tool handler',()=>{
    const s=source().replace(target,'core::lu::lu_native_tool_catalog,')
    assert.throws(()=>auditLuNativeOnlyHostIpc(s))
  })
  it('rejects removal of Jan historical MCP handler',()=>{
    const s=source().replace('core::mcp::commands::call_tool,','')
    assert.throws(()=>auditLuNativeOnlyHostIpc(s))
  })
})
