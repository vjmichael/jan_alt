// LU-WIN-6G: enforce one native-only Windows target overlay application.
// This validates the build script, NOT the installed Windows product.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function validateSingleNativeOnlyOverlay(workflow) {
  assert.equal(typeof workflow, 'string')
  const occurrences = [...workflow.matchAll(/^\s*node scripts\/lu\/prepare-native-only-windows-overlay\.mjs\s*$/gm)]
  assert.equal(occurrences.length, 1,
    'The disposable Windows native-only platform overlay must be applied exactly once')
  const prepare = occurrences[0].index
  const sourceTest = workflow.indexOf('prepare-native-only-windows-overlay.test.mjs')
  const packageBuild = workflow.indexOf('yarn tauri build --target x86_64-pc-windows-msvc')
  assert(sourceTest >= 0 && sourceTest < prepare,
    'The native-only overlay source tests must run before the configuration is mutated')
  assert(packageBuild > prepare,
    'The native-only platform overlay must be applied before Windows NSIS packaging')
  const stepStart = workflow.lastIndexOf('      - name:', prepare)
  assert(stepStart >= 0, 'Overlay invocation must belong to a named CI step')
  const step = workflow.slice(stepStart, prepare)
  assert.match(step, /LU_DISPOSABLE_BUILD:\s*'1'/,
    'Overlay must only run in an explicitly disposable Windows checkout')
  assert.match(workflow, /run-installed-lu-gui-tool\.ps1/,
    'A native-only NSIS build must retain installed GUI acceptance checks')
  assert.match(workflow, /-ExpectedInstallerSha256\s+\$sha/,
    'Installed GUI acceptance must use the newly built installer digest')
  return true
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const path = process.argv[2] ?? '.github/workflows/lu-windows-native-only-installer.yml'
  validateSingleNativeOnlyOverlay(readFileSync(path, 'utf8'))
  console.log('LU_WIN6_SINGLE_DISPOSABLE_OVERLAY_SOURCE_PASS installed_product=unverified')
}
