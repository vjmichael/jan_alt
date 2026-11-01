// Offline source test for the installed Lu-Windows second-process GUI readback.
// It verifies a test contract only; the installed NSIS model/tool gate still
// needs real Windows UI Automation evidence from a pinned binary.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

export function validateInstalledGuiColdRestore(script) {
  assert.equal(typeof script, 'string')
  for (const required of [
    'function Open-SavedThreadLink',
    'function Has-VisibleRestoredProof',
    '[System.Windows.Automation.ControlType]::Hyperlink',
    '[System.Windows.Automation.ControlType]::Text',
    '$stage = \'cold-process-B\'',
    '$stage = \'cold-persisted-recovery\'',
    '$stage = \'cold-gui-thread-navigation\'',
    '$stage = \'cold-gui-render\'',
    'Open-SavedThreadLink $secondWindow $firstPrompt',
    'Has-VisibleRestoredProof $script:secondWindow $marker',
    'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS',
  ]) assert.ok(script.includes(required), 'Installed GUI cold readback required: ' + required)
  const afterSecond = script.slice(script.indexOf("$stage = 'cold-process-B'"))
  const stages = [
    "$stage = 'cold-process-B'",
    "$stage = 'cold-persisted-recovery'",
    "$stage = 'cold-gui-thread-navigation'",
    "$stage = 'cold-gui-render'",
    "LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS",
    "$state = 'success'",
  ]
  let previous = -1
  for (const stage of stages) {
    const next = afterSecond.indexOf(stage, previous + 1)
    assert(next > previous, 'Readback must be ordered, including completed visible GUI proof: ' + stage)
    previous = next
  }
  const proof = afterSecond.slice(afterSecond.indexOf("$stage = 'cold-gui-render'"),afterSecond.indexOf("$state = 'success'"))
  assert.match(proof, /Await-Condition\s*\{[\s\S]*Has-VisibleRestoredProof[\s\S]*\}\s*60\s*'restored-assistant-displayed'/)
  assert.match(proof, /node --no-warnings \$evidenceScript/)
  assert.match(proof, /\$LASTEXITCODE -ne 0/)
  assert(!proof.includes("lu_inference_native_turn"), 'Restart cannot rerun native tool IPC')
  assert(!proof.includes("lu_inference_load"), 'Restart cannot reload model to fake a restored answer')
  assert(!proof.includes("Type-Ui"), 'Restart proof must not inject a new model prompt')
  return true
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  validateInstalledGuiColdRestore(fs.readFileSync(
    'scripts/lu/run-installed-lu-uia-full.ps1', 'utf8'))
  console.log('LU_GUI_COLD_RESTORED_RENDER_SOURCE_PASS installed_verification=required')
}
