// Extract Lu's dependency closure from the *tracked* parent Cargo.lock.
// This is a source-only aid for a standalone, offline Linux cargo test.
// The generated lock must still pass real Cargo --locked verification.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

function directManifestDependencies(manifest) {
  const deps = new Set()
  let section = ''
  for (const line of manifest.split(/\r?\n/)) {
    const heading = line.match(/^\s*\[([^\]]+)\]\s*$/)
    if (heading) {
      section = heading[1]
      continue
    }
    const entry = line.match(/^\s*([A-Za-z0-9_-]+)\s*=/)
    if (entry && ['dependencies', 'build-dependencies', 'dev-dependencies'].includes(section)) {
      deps.add(entry[1])
    }
  }
  return [...deps].sort()
}

export function standaloneCoreLock(parentLock, coreManifest) {
  const parts = parentLock.split(/\n(?=\[\[package\]\])/)
  assert.match(parts[0], /\bversion = 4\b/, 'Expected a Cargo v4 parent lockfile')
  const blocks = parts.slice(1)
  const packages = blocks.map((block, index) => {
    const name = block.match(/^name = "([^"]+)"$/m)?.[1]
    const version = block.match(/^version = "([^"]+)"$/m)?.[1]
    assert.ok(name && version, 'Invalid package in parent lockfile')
    const depLines = block.match(/^dependencies = \[\r?\n([\s\S]*?)^\]$/m)?.[1] ?? ''
    const refs = [...depLines.matchAll(/^\s*"([^"]+)"[,]?\r?$/gm)].map(match => match[1])
    return { block: block.trim(), index, name, version, refs }
  })
  const named = new Map()
  const keyed = new Map()
  for (const pkg of packages) {
    const key = pkg.name + ' ' + pkg.version
    assert.ok(!keyed.has(key), 'Duplicate lockfile package identity')
    keyed.set(key, pkg)
    const values = named.get(pkg.name) ?? []
    values.push(pkg)
    named.set(pkg.name, values)
  }
  const roots = named.get('lu-core') ?? []
  assert.equal(roots.length, 1, 'Parent lock must contain exactly one Lu core')
  const direct = directManifestDependencies(coreManifest)
  assert.ok(direct.length > 0, 'Missing Lu core manifest dependencies')
  for (const name of direct) {
    assert.ok(roots[0].refs.some(ref => ref === name || ref.startsWith(name + ' ')),
      'Committed parent lock is missing a direct Lu dependency: ' + name)
  }
  const selected = new Set()
  const queue = [roots[0]]
  while (queue.length) {
    const pkg = queue.pop()
    if (selected.has(pkg.index)) continue
    selected.add(pkg.index)
    for (const dependency of pkg.refs) {
      let next = keyed.get(dependency)
      if (!next) {
        const options = named.get(dependency) ?? []
        assert.equal(options.length, 1,
          'Missing or ambiguous dependency in parent lock: ' + dependency)
        next = options[0]
      }
      queue.push(next)
    }
    if (pkg.block.includes('source = "registry+')) {
      assert.match(pkg.block, /^checksum = "[a-f0-9]{64}"$/m,
        'Registry dependency missing SHA256 checksum: ' + pkg.name)
    }
  }
  const chosen = packages.filter(pkg => selected.has(pkg.index))
  const lock = [
    '# Generated from the tracked src-tauri/Cargo.lock for standalone Lu core.',
    '# Must pass cargo test --locked --offline before it counts as build evidence.',
    'version = 4',
    '',
    ...chosen.flatMap(pkg => [pkg.block, '']),
  ].join('\n')
  return { lock, packageCount: chosen.length, direct }
}

function main() {
  const mode = process.argv[2] ?? '--check'
  assert.ok(mode === '--check' || mode === '--write',
    'Usage: node scripts/prepare-lu-core-lock.mjs [--check|--write]')
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  const parent = fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8')
  const manifest = fs.readFileSync(path.join(root, 'src-tauri/lu-core/Cargo.toml'), 'utf8')
  const result = standaloneCoreLock(parent, manifest)
  const target = path.join(root, 'src-tauri/lu-core/Cargo.lock')
  if (mode === '--write') {
    // Target is intentionally git-ignored in the development checkout.
    fs.writeFileSync(target, result.lock, { flag: 'wx' })
  } else if (fs.existsSync(target)) {
    assert.equal(fs.readFileSync(target, 'utf8'), result.lock,
      'Standalone Lu lock differs from the pinned parent closure')
  }
  console.log('LU_CORE_LOCK_' + (mode === '--write' ? 'STAGED' : 'CHECK_PASS') +
    ' packages=' + result.packageCount + ' direct=' + result.direct.length +
    ' action_minutes=0 rust_build=not_run')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
