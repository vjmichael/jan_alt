import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('../build-lu-linux-local.sh', import.meta.url))
const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8' })

test('offline Linux build helper has valid Bash syntax', () => {
  const r = spawnSync('bash', ['-n', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})
test('preflight reports that no build or GitHub Actions was attempted', () => {
  const r = run('--preflight')
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /LU_LINUX_PREFLIGHT_COMPLETE build=not_attempted actions=0/)
})
test('unsupported build modes fail closed', () => {
  const r = run('--unsafe-build')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /Usage:/)
})
