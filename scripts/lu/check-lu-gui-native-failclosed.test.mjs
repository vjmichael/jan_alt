import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {auditLuGuiNativeFailClosed} from './check-lu-gui-native-failclosed.mjs'
const source=()=>readFileSync('web-app/src/lib/custom-chat-transport.ts','utf8').replaceAll('\r\n','\n')
const inference=()=>readFileSync('web-app/src/lib/luInference.ts','utf8').replaceAll('\r\n','\n')
const check=src=>auditLuGuiNativeFailClosed(src,inference())
describe('Lu native-only GUI model/provider dispatch',()=>{
  it('only native Lu sessions can send on branded Lu desktop',()=>{
    const result=check(source())
    assert.equal(result.legacyFallbackOnLu,false)
    assert.equal(result.unbrandedJan,'preserved')
  })
  it('rejects accidental deletion of the Lu stop gate',()=>{
    const src=source().replace(
      "    if (LU_BRAND) {\n      throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')\n    }\n",'')
    assert.throws(()=>check(src))
  })
  it('rejects inverted brand guard that would send Lu to Jan provider',()=>{
    const src=source().replace(
      "    if (LU_BRAND) {\n      throw new Error('Select a Lu GGUF model",
      "    if (!LU_BRAND) {\n      throw new Error('Select a Lu GGUF model")
    assert.throws(()=>check(src))
  })
  it('rejects legacy provider state entered before brand rejection',()=>{
    const src=source().replace(
      "    if (LU_BRAND) {\n      throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')\n    }\n    useAppState",
      "    useAppState\n    if (LU_BRAND) {\n      throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')\n    }")
    assert.throws(()=>check(src))
  })
  it('rejects removal of native worker dispatch',()=>{
    const src=source().replace("return sendLuNativeConversation(options.messages, threadId, options.abortSignal)","return this.legacySend(options)")
    assert.throws(()=>check(src))
  })
  it('rejects missing thread-hydration safety check',()=>{
    const src=source().replace(
      "    if (LU_BRAND && !useThreads.getState().threads[threadId]) {",
      "    if (false && !useThreads.getState().threads[threadId]) {")
    assert.throws(()=>check(src))
  })
  it('rejects fallback for restored native threads',()=>{
    const i=inference().replace("model?.provider === 'lu-native'","model?.provider === 'llamacpp'")
    assert.throws(()=>auditLuGuiNativeFailClosed(source(),i))
  })
  it('rejects missing native host tool-turn path',()=>{
    const i=inference().replace("'lu_inference_native_turn'","'legacy_inference_turn'")
    assert.throws(()=>auditLuGuiNativeFailClosed(source(),i))
  })
})
