import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectLinuxEnvironment } from '../check-lu-linux-env.mjs'

const linux = { platform: 'linux', arch: 'x64' }
const yes = () => true

test('all capabilities are reported, not confused with build acceptance', () => {
  const result = inspectLinuxEnvironment({ ...linux, hasCommand: yes, hasPackage: yes })
  assert.equal(result.supported, true)
  assert.equal(result.coreReady, true)
  assert.equal(result.engineReady, true)
  assert.equal(result.desktopReady, true)
  assert.deepEqual(result.missing.libraries, [])
  assert.match(result.note, /no Lu build or real GGUF/)
})

test('missing Cargo is an explicit blocker for core and dependent gates', () => {
  const result = inspectLinuxEnvironment({
    ...linux,
    hasCommand: name => name !== 'cargo',
    hasPackage: yes,
  })
  assert.deepEqual(result.missing.core, ['cargo'])
  assert.equal(result.coreReady, false)
  assert.equal(result.engineReady, false)
  assert.equal(result.desktopReady, false)
})

test('missing WebKitGTK blocks the GUI but not the portable core', () => {
  const result = inspectLinuxEnvironment({
    ...linux,
    hasCommand: yes,
    hasPackage: name => name !== 'webkit2gtk-4.1',
  })
  assert.equal(result.coreReady, true)
  assert.equal(result.engineReady, true)
  assert.equal(result.desktopReady, false)
  assert.deepEqual(result.missing.libraries, ['webkit2gtk-4.1'])
})

test('unsupported platform cannot be reported as Linux ready', () => {
  const result = inspectLinuxEnvironment({
    platform: 'win32', arch: 'x64', hasCommand: yes, hasPackage: yes,
  })
  assert.equal(result.supported, false)
  assert.equal(result.coreReady, false)
  assert.equal(result.desktopReady, false)
})
