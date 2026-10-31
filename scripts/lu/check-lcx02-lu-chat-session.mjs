import assert from 'node:assert/strict'
import fs from 'node:fs'
for (const file of ['web-app/src/hooks/useLuChat.ts','web-app/src/stores/lu-chat-session-store.ts']) {
  const code=fs.readFileSync(file,'utf8').replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')
  for (const forbidden of ['CustomChatTransport','ModelFactory','useServiceHub','@janhq/core',
    'useAppState','useMCPServers','mcpOrchestrator','llamacpp-api','coworkTransport','useChatSessions']) {
    assert.ok(!code.includes(forbidden),file+' depends on Jan runtime: '+forbidden)
  }
}
const hook=fs.readFileSync('web-app/src/hooks/useLuChat.ts','utf8')
assert.ok(hook.includes('transport => new Chat({ ...init, transport })'))
const store=fs.readFileSync('web-app/src/stores/lu-chat-session-store.ts','utf8')
assert.ok(store.includes('new LuChatTransport(id)'))
console.log('LU_LCX02_NATIVE_SESSION_SOURCE_PASS old_Jan_transport=false')
