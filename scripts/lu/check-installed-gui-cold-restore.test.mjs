import test from 'node:test'
import assert from 'node:assert/strict'
import { validateInstalledGuiColdRestore } from './check-installed-gui-cold-restore.mjs'
const valid = "function Open-SavedThreadLink() { [System.Windows.Automation.ControlType]::Hyperlink }\nfunction Has-VisibleRestoredProof() { [System.Windows.Automation.ControlType]::Text }\n$stage = 'cold-process-B'\n$stage = 'cold-persisted-recovery'\n$stage = 'cold-gui-thread-navigation'\nOpen-SavedThreadLink $secondWindow $firstPrompt\n$stage = 'cold-gui-render'\nAwait-Condition {\n    Has-VisibleRestoredProof $script:secondWindow $marker\n} 60 'restored-assistant-displayed'\n& node --no-warnings $evidenceScript $ProfileRoot $threadId $marker $toolPrompt *> $null\nif ($LASTEXITCODE -ne 0) { throw 'Mismatch' }\nWrite-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'\n$state = 'success'\n"
test('accepts disk check plus actual second-process UIA rendered answer', () => {
  assert.equal(validateInstalledGuiColdRestore(valid), true)
})
test('refuses disk-only cold process test', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS","LU_INSTALLED_UIA_COLD_STORAGE_PASS")))
})
test('refuses absent saved-thread navigation', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("Open-SavedThreadLink $secondWindow $firstPrompt", "Write-Host simulated")))
})
test('refuses a fake visible-proof probe', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("Has-VisibleRestoredProof $script:secondWindow $marker", "$true")))
})
test('refuses a pre-restart rendered result', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("$stage = 'cold-process-B'","$stage = 'cold-process-B'\nWrite-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'").replace("Write-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'\n$state = 'success'","$state = 'success'")))
})
test('refuses model re-generation after restart', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("Write-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'", "lu_inference_native_turn\nWrite-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'")))
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace("Write-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'", "Type-Ui $editor newPrompt\nWrite-Host 'LU_INSTALLED_UIA_COLD_GUI_RENDER_PASS'")))
})
test('refuses missing post-render durable evidence', () => {
  assert.throws(() => validateInstalledGuiColdRestore(valid.replace('node --no-warnings $evidenceScript','echo skipped')))
})
