import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import {classifyLuChatGraph} from './audit-lu-chat-runtime-boundary.mjs'
const get=()=>({
  route:fs.readFileSync('web-app/src/routes/threads/$threadId.tsx','utf8'),
  hook:fs.readFileSync('web-app/src/hooks/use-chat.ts','utf8'),
  transport:fs.readFileSync('web-app/src/lib/custom-chat-transport.ts','utf8'),
  store:fs.readFileSync('web-app/src/stores/chat-session-store.ts','utf8'),
  native:fs.readFileSync('web-app/src/lib/luInference.ts','utf8')
})
describe('LCX-00 Lu/Jan chat dependency inventory',()=>{
  it('truthfully reports remaining upstream chat owner graph as BLOCKED',()=>{
    const x=classifyLuChatGraph(get())
    assert.equal(x.status,'BLOCKED')
    assert.ok(x.legacyCount>=5)
    assert.equal(x.nativeReady,true)
  })
  it('refuses to treat missing native cancellation as ready',()=>{
    const g=get();g.native=g.native.replace("'lu_inference_native_turn_cancel'","'legacy_cancel'")
    assert.equal(classifyLuChatGraph(g).nativeReady,false)
  })
  it('detects unexpected removal of Lu fail-closed entry path',()=>{
    const g=get();g.transport=g.transport.replace(
      "throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')",
      "console.log('fallback')")
    assert.equal(classifyLuChatGraph(g).nativeReady,false)
  })
  it('remains blocked when only Jan-model imports disappear but hook still constructs Jan',()=>{
    const g=get();g.transport=g.transport.replace("from './model-factory'","from './lu-model-factory'")
    assert.equal(classifyLuChatGraph(g).status,'BLOCKED')
  })
  it('never equates source-eligibility with actual installed verification',()=>{
    const g=get()
    for(const needle of ["from '@/hooks/use-chat'",'serviceHub.mcp().callToolWithCancellation('])
      g.route=g.route.replace(needle,'not-a-runtime-link')
    for(const needle of ['new CustomChatTransport(','mcpToolNames','ragToolNames'])
      g.hook=g.hook.replaceAll(needle,'not-a-runtime-link')
    g.transport=g.transport.replace("from './model-factory'",'unlinked').replace("from '@/lib/mcp-orchestrator'",'unlinked')
    g.store=g.store.replace('transport: CustomChatTransport','transport: LuChatTransport')
    assert.equal(classifyLuChatGraph(g).status,'SOURCE_ELIGIBLE_NOT_INSTALLED_VERIFIED')
  })
})
