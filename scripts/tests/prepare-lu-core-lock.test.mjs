import assert from 'node:assert/strict'
import { test } from 'node:test'
import { standaloneCoreLock, assertCoreLockUsesParentPins } from '../prepare-lu-core-lock.mjs'

const a = 'a'.repeat(64)
const b = 'b'.repeat(64)
const base = (refs = '"serde"') => [
  '# Cargo generated',
  'version = 4', '',
  '[[package]]', 'name = "lu-core"', 'version = "0.1.0"',
  'dependencies = [', ' ' + refs + ',', ']', '',
  '[[package]]', 'name = "serde"', 'version = "1.0.0"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  'checksum = "' + a + '"', 'dependencies = [', ' "serde_derive",', ']', '',
  '[[package]]', 'name = "serde_derive"', 'version = "1.0.0"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  'checksum = "' + b + '"', '',
  '[[package]]', 'name = "unused"', 'version = "0.0.1"',
  'source = "registry+https://github.com/rust-lang/crates.io-index"',
  'checksum = "' + b + '"', '',
].join('\n')
const manifest = [
  '[package]', 'name = "lu-core"', '',
  '[dependencies]', 'serde = { version = "1", features = ["derive"] }', '',
].join('\n')

test('standalone Lu lock includes complete closure without unrelated crates', () => {
  const result = standaloneCoreLock(base(), manifest)
  assert.equal(result.packageCount, 3)
  assert.deepEqual(result.direct, ['serde'])
  assert.match(result.lock, /name = "serde_derive"/)
  assert.doesNotMatch(result.lock, /name = "unused"/)
  assert.match(result.lock, /version = 4/)
})

test('rejects direct manifest drift from parent pinned dependencies', () => {
  assert.throws(() => standaloneCoreLock(base(),
    manifest + '\n[build-dependencies]\nprost = "0.14"\n'),
  /missing a direct Lu dependency/)
})

test('rejects registry crates with missing checksums', () => {
  assert.throws(() => standaloneCoreLock(base().replace('checksum = "' + a + '"', ''),
    manifest), /missing SHA256 checksum/)
})

test('rejects missing transitive dependency', () => {
  assert.throws(() => standaloneCoreLock(base('"serde",\n "unpublished"'),
    manifest), /Missing or ambiguous/)
})

test('refuses non-v4 parent lock format', () => {
  assert.throws(() => standaloneCoreLock(base().replace('version = 4', 'version = 3'),
    manifest), /Cargo v4/)
})

test('accepts Cargo-pruned canonical lock without relaxing checksum pins', () => {
  const full = standaloneCoreLock(base(), manifest).lock
  const canonical = full.replace('dependencies = [\n "serde_derive",\n]', '')
    .replace(/\n\[\[package\]\]\nname = "serde_derive"\nversion = "1\.0\.0"\nsource = "registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index"\nchecksum = "[a-f0-9]{64}"\n/, '')
  assert.equal(assertCoreLockUsesParentPins(base(), manifest, canonical).packageCount, 2)
})

test('refuses a checksum drift in an otherwise pinned core lock', () => {
  const full = standaloneCoreLock(base(), manifest).lock
  assert.throws(() => assertCoreLockUsesParentPins(base(), manifest,
    full.replace('checksum = "' + a + '"', 'checksum = "' + b + '"')),
  /Checksum pin mismatch/)
})

test('refuses removed dependency entries with dangling canonical edges', () => {
  const full = standaloneCoreLock(base(), manifest).lock
  const missing = full.replace(/\n\[\[package\]\]\nname = "serde_derive"\nversion = "1\.0\.0"\nsource = "registry\+https:\/\/github\.com\/rust-lang\/crates\.io-index"\nchecksum = "[a-f0-9]{64}"\n/, '')
  assert.throws(() => assertCoreLockUsesParentPins(base(), manifest, missing),
    /Ambiguous or missing canonical lock ref/)
})

test('refuses introducing a package not in the parent-pinned closure', () => {
  const full = standaloneCoreLock(base(), manifest).lock
  const added = full + '\n[[package]]\nname = "rogue"\nversion = "1.0.0"\n'
  assert.throws(() => assertCoreLockUsesParentPins(base(), manifest, added),
    /Unpinned package or version/)
})
