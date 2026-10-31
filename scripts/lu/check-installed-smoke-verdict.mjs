// Provisional CI installed-product receipt, never automatic alpha approval.
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
export function verify(receipt) {
  assert.ok(receipt && typeof receipt==='object' && !Array.isArray(receipt))
  assert.equal(receipt.schema,'lu-installed-smoke-verdict-v1')
  assert.equal(receipt.alphaAccepted,false)
  assert.ok(['not_verified','blocked_legacy_worker'].includes(receipt.coworkIndependence))
  for(const key of ['installedPackage','nativeModelTool','profileRestart','uninstall']) {
    assert.ok(['PASS','FAIL','NOT_RUN'].includes(receipt[key]),'unknown gate '+key)
  }
  assert.equal(receipt.installedPackage,'PASS')
  // Tool success and uninstall are independent evidence, not release approval.
  if(receipt.nativeModelTool==='PASS') assert.equal(receipt.uninstall,'PASS')
  return {
    package:receipt.installedPackage==='PASS' && receipt.uninstall==='PASS',
    model:receipt.nativeModelTool==='PASS',
    profile:receipt.profileRestart==='PASS',
    alphaAccepted:false,
  }
}
if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  try {
    const data=JSON.parse(readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,''))
    const result=verify(data)
    console.log('LU_INSTALLED_SMOKE_VERDICT package='+result.package+' model='+result.model+' profile='+result.profile+' alphaAccepted=false')
  } catch(error) {
    console.error('Lu installed receipt INVALID: '+String(error?.message ?? 'unknown'))
    process.exitCode=1
  }
}
