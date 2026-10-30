// Run only in a disposable checkout. Keeps Jan's committed Cargo.toml unchanged
// until the operator explicitly invokes --prepare for a Linux Lu preview.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { PINNED_LLAMA_COMMIT, LINUX_ARCH, allowedComponent, assertLinuxElf }
  from './stage-lu-linux-engine.mjs'

const mode = process.argv[2] ?? '--check'
assert.ok(mode === '--check' || mode === '--prepare',
  'Use --check (no changes) or --prepare (disposable checkout only)')
const base = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.conf.json', 'utf8'))
const overlay = JSON.parse(fs.readFileSync('src-tauri/tauri.lu.linux.conf.json', 'utf8'))
assert.equal(base.identifier, 'ai.lu.preview')
assert.equal(overlay.identifier, base.identifier)
assert.equal(overlay.productName, 'Lu')
assert.equal(overlay.mainBinaryName, 'Lu-Desktop')
assert.deepEqual(overlay.bundle.targets, ['deb'])
assert.ok(overlay.bundle.icon.every(icon => icon.startsWith('icons/lu/') &&
  icon.endsWith('.png')))
assert.ok(!JSON.stringify(overlay.app.windows).includes('mica'),
  'Linux window must not request Windows-only visual effects')
assert.deepEqual(overlay.plugins?.updater?.endpoints ?? [], [])

const cargoPath = 'src-tauri/Cargo.toml'
const cargo = fs.readFileSync(cargoPath, 'utf8')
const replacements = [
  ['default-run = "Jan-Desktop"', 'default-run = "Lu-Desktop"'],
  ['name = "Jan-Desktop"', 'name = "Lu-Desktop"'],
]
assert.match(cargo, /lu-distribution = \["lu-foundation", "tauri-plugin-agent-tools\/lu-distribution"\]/)
let patched = cargo
for (const [oldText, newText] of replacements) {
  assert.equal(patched.split(oldText).length - 1, 1,
    'Expected exactly one original Cargo binary setting: ' + oldText)
  patched = patched.replace(oldText, newText)
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}
function verifyStagedEngine() {
  const folder = 'src-tauri/resources/lu-inference'
  const manifestPath = path.join(folder, 'manifest.json')
  const raw = fs.readFileSync(manifestPath)
  const manifest = JSON.parse(raw.toString('utf8'))
  assert.equal(manifest.schema, 'lu-inference-package-v1')
  assert.equal(manifest.upstreamCommit, PINNED_LLAMA_COMMIT)
  assert.equal(manifest.architecture, LINUX_ARCH)
  assert.ok(Array.isArray(manifest.files) &&
    manifest.files.length > 0 && manifest.files.length <= 48)
  const expected = new Set(['manifest.json'])
  for (const entry of manifest.files) {
    assert.ok(allowedComponent(entry.name), 'Unapproved engine component')
    assert.ok(!expected.has(entry.name), 'Duplicate engine component')
    expected.add(entry.name)
    const candidate = path.join(folder, entry.name)
    assert.ok(fs.lstatSync(candidate).isFile(), 'Staged engine must not contain symlinks')
    const bytes = fs.readFileSync(candidate)
    assertLinuxElf(bytes)
    assert.equal(digest(bytes), entry.sha256, 'Engine component hash differs')
  }
  assert.ok(expected.has('llama-server'))
  assert.deepEqual(fs.readdirSync(folder).sort(), [...expected].sort(),
    'Engine package contains unmanifested files')
  assert.equal(digest(fs.readFileSync(path.join(folder, 'llama-server'))),
    process.env.LU_TRUSTED_LLAMA_SERVER_SHA256,
    'Compiled server SHA256 environment pin does not match')
  assert.equal(digest(raw), process.env.LU_TRUSTED_LLAMA_PACKAGE_SHA256,
    'Compiled package SHA256 environment pin does not match')
}
if (mode === '--check') {
  console.log('LU_LINUX_CONFIG_CHECK_PASS mode=read-only network=unused')
} else {
  assert.equal(process.platform, 'linux', 'Linux packaging requires Linux')
  assert.equal(process.arch, 'x64', 'Linux packaging requires x86-64')
  verifyStagedEngine()
  // Converting SVGs must succeed before the Cargo manifest is changed.
  const result = spawnSync('yarn',
    ['tauri', 'icon', 'src-tauri/icons/lu-icon.svg', '--output', 'src-tauri/icons/lu'],
    { stdio: 'inherit', env: { ...process.env, YARN_ENABLE_NETWORK: '0' } })
  if (result.error || result.status !== 0) {
    throw new Error('Lu Linux icon generation failed: ' + (result.error?.message ?? result.status))
  }
  fs.writeFileSync(cargoPath, patched)
  console.log('LU_LINUX_PREPARE_PASS target=deb network=disabled (not runtime acceptance)')
}
