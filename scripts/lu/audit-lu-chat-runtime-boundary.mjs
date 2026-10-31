// LCX-00 source-boundary inventory, not an independence certificate.
// The audit intentionally reports still-live Jan chat dependencies as BLOCKED.
import assert from 'node:assert/strict'
import fs from 'node:fs'

export function classifyLuChatGraph({route, hook, transport, store, native}) {
  const includes=(s,token)=>typeof s==='string'&&s.includes(token)
  const detected={
    route_uses_jan_chat_hook: includes(route,"from '@/hooks/use-chat'"),
    route_uses_mcp_tool_runtime: includes(route,'serviceHub.mcp().callToolWithCancellation('),
    hook_constructs_jan_transport: includes(hook,'new CustomChatTransport('),
    hook_subscribes_mcp_rag: includes(hook,'mcpToolNames')&&includes(hook,'ragToolNames'),
    jan_transport_imports_model_factory: includes(transport,"from './model-factory'"),
    jan_transport_imports_mcp_orchestrator: includes(transport,"from '@/lib/mcp-orchestrator'"),
    session_store_typed_jan_transport: includes(store,'transport: CustomChatTransport'),
    lu_native_host_turn_present: includes(native,"'lu_inference_native_turn'"),
    lu_native_cancel_present: includes(native,"'lu_inference_native_turn_cancel'"),
    lu_native_persisted_owner_present: includes(native,"model?.provider === 'lu-native'"),
    lu_branded_send_fails_closed: includes(transport,"throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')")
  }
  const legacyNodes=Object.keys(detected).filter(k=>
    k.startsWith('route_')||k.startsWith('hook_')||
    k.startsWith('jan_transport_')||k.startsWith('session_store_'))
    .filter(k=>detected[k])
  // During migration Jan's upstream transport still exists; Lu must
  // actively reject its fallback. Once that execution graph is physically
  // absent from the Lu entry point, the old rejection branch is unnecessary
  // and must not become a false dependency of the final Lu-only runtime.
  const nativeReady=detected.lu_native_host_turn_present&&
    detected.lu_native_cancel_present&&
    detected.lu_native_persisted_owner_present&&
    (legacyNodes.length===0||detected.lu_branded_send_fails_closed)
  return Object.freeze({
    legacyNodes, legacyCount:legacyNodes.length, nativeReady,
    status:legacyNodes.length===0&&nativeReady?'SOURCE_ELIGIBLE_NOT_INSTALLED_VERIFIED':'BLOCKED',
    detected
  })
}

if (process.argv[1]?.endsWith('audit-lu-chat-runtime-boundary.mjs')) {
  const read=p=>fs.readFileSync(p,'utf8')
  const result=classifyLuChatGraph({
    route:read('web-app/src/routes/threads/$threadId.tsx'),
    hook:read('web-app/src/hooks/use-chat.ts'),
    transport:read('web-app/src/lib/custom-chat-transport.ts'),
    store:read('web-app/src/stores/chat-session-store.ts'),
    native:read('web-app/src/lib/luInference.ts')
  })
  assert.equal(result.nativeReady,true,'Current native host path must remain')
  console.log('LU_CHAT_LCX00_SOURCE_INVENTORY '+JSON.stringify(result))
  // Blocking old wiring is recorded but does not reject this PRE-EXTRACTION
  // inventory job. Final alpha requires a separate strict independence gate.
}
