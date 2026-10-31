import {describe,it} from 'node:test'
import assert from 'node:assert/strict'
import {verify} from './check-installed-smoke-verdict.mjs'
const b=()=>({schema:'lu-installed-smoke-verdict-v1',alphaAccepted:false,coworkIndependence:'not_verified',
 installedPackage:'PASS',nativeModelTool:'PASS',profileRestart:'PASS',uninstall:'PASS'})
describe('Lu independently classified installed gate results',()=>{
 it('accepts a legitimate provisional result but never alpha approves',()=>assert.equal(verify(b()).alphaAccepted,false))
 it('retains tool failure independently of package success',()=>{const x=b();x.nativeModelTool='FAIL';assert.equal(verify(x).model,false)})
 it('rejects self-promoted alpha verdict',()=>{const x=b();x.alphaAccepted=true;assert.throws(()=>verify(x))})
 it('rejects unsupported Cowork independence claims',()=>{const x=b();x.coworkIndependence='verified';assert.throws(()=>verify(x))})
 it('rejects no installed integrity proof',()=>{const x=b();x.installedPackage='NOT_RUN';assert.throws(()=>verify(x))})
 it('rejects successful tool result with failed uninstall',()=>{const x=b();x.uninstall='FAIL';assert.throws(()=>verify(x))})
})
