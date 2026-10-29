import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { verifyLuInstaller } from './verify-installer-provenance.mjs'

const bytes = Buffer.from('SYNTHETIC_FIXTURE_NOT_AN_INSTALLER')
const hash = createHash('sha256').update(bytes).digest('hex')
const commit = 'a'.repeat(40)
const name = 'Lu_0.1.0_x64-setup.exe'
function sample() {
  return {
    manifest: {
      application:'Lu',identity:'ai.lu.preview',architecture:'x86_64-pc-windows-msvc',
      installerType:'nsis',engineVariant:'vulkan',luNativeInference:'cpu-llama-server',
      signedInstaller:false,gitCommit:commit,installerFile:name,installerSha256:hash,
      luEngineSha256:'b'.repeat(64),luPackageManifestSha256:'c'.repeat(64),
    },
    expectedCommit:commit,installerName:name,installerBytes:bytes,
    checksumText:hash + '  ' + name + '\n',
  }
}
test('synthetic fixture confirms manifest+file+sidecar agreement (not runtime)', () => {
  const result = verifyLuInstaller(sample())
  assert.equal(result.installedWindowsAcceptance, 'unverified')
  assert.equal(result.installerSha256, hash)
})
test('rejects changed executable bytes', () => {
  const x=sample();x.installerBytes=Buffer.from('tampered')
  assert.throws(()=>verifyLuInstaller(x),/binary hash/)
})
test('rejects changed source commit', () => {
  const x=sample();x.expectedCommit='d'.repeat(40)
  assert.throws(()=>verifyLuInstaller(x),/source commit/)
})
test('rejects mismatched checksum sidecar', () => {
  const x=sample();x.checksumText='d'.repeat(64)+'  '+name+'\n'
  assert.throws(()=>verifyLuInstaller(x),/checksum sidecar/)
})
test('rejects mismatched installer name and missing engine hashes', () => {
  const x=sample();x.installerName='other.exe'
  assert.throws(()=>verifyLuInstaller(x),/installer file/)
  const y=sample();y.manifest.luEngineSha256='0'
  assert.throws(()=>verifyLuInstaller(y),/malformed digest/)
})
test('rejects fake signing, wrong architecture and unexpected type', () => {
  for (const patch of [{signedInstaller:true},{architecture:'x86'},{installerType:'msi'}]) {
    const x=sample();Object.assign(x.manifest,patch)
    assert.throws(()=>verifyLuInstaller(x))
  }
})
