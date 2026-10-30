import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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

test('preflight does not create a build directory in an isolated checkout', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-preflight-clean-'))
  try {
    const scripts = path.join(root, 'scripts')
    fs.mkdirSync(scripts)
    fs.copyFileSync(script, path.join(scripts, 'build-lu-linux-local.sh'))
    fs.copyFileSync(fileURLToPath(new URL('../check-lu-linux-env.mjs', import.meta.url)),
      path.join(scripts, 'check-lu-linux-env.mjs'))
    const r = spawnSync('bash', [path.join(scripts, 'build-lu-linux-local.sh'), '--preflight'], {
      cwd: root, encoding: 'utf8',
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /LU_LINUX_PREFLIGHT_COMPLETE/)
    assert.equal(fs.existsSync(path.join(root, 'src-tauri', 'target')), false)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('desktop missing arguments fail before prerequisites or filesystem writes', () => {
  const r = run('--desktop')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid_argument_count/)
})

test('preflight rejects unexpected extra arguments', () => {
  const r = run('--preflight', '--desktop')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /invalid_argument_count/)
})
