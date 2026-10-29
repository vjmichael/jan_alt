import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseLuSavedTurnRows } from './lu-saved-turns.js'

test('W02 parses actual JSONL records separated by LF and CRLF', () => {
  const rows = parseLuSavedTurnRows('{"id":"user-1","role":"user"}\r\n{"id":"reply-1","role":"assistant"}\n')
  assert.deepEqual(rows, [
    { id: 'user-1', role: 'user' }, { id: 'reply-1', role: 'assistant' },
  ])
})
test('W02 ignores whitespace-only lines, not arbitrary concatenated JSON', () => {
  assert.equal(parseLuSavedTurnRows('\n  \r\n').length, 0)
  assert.throws(() => parseLuSavedTurnRows('{"role":"user"}{"role":"assistant"}'), /Invalid saved-turn JSONL/)
})
test('W02 rejects malformed JSON and non-object or invalid fields', () => {
  for (const bad of ['{"id":', '[]', 'null', '{"id":7,"role":"user"}', '{"id":"x","role":true}']) {
    assert.throws(() => parseLuSavedTurnRows(bad))
  }
})
test('W05 stays runner-confined and uses no read-only PowerShell HOME variable', () => {
  const script = readFileSync(new URL('../../scripts/check-lu-windows-profile-restart.ps1', import.meta.url), 'utf8')
  assert.doesNotMatch(script, /\$home\b/i)
  for (const guard of ['GITHUB_ACTIONS', 'RUNNER_TEMP', 'Assert-Canaries', 'profileHome']) {
    assert.ok(script.includes(guard), `Missing W05 isolation guard: ${guard}`)
  }
})
