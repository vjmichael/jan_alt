import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import {
  stageLinuxPackage, allowedComponent, assertLinuxElf, assertBuildWithinSource, PINNED_LLAMA_COMMIT,
  LINUX_ARCH,
} from '../stage-lu-linux-engine.mjs'

function elf() {
  const bytes = Buffer.alloc(64)
  bytes.writeUInt32BE(0x7f454c46, 0)
  bytes[4] = 2
  bytes[5] = 1
  bytes[6] = 1
  bytes.writeUInt16LE(3, 16)
  bytes.writeUInt16LE(62, 18)
  bytes.writeUInt32LE(1, 20)
  bytes.writeUInt16LE(64, 52)
  return bytes
}
function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-linux-engine-fixture-'))
  try {
    const build = path.join(root, 'build')
    fs.mkdirSync(build)
    fs.writeFileSync(path.join(build, 'llama-server'), elf(), { mode: 0o755 })
    return run(root, build)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}
function sha(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

test('Linux package includes regular executable and exact SHA pins', () => {
  fixture((root, build) => {
    fs.writeFileSync(path.join(build, 'libggml.so.0'), elf())
    fs.symlinkSync('libggml.so.0', path.join(build, 'libggml.so'))
    const target = path.join(root, 'package')
    const result = stageLinuxPackage(build, target)
    const manifestBytes = fs.readFileSync(path.join(target, 'manifest.json'))
    const manifest = JSON.parse(manifestBytes)
    assert.equal(manifest.schema, 'lu-inference-package-v1')
    assert.equal(manifest.upstreamCommit, PINNED_LLAMA_COMMIT)
    assert.equal(manifest.architecture, LINUX_ARCH)
    assert.equal(result.packageSha256, sha(manifestBytes))
    assert.equal(result.executableSha256, sha(fs.readFileSync(path.join(target, 'llama-server'))))
    assert.equal(result.componentCount, 3)
    for (const item of manifest.files) {
      assert.equal(fs.lstatSync(path.join(target, item.name)).isFile(), true)
      assert.equal(sha(fs.readFileSync(path.join(target, item.name))), item.sha256)
    }
    assert.throws(() => stageLinuxPackage(build, target), /overwrite/)
  })
})

test('rejects unexpected library names and non-ELF platform formats', () => {
  assert.equal(allowedComponent('libggml.so.1.2'), true)
  assert.equal(allowedComponent('libggml.so'), true)
  for (const name of ['llama-server.exe', '../libfoo.so', 'libfoo.so.old',
    'libfoo.so.0/../hack', 'libfoo.dll', 'notes.txt']) {
    assert.equal(allowedComponent(name), false, name)
  }
  assert.throws(() => assertLinuxElf(Buffer.from('MZ-header')), /ELF/)
  const missingType = elf()
  missingType.writeUInt16LE(0, 16)
  assert.throws(() => assertLinuxElf(missingType), /executable or shared/)
  const shortElf = elf().subarray(0, 20)
  assert.throws(() => assertLinuxElf(shortElf), /complete ELF64 header/)
  const wrongArch = elf()
  wrongArch.writeUInt16LE(183, 18)
  assert.throws(() => assertLinuxElf(wrongArch), /x86-64/)
})

test('refuses out-of-package symlinks and leaves no completed package', () => {
  fixture((root, build) => {
    fs.writeFileSync(path.join(root, 'foreign.so'), elf())
    fs.symlinkSync(path.join(root, 'foreign.so'), path.join(build, 'libforeign.so'))
    const target = path.join(root, 'untrusted-package')
    assert.throws(() => stageLinuxPackage(build, target), /within its own build directory/)
    assert.equal(fs.existsSync(target), false)
  })
})

test('rejects an invalid executable before writing a package', () => {
  fixture((root, build) => {
    fs.writeFileSync(path.join(build, 'llama-server'), Buffer.from('MZ'))
    const target = path.join(root, 'bad-package')
    assert.throws(() => stageLinuxPackage(build, target), /ELF/)
    assert.equal(fs.existsSync(target), false)
  })
})

test('pinned source build must not escape its own checkout', () => {
  fixture((root, build) => {
    const nested = path.join(build, 'obj')
    fs.mkdirSync(nested)
    assert.doesNotThrow(() => assertBuildWithinSource(root, nested))
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-foreign-build-'))
    try {
      assert.throws(() => assertBuildWithinSource(root, foreign), /inside pinned source/)
      assert.throws(() => assertBuildWithinSource(root, root), /inside pinned source/)
      const alias = path.join(build, 'escape')
      fs.symlinkSync(foreign, alias)
      assert.throws(() => assertBuildWithinSource(root, alias), /inside pinned source/)
    } finally {
      fs.rmSync(foreign, { recursive: true, force: true })
    }
  })
})

test('oversized sparse executable fails before staging or memory allocation', () => {
  fixture((root, build) => {
    const file = path.join(build, 'llama-server')
    fs.truncateSync(file, 512 * 1024 * 1024 + 1)
    const target = path.join(root, 'large-package')
    assert.throws(() => stageLinuxPackage(build, target), /size or ELF header limit/)
    assert.equal(fs.existsSync(target), false)
  })
})

test('staging hashes the exact copied ELF bytes, not a mutable source file', () => {
  fixture((root, build) => {
    const target = path.join(root, 'copy')
    const result = stageLinuxPackage(build, target)
    const actual = fs.readFileSync(path.join(target, 'llama-server'))
    const source = path.join(build, 'llama-server')
    fs.appendFileSync(source, Buffer.from('source changed after copying'))
    assert.equal(sha(actual), result.executableSha256)
    assert.notEqual(sha(fs.readFileSync(source)), result.executableSha256)
  })
})
