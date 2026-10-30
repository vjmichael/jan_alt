import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('../build-lu-linux-llama-local.sh', import.meta.url))
const run = (...args) => spawnSync('bash', [script, ...args], { encoding: 'utf8' })

test('pinned local llama.cpp build helper has valid Bash syntax', () => {
  const r = spawnSync('bash', ['-n', script], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
})

test('refuses build without an exact pinned Git source checkout', () => {
  const r = run('--build', '/nonexistent-lu-llama-source')
  assert.equal(r.status, 3)
  assert.match(r.stderr, /source_directory_missing/)
})

test('refuses invalid modes before running any build command', () => {
  const r = run('--install', '/nonexistent-lu-llama-source')
  assert.equal(r.status, 2)
  assert.match(r.stderr, /Usage:/)
})

test('rejects a foreign Git checkout without modifying it', () => {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-foreign-llama-'))
  try {
    const r = spawnSync('git', ['init', '-q', folder], { encoding: 'utf8' })
    assert.equal(r.status, 0, r.stderr)
    const b = run('--check', folder)
    assert.equal(b.status, 3)
    assert.match(b.stderr, /upstream_commit_mismatch/)
    assert.equal(fs.existsSync(path.join(folder, 'build')), false)
  } finally {
    fs.rmSync(folder, { recursive: true, force: true })
  }
})
