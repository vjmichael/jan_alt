import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectWindowsPeImports, forbiddenEngineDependencies } from './check-windows-engine-imports.mjs'

// A synthetic PE32+ with a real import directory. This tests the binary
// parser's decisions without downloading an actual engine into source tests.
function peWithImports(names = [], delayed = []) {
  const b = Buffer.alloc(4096)
  b.write('MZ')
  b.writeUInt32LE(0x80, 0x3c)
  b.write('PE\0\0', 0x80)
  b.writeUInt16LE(0x8664, 0x84)
  b.writeUInt16LE(1, 0x86) // section count
  b.writeUInt16LE(0xf0, 0x94)
  b.writeUInt16LE(0x20b, 0x98)
  b.writeBigUInt64LE(0x140000000n, 0x98 + 24)
  b.writeUInt32LE(16, 0x98 + 108)
  const sections = 0x98 + 0xf0
  b.write('.rdata', sections)
  b.writeUInt32LE(0x800, sections + 8)
  b.writeUInt32LE(0x1000, sections + 12)
  b.writeUInt32LE(0x800, sections + 16)
  b.writeUInt32LE(0x200, sections + 20)
  const dirs = 0x98 + 112
  const named = (value, i) => {
    const file = 0x300 + i * 80
    b.write(value + '\0', file)
    return 0x1000 + (file - 0x200)
  }
  if (names.length) {
    b.writeUInt32LE(0x1000, dirs + 8)
    b.writeUInt32LE((names.length + 1) * 20, dirs + 12)
    names.forEach((value, i) => b.writeUInt32LE(named(value, i), 0x200 + i * 20 + 12))
  }
  if (delayed.length) {
    b.writeUInt32LE(0x1400, dirs + 13 * 8)
    b.writeUInt32LE((delayed.length + 1) * 32, dirs + 13 * 8 + 4)
    delayed.forEach((value, i) => {
      b.writeUInt32LE(1, 0x600 + i * 32)
      b.writeUInt32LE(named(value, i + names.length), 0x600 + i * 32 + 4)
    })
  }
  return b
}

test('valid PE without SSL dependency passes', () => {
  const imports = inspectWindowsPeImports(peWithImports(['KERNEL32.dll', 'WS2_32.dll']))
  assert.deepEqual(imports, ['kernel32.dll', 'ws2_32.dll'])
  assert.deepEqual(forbiddenEngineDependencies(imports), [])
})

test('DLL bundled somewhere else on CI is still rejected as a direct import', () => {
  const imports = inspectWindowsPeImports(peWithImports(['libssl-3-x64.dll', 'KERNEL32.dll']))
  assert.deepEqual(forbiddenEngineDependencies(imports), ['libssl-3-x64.dll'])
})

test('libcrypto missing at startup is rejected', () => {
  const imports = inspectWindowsPeImports(peWithImports(['libcrypto-3-x64.dll']))
  assert.deepEqual(forbiddenEngineDependencies(imports), ['libcrypto-3-x64.dll'])
})

test('OpenSSL imported by a delayed PE directory is also rejected', () => {
  const imports = inspectWindowsPeImports(peWithImports([], ['libssl-3-x64.dll']))
  assert.deepEqual(forbiddenEngineDependencies(imports), ['libssl-3-x64.dll'])
})

test('invalid, truncated and forged non-PE images do not pass inspection', () => {
  assert.throws(() => inspectWindowsPeImports(Buffer.from('MZ')))
  assert.throws(() => inspectWindowsPeImports(Buffer.alloc(512)))
  const pe = peWithImports(['libssl-3-x64.dll'])
  pe.writeUInt32LE(0x7fffffff, 0x3c)
  assert.throws(() => inspectWindowsPeImports(pe))
})
