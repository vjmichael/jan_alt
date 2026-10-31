// Lu source-level GUI routing guard. Rejects accidental legacy Jan model
// fallback, which would bypass the native-only worker/authorization boundary.
// This does not substitute for real installed WebView chat acceptance.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

export function auditLuGuiNativeFailClosed(transportSource, inferenceSource) {
  assert.equal(typeof transportSource,'string')
  const text=transportSource.replaceAll('\r\n','\n')
  const start=text.indexOf('  private async prepareMessages(')
  assert.ok(start>=0,'Custom transport chat dispatch method missing')
  const section=text.slice(start,start+2600)
  const native=/if\s*\(luNativeEnabledForThread\(threadId\)\)\s*\{\s*return sendLuNativeConversation\(options\.messages, threadId, options\.abortSignal\)\s*\}/
  const hydrate=/if\s*\(LU_BRAND && !useThreads\.getState\(\)\.threads\[threadId\]\)\s*\{\s*throw new Error\('Lu chat is still loading\. Please retry\.'\)\s*\}/
  const blocked=/if\s*\(LU_BRAND\)\s*\{\s*throw new Error\('Select a Lu GGUF model and enable Use Lu for this chat before sending\.'\)\s*\}/
  for(const [name,re] of [['native-first',native],['hydrate fail-closed',hydrate],['legacy Lu fallback rejection',blocked]]) {
    assert.match(section,re,'Missing '+name)
  }
  const a=section.search(native)
  const b=section.search(hydrate)
  const c=section.search(blocked)
  const model=section.indexOf('this.resolveTurnModelSelection(')
  const legacyDispatch=section.indexOf('useAppState')
  assert.ok(a>=0 && a<b && b<c && c<legacyDispatch && legacyDispatch<model,
    'Lu rejection must dominate all legacy Jan provider state and model dispatch')
  assert.ok(text.includes('ModelFactory.createModel('),
    'Unbranded Jan provider compatibility must remain')
  const inferred=inferenceSource.replaceAll('\r\n','\n')
  assert.match(inferred,/enabledThreads\[threadId\] === true \|\|\s*useThreads\.getState\(\)\.threads\[threadId\]\?\.model\?\.provider === 'lu-native'/,
    'Persisted Lu-native ownership must survive UI state reset')
  assert.match(inferred,/'lu_inference_native_turn'/,
    'Lu must use host-owned model-native tool execution')
  return {nativeSelected:'host', nativeNotSelected:'rejected_on_Lu', unbrandedJan:'preserved', legacyFallbackOnLu:false}
}

if (process.argv[1]?.endsWith('check-lu-gui-native-failclosed.mjs')) {
  const x=auditLuGuiNativeFailClosed(
    readFileSync('web-app/src/lib/custom-chat-transport.ts','utf8'),
    readFileSync('web-app/src/lib/luInference.ts','utf8')
  )
  console.log('LU_GUI_NATIVE_FAIL_CLOSED_SOURCE_PASS '+JSON.stringify(x))
}
