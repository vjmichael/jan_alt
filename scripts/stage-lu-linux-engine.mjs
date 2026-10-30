// Development-only Linux x86-64 package staging. Never downloads or executes
// model/tool supplied paths; the user builds the pinned llama.cpp source locally.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const PINNED_LLAMA_COMMIT = '7fe450e19305b828c199d602c23a8337aaa1f03b'
export const LINUX_ARCH = 'x86_64-unknown-linux-gnu'
const MAX_COMPONENTS = 48
const COMPONENT = /^lib[A-Za-z0-9._-]+\.so(?:\.[0-9]+(?:\.[0-9]+)*)?$/

export function allowedComponent(name) {
  return name === 'llama-server' || (COMPONENT.test(name) && !name.includes('..'))
}

export function assertLinuxElf(bytes) {
  assert.ok(bytes.length >= 64, 'Engine component is not a complete ELF64 header')
  assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46',
    'Engine component must be ELF')
  assert.equal(bytes[4], 2, 'Engine component must be 64-bit')
  assert.equal(bytes[5], 1, 'Engine component must use little-endian ELF')
  assert.equal(bytes[6], 1, 'Engine component must use ELF version 1')
  assert.ok([2, 3].includes(bytes.readUInt16LE(16)),
    'Engine component must be executable or shared ELF')
  assert.equal(bytes.readUInt16LE(18), 62, 'Engine component must be x86-64')
  assert.equal(bytes.readUInt32LE(20), 1, 'Engine ELF header version is invalid')
  assert.equal(bytes.readUInt16LE(52), 64, 'Engine ELF64 header size is invalid')
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function canonicalSourceFile(root, name) {
  const candidate = path.join(root, name)
  const realRoot = fs.realpathSync(root)
  const realFile = fs.realpathSync(candidate)
  assert.equal(path.dirname(realFile), realRoot,
    'Engine symlink must resolve within its own build directory')
  assert.ok(fs.statSync(realFile).isFile(), 'Engine component must be regular')
  return realFile
}

// A staged executable may claim a pinned source identity only if the build
// directory is owned by that verified source checkout. This cannot prove which
// compiler inputs produced the bytes; SHA-256 pins protect the actual output.
export function assertBuildWithinSource(sourceTree, buildDir) {
  const source = fs.realpathSync(sourceTree)
  const build = fs.realpathSync(buildDir)
  const relative = path.relative(source, build)
  assert.ok(relative && relative !== '..' && !relative.startsWith('../') &&
    !path.isAbsolute(relative), 'Engine build directory must be inside pinned source')
}

export function stageLinuxPackage(buildDir, destDir) {
  assert.ok(fs.statSync(buildDir).isDirectory(), 'Engine build directory missing')
  assert.ok(!fs.existsSync(destDir), 'Refusing to overwrite an existing Lu engine')
  const names = fs.readdirSync(buildDir).filter(allowedComponent).sort()
  assert.ok(names.includes('llama-server'), 'Linux llama-server is missing')
  assert.ok(names.length <= MAX_COMPONENTS, 'Too many packaged engine components')
  const objects = names.map(name => {
    const source = canonicalSourceFile(buildDir, name)
    const bytes = fs.readFileSync(source)
    assertLinuxElf(bytes)
    return { name, bytes, sha256: sha256(bytes) }
  })
  const parent = path.dirname(destDir)
  fs.mkdirSync(parent, { recursive: true })
  const staging = fs.mkdtempSync(path.join(parent, '.lu-linux-engine-'))
  try {
    for (const { name, bytes } of objects) {
      const destination = path.join(staging, name)
      fs.writeFileSync(destination, bytes, {
        flag: 'wx', mode: name === 'llama-server' ? 0o755 : 0o644,
      })
    }
    const manifest = {
      schema: 'lu-inference-package-v1',
      upstreamCommit: PINNED_LLAMA_COMMIT,
      architecture: LINUX_ARCH,
      files: objects.map(({ name, sha256 }) => ({ name, sha256 })),
    }
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    fs.writeFileSync(path.join(staging, 'manifest.json'), manifestBytes, { flag: 'wx' })
    fs.renameSync(staging, destDir)
    return {
      executableSha256: objects.find(item => item.name === 'llama-server').sha256,
      packageSha256: sha256(manifestBytes),
      componentCount: objects.length,
    }
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
  }
}

function assertPinnedSource(sourceTree) {
  const sha = execFileSync('git', ['-C', sourceTree, 'rev-parse', 'HEAD'],
    { encoding: 'utf8' }).trim()
  assert.equal(sha, PINNED_LLAMA_COMMIT, 'llama.cpp source commit is not pinned')
  const dirty = execFileSync('git', ['-C', sourceTree, 'status', '--porcelain',
    '--untracked-files=no'], { encoding: 'utf8' }).trim()
  assert.equal(dirty, '', 'Tracked llama.cpp sources are modified')
}

function main() {
  assert.equal(process.platform, 'linux', 'This staging tool is Linux-only')
  assert.equal(process.arch, 'x64', 'This staging tool requires Linux x86-64')
  assert.equal(process.argv.length, 5,
    'Usage: node scripts/stage-lu-linux-engine.mjs <llama.cpp-source> <build/bin> <Lu-engine-output>')
  const [, , source, build, output] = process.argv
  const resolvedSource = fs.realpathSync(source)
  assertPinnedSource(resolvedSource)
  assertBuildWithinSource(resolvedSource, build)
  const result = stageLinuxPackage(fs.realpathSync(build), path.resolve(output))
  console.log('LU_LINUX_ENGINE_STAGED components=' + result.componentCount)
  console.log('LU_TRUSTED_LLAMA_SERVER_SHA256=' + result.executableSha256)
  console.log('LU_TRUSTED_LLAMA_PACKAGE_SHA256=' + result.packageSha256)
  console.log('Engineering package only; real desktop acceptance is not established.')
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
