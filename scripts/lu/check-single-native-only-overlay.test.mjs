import test from 'node:test'
import assert from 'node:assert/strict'
import { validateSingleNativeOnlyOverlay } from './check-single-native-only-overlay.mjs'

const fixture = `name: native-only
      - name: Source regression
        run: |
          node --test scripts/lu/prepare-native-only-windows-overlay.test.mjs
      - name: Disposable rewrite
        shell: pwsh
        env:
          LU_DISPOSABLE_BUILD: '1'
        run: |
          node scripts/lu/prepare-native-only-windows-overlay.mjs
      - name: Build NSIS
        run: yarn tauri build --target x86_64-pc-windows-msvc --features lu-distribution
      - name: Installed GUI
        run: ./scripts/lu/run-installed-lu-gui-tool.ps1 -ExpectedInstallerSha256 $sha
`

test('accepts one guarded rewrite before NSIS and same-digest GUI check', () => {
  assert.equal(validateSingleNativeOnlyOverlay(fixture), true)
})
test('rejects repeated destructive overlay', () => {
  const duplicate = fixture.replace('      - name: Build NSIS', `      - name: Repeat rewrite
        env:
          LU_DISPOSABLE_BUILD: '1'
        run: |
          node scripts/lu/prepare-native-only-windows-overlay.mjs
      - name: Build NSIS`)
  assert.throws(() => validateSingleNativeOnlyOverlay(duplicate), /exactly once/)
})
test('rejects a missing overlay', () => {
  assert.throws(() => validateSingleNativeOnlyOverlay(fixture.replace('node scripts/lu/prepare-native-only-windows-overlay.mjs', 'echo skipped')), /exactly once/)
})
test('rejects missing source test', () => {
  assert.throws(() => validateSingleNativeOnlyOverlay(fixture.replace('node --test scripts/lu/prepare-native-only-windows-overlay.test.mjs', 'echo skipped')), /source tests/)
})
test('rejects non-disposable rewrite', () => {
  assert.throws(() => validateSingleNativeOnlyOverlay(fixture.replace("LU_DISPOSABLE_BUILD: '1'", 'LU_DISPOSABLE_BUILD: false')), /disposable/)
})
test('rejects rewriting after packaging', () => {
  const reordered = fixture.replace('      - name: Build NSIS\n        run: yarn tauri build --target x86_64-pc-windows-msvc --features lu-distribution', '')
    .replace('      - name: Disposable rewrite', '      - name: Build NSIS\n        run: yarn tauri build --target x86_64-pc-windows-msvc --features lu-distribution\n      - name: Disposable rewrite')
  assert.throws(() => validateSingleNativeOnlyOverlay(reordered), /before Windows NSIS/)
})
test('rejects missing installed GUI or fresh installer digest', () => {
  assert.throws(() => validateSingleNativeOnlyOverlay(fixture.replace('run-installed-lu-gui-tool.ps1', 'run-headless-only.ps1')), /GUI acceptance/)
  assert.throws(() => validateSingleNativeOnlyOverlay(fixture.replace('-ExpectedInstallerSha256 $sha', '-ExpectedInstallerSha256 $oldSha')), /newly built/)
})
