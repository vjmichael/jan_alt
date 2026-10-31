import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateInstalledSmokeVerdict } from './check-installed-smoke-verdict.mjs'
const base = () => ({
  schema: 'lu-installed-smoke-verdict-v1',
  installedPackage: 'PASS', nativeModelTool: 'PASS', profileRestart: 'PASS',
  uninstall: 'PASS', coworkIndependence: 'blocked_legacy_worker', alphaAccepted: false,
})
const withChange = change => { const p=base(); change(p); return p }
describe('Lu installed smoke provisional receipt', () => {
  it('returns bounded evidence without authorizing alpha', () => {
    const x=validateInstalledSmokeVerdict(base())
    assert.equal(x.installedProductPassed,true)
    assert.equal(x.realToolTurnPassed,true)
    assert.equal(x.coworkIndependent,false)
    assert.equal(x.alphaAccepted,false)
  })
  it('distinguishes tool failure from clean install/uninstall', () => {
    const x=validateInstalledSmokeVerdict(withChange(p=>p.nativeModelTool='FAIL'))
    assert.equal(x.installedProductPassed,true)
    assert.equal(x.realToolTurnPassed,false)
  })
  it('keeps an unexecuted model gate as not passed', () => {
    const x=validateInstalledSmokeVerdict(withChange(p=>p.nativeModelTool='NOT_RUN'))
    assert.equal(x.realToolTurnPassed,false)
  })
  it('will not pass tool gate if uninstall failed', () =>
    assert.throws(()=>validateInstalledSmokeVerdict(withChange(p=>p.uninstall='FAIL'))))
  it('will not claim production alpha', () =>
    assert.throws(()=>validateInstalledSmokeVerdict(withChange(p=>p.alphaAccepted=true))))
  it('will not certify Cowork independently', () =>
    assert.throws(()=>validateInstalledSmokeVerdict(withChange(p=>p.coworkIndependence='verified'))))
  it('requires completed installed package inventory', () =>
    assert.throws(()=>validateInstalledSmokeVerdict(withChange(p=>p.installedPackage='NOT_RUN'))))
  it('rejects malformed state', () =>
    assert.throws(()=>validateInstalledSmokeVerdict(withChange(p=>p.profileRestart='success'))))
  it('rejects arbitrary non-object receipt',()=>assert.throws(()=>validateInstalledSmokeVerdict([])))
})
