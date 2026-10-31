import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const s=readFileSync('web-app/src/lib/luChatTransport.ts','utf8')
// Source comments can name forbidden Jan dependencies as documentation;
// only executable imports/references are a runtime-graph violation.
const code=s.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'')
for(const forbidden of [
  'ModelFactory','serviceHub','useServiceStore','mcpOrchestrator',
  'Cowork','llamacpp-api','@janhq/core','agentTools',
  'executeLuNativeTool','refreshTools','getTools'
]) assert.ok(!code.includes(forbidden), 'Jan/runtime control leaked into Lu transport: '+forbidden)
for(const expected of [
  'sendLuNativeConversation(', 'luNativeEnabledForThread(',
  'options.chatId !== this.boundThreadId',
  'options.abortSignal?.throwIfAborted()'
]) assert.ok(s.includes(expected), 'Lu transport lost invariant: '+expected)
console.log('LU_LCX01_TRANSPORT_SOURCE_PASS legacy_model_factory=false legacy_mcp=false host_owned_native_turn=true')
