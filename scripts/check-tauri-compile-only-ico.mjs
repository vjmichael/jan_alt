// Structural regression guard for the compile-only Windows Tauri ICO fixture.
// A PNG copied to an .ico extension is not a Windows resource container.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ico = fileURLToPath(new URL('../src-tauri/icons/icon.ico', import.meta.url))
const bytes = readFileSync(ico)
assert.ok(bytes.length >= 22, 'ICO header and first entry must exist')
assert.equal(bytes.readUInt16LE(0), 0, 'ICO reserved header')
assert.equal(bytes.readUInt16LE(2), 1, 'ICO resource type')
const count = bytes.readUInt16LE(4)
assert.ok(count >= 1 && count <= 256, 'ICO must have a bounded image count')
assert.ok(bytes.length >= 6 + count * 16, 'ICO directory must not be truncated')

for (let n = 0; n < count; n++) {
  const at = 6 + n * 16
  const length = bytes.readUInt32LE(at + 8)
  const offset = bytes.readUInt32LE(at + 12)
  assert.ok(length >= 40, 'ICO image must contain a bitmap or PNG payload')
  assert.ok(offset >= 6 + count * 16, 'ICO image must follow its directory')
  assert.ok(offset + length <= bytes.length, 'ICO payload must not be truncated')
  const isPng = bytes.subarray(offset, offset + 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  )
  const dibHeaderSize = bytes.readUInt32LE(offset)
  assert.ok(isPng || [40, 108, 124].includes(dibHeaderSize), 'ICO payload must be a bitmap or PNG')
}
console.log('Valid Windows ICO container; compile-only resource, NOT packaging evidence.')
