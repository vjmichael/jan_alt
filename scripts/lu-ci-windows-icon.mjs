// Generate a standards-compliant, 16x16 32-bit ICO for Windows CI only.
// Jan's general resource-stubbing script copies icon.png to icon.ico when the
// real ICO is absent. RC.EXE cannot compile an ICO with PNG file headers.
// This script runs *only* in compile-only CI, after the general resource stubs.
// Do NOT use this icon for release packaging or touch a real development icon.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const target = join(repoRoot, 'src-tauri', 'icons', 'icon.ico')
const existing = readFileSync(target)

// A valid ICO begins with the reserved 0 word and type = 1, unlike a PNG.
if (existing.length >= 6 &&
    existing.readUInt16LE(0) === 0 &&
    existing.readUInt16LE(2) === 1 &&
    existing.readUInt16LE(4) > 0) {
  process.stdout.write('Existing valid ICO header; leaving untouched.\n')
  process.exit(0)
}

const width = 16
const height = 16
const pixelBytes = width * height * 4 // BGRA, 32-bit
const andMaskBytes = height * 4 // 1 bpp padded to 32 bits per row
const bitmapHeaderBytes = 40
const imageSize = bitmapHeaderBytes + pixelBytes + andMaskBytes
const dataOffset = 6 + 16
const data = Buffer.alloc(dataOffset + imageSize)
data.writeUInt16LE(0, 0) // reserved
data.writeUInt16LE(1, 2) // ICO image type
data.writeUInt16LE(1, 4) // exactly one image
data.writeUInt8(width, 6)
data.writeUInt8(height, 7)
data.writeUInt16LE(1, 10) // planes
data.writeUInt16LE(32, 12) // 32 bits per pixel
data.writeUInt32LE(imageSize, 14)
data.writeUInt32LE(dataOffset, 18)

const dib = dataOffset
data.writeUInt32LE(bitmapHeaderBytes, dib)
data.writeInt32LE(width, dib + 4)
data.writeInt32LE(height * 2, dib + 8) // XOR + AND height
data.writeUInt16LE(1, dib + 12)
data.writeUInt16LE(32, dib + 14)
data.writeUInt32LE(0, dib + 16) // BI_RGB
data.writeUInt32LE(pixelBytes + andMaskBytes, dib + 20)
for (let offset = 0; offset < pixelBytes; offset += 4) {
  const pixel = dib + bitmapHeaderBytes + offset
  data[pixel] = 0x33 // blue
  data[pixel + 1] = 0x66 // green
  data[pixel + 2] = 0x99 // red
  data[pixel + 3] = 0xff // alpha
}
// The AND mask is zero-filled, meaning opaque pixels.
writeFileSync(target, data)
process.stdout.write('Created a valid 32-bit ICO fixture for Windows CI.\n')
