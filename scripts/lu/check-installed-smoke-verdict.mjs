// Validate shape of a provisional Lu Windows installed-smoke receipt.
// This is not independent release attestation: the test runner writes it.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const valid = new Set(['PASS', 'FAIL', 'NOT_RUN'])
export function validateInstalledSmokeVerdict(receipt) {
  assert.ok(receipt && typeof receipt === 'object' && !Array.isArray(receipt), 'receipt object required')
  assert.equal(receipt.schema, 'lu-installed-smoke-verdict-v1')
  assert.equal(receipt.alphaAccepted, false, 'smoke evidence cannot certify Lu alpha')
  assert.ok(['blocked_legacy_worker', 'not_verified'].includes(receipt.coworkIndependence),
    'Cowork independence not attested')
  for (const key of ['installedPackage', 'nativeModelTool', 'profileRestart', 'uninstall']) {
    assert.ok(valid.has(receipt[key]), 'invalid ' + key)
  }
  assert.equal(receipt.installedPackage, 'PASS',
    'receipt issued only after installed engine integrity passes')
  if (receipt.nativeModelTool === 'PASS') {
    assert.equal(receipt.uninstall, 'PASS', 'an incomplete uninstall is not a clean gate')
  }
  return Object.freeze({
    installedProductPassed: receipt.installedPackage === 'PASS' && receipt.uninstall === 'PASS',
    realToolTurnPassed: receipt.nativeModelTool === 'PASS',
    profileRestartPassed: receipt.profileRestart === 'PASS',
    coworkIndependent: false,
    alphaAccepted: false,
  })
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const receipt = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^\uFEFF/, ''))
    const result = validateInstalledSmokeVerdict(receipt)
    console.log('LU_INSTALLED_SMOKE_VERDICT package=' +
      (result.installedProductPassed ? 'PASS' : 'FAIL') +
      ' realTool=' + (result.realToolTurnPassed ? 'PASS' : receipt.nativeModelTool) +
      ' profile=' + receipt.profileRestart + ' alphaAccepted=false')
  } catch (err) {
    console.error('Lu installed smoke receipt invalid: ' +
      (err instanceof Error ? err.message : 'unknown'))
    process.exitCode = 1
  }
}
