/** Validate an actual Lu Windows NSIS file against its build manifest and checksum.
 * Does not manufacture installed-desktop evidence or certify release gates. */
import { createHash } from 'node:crypto'
import { readFileSync, lstatSync, readdirSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const sha = /^[0-9a-f]{64}$/
const commit = /^[0-9a-f]{40}$/
function fail(message) { throw new Error('Lu installer provenance: ' + message) }
export function verifyLuInstaller({ manifest, installerName, installerBytes, checksumText, expectedCommit }) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) fail('invalid manifest')
  const fields = {
    application: 'Lu', identity: 'ai.lu.preview',
    architecture: 'x86_64-pc-windows-msvc', installerType: 'nsis',
    engineVariant: 'vulkan', luNativeInference: 'cpu-llama-server',
  }
  for (const [key, value] of Object.entries(fields)) {
    if (manifest[key] !== value) fail('unexpected ' + key)
  }
  if (manifest.signedInstaller !== false) fail('unsigned preview declaration mismatch')
  if (typeof expectedCommit !== 'string' || !commit.test(expectedCommit) ||
      manifest.gitCommit !== expectedCommit) fail('source commit mismatch')
  if (typeof installerName !== 'string' ||
      !/^[A-Za-z0-9_ .()+-]+\.exe$/.test(installerName) ||
      manifest.installerFile !== installerName) fail('installer file mismatch')
  if (typeof manifest.installerSha256 !== 'string' || !sha.test(manifest.installerSha256) ||
      typeof manifest.luEngineSha256 !== 'string' || !sha.test(manifest.luEngineSha256) ||
      typeof manifest.luPackageManifestSha256 !== 'string' || !sha.test(manifest.luPackageManifestSha256)) {
    fail('missing or malformed digest')
  }
  const digest = createHash('sha256').update(installerBytes).digest('hex')
  if (digest !== manifest.installerSha256) fail('binary hash differs from manifest')
  const checksum = /^([0-9a-f]{64})  ([^\r\n]+)\r?\n?$/.exec(checksumText)
  if (!checksum || checksum[1] !== digest || checksum[2] !== installerName) {
    fail('checksum sidecar differs from installer')
  }
  return {
    schema: 'lu.alpha01.installer.provenance.v1',
    sourceCommit: expectedCommit,
    installerFile: installerName,
    installerSha256: digest,
    engineSha256: manifest.luEngineSha256,
    engineManifestSha256: manifest.luPackageManifestSha256,
    installedWindowsAcceptance: 'unverified',
  }
}
export function verifyLuInstallerPaths({ manifestPath, installerPath, checksumPath, expectedCommit }) {
  for (const path of [manifestPath, installerPath, checksumPath]) {
    if (!lstatSync(path).isFile()) fail('input must be a regular file')
  }
  const folder = dirname(installerPath)
  if (readdirSync(folder).filter(name => /\.exe$/i.test(name)).length !== 1) {
    fail('exactly one installer executable is required')
  }
  return verifyLuInstaller({
    manifest: JSON.parse(readFileSync(manifestPath, 'utf8')),
    installerName: basename(installerPath),
    installerBytes: readFileSync(installerPath),
    checksumText: readFileSync(checksumPath, 'utf8').replace(/^\uFEFF/, ''),
    expectedCommit,
  })
}
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (invokedDirectly) {
  try {
    const args = process.argv.slice(2)
    if (args.length !== 4 && args.length !== 5) {
      fail('usage: node verify-installer-provenance.mjs <manifest> <installer.exe> <checksum.txt> <commit40> [output.json]')
    }
    const result = verifyLuInstallerPaths({
      manifestPath: args[0], installerPath: args[1], checksumPath: args[2], expectedCommit: args[3],
    })
    if (args[4]) writeFileSync(args[4], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
    console.log('LU_ALPHA01_INSTALLER_PROVENANCE_PASS sha256=' + result.installerSha256 +
      ' installed_windows_acceptance=unverified')
  } catch (error) {
    console.error(String(error))
    process.exitCode = 1
  }
}
