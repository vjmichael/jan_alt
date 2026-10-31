import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { assertLuMainAuthority } from './check-alpha-webview-authority.mjs'
const base = { identifier: 'lu-default', windows: ['main'], permissions: ['core:default', 'store:default'] }
describe('Lu main WebView authority', () => {
  it('accepts a minimal main-only shape', () => assert.equal(assertLuMainAuthority(base), true))
  it('denies remote origins', () => assert.throws(() => assertLuMainAuthority({ ...base, remote: { urls: ['http://*'] } })))
  for (const forbidden of ['agent-tools:allow-workspace-path', 'llamacpp:default', 'shell:allow-spawn', 'shell:allow-open']) {
    it('rejects ' + forbidden, () => assert.throws(() =>
      assertLuMainAuthority({ ...base, permissions: [...base.permissions, forbidden] })))
  }
  it('denies object-shaped shell commands', () => assert.throws(() =>
    assertLuMainAuthority({ ...base, permissions: [...base.permissions, { identifier: 'shell:allow-execute', allow: [] }] })))
  it('denies another window', () => assert.throws(() =>
    assertLuMainAuthority({ ...base, windows: ['main', 'logs'] })))
  it('validates the candidate source file', () => {
    const file = new URL('../../src-tauri/capabilities/lu-default.json', import.meta.url)
    assertLuMainAuthority(JSON.parse(fs.readFileSync(file, 'utf8')))
  })
})
