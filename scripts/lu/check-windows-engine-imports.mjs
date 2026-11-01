// Static PE import inspection for the Lu-owned Windows inference executable.
// A CI runner may have OpenSSL DLLs globally installed while a user's PC does
// not. This check runs BEFORE packaging and does not launch the executable.
import fs from 'node:fs'

const requireBytes = (buffer, offset, length) => {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + length > buffer.length) {
    throw new Error('Malformed Windows PE import directory')
  }
}

export function inspectWindowsPeImports(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512 || buffer.toString('ascii', 0, 2) !== 'MZ') {
    throw new Error('Engine is not a complete Windows PE executable')
  }
  const nt = buffer.readUInt32LE(0x3c)
  requireBytes(buffer, nt, 24)
  if (buffer.toString('ascii', nt, nt + 4) !== 'PE\0\0') {
    throw new Error('Windows PE signature is invalid')
  }
  const optional = nt + 24
  const optLen = buffer.readUInt16LE(nt + 20)
  requireBytes(buffer, optional, optLen)
  const magic = buffer.readUInt16LE(optional)
  if (magic !== 0x20b && magic !== 0x10b) {
    throw new Error('Unsupported Windows PE optional header')
  }
  const dirs = optional + (magic === 0x20b ? 112 : 96)
  const countOffset = optional + (magic === 0x20b ? 108 : 92)
  const count = buffer.readUInt32LE(countOffset)
  const imageBase = magic === 0x20b ? Number(buffer.readBigUInt64LE(optional + 24)) : buffer.readUInt32LE(optional + 28)
  const sectionCount = buffer.readUInt16LE(nt + 6)
  const sectionTable = optional + optLen
  if (sectionCount < 1 || sectionCount > 96) throw new Error('Invalid section count')
  requireBytes(buffer, sectionTable, sectionCount * 40)
  const sections = Array.from({ length: sectionCount }, (_, i) => {
    const off = sectionTable + i * 40
    return {
      virtualSize: buffer.readUInt32LE(off + 8),
      virtualAddress: buffer.readUInt32LE(off + 12),
      rawSize: buffer.readUInt32LE(off + 16),
      rawOffset: buffer.readUInt32LE(off + 20),
    }
  })
  function fromRva(rva, needed) {
    const match = sections.find(s => rva >= s.virtualAddress &&
      rva - s.virtualAddress + needed <= Math.max(s.virtualSize, s.rawSize))
    if (!match) throw new Error('PE import RVA outside mapped section')
    const rawRelative = rva - match.virtualAddress
    if (rawRelative + needed > match.rawSize) throw new Error('PE import RVA outside on-disk bytes')
    const off = match.rawOffset + rawRelative
    requireBytes(buffer, off, needed)
    return off
  }
  function asciiAt(rva) {
    const pos = fromRva(rva, 1)
    const endLimit = Math.min(buffer.length, pos + 260)
    let end = pos
    while (end < endLimit && buffer[end] !== 0) end++
    if (end === endLimit) throw new Error('Unterminated PE import DLL name')
    const name = buffer.toString('ascii', pos, end)
    if (!/^[\x20-\x7e]+\.dll$/i.test(name)) throw new Error('Invalid PE import DLL name')
    return name.toLowerCase()
  }
  const imports = []
  function readDirectory(index, entryBytes, nameIndex, delayed = false) {
    if (count <= index) return
    requireBytes(buffer, dirs + index * 8, 8)
    const rva = buffer.readUInt32LE(dirs + index * 8)
    const size = buffer.readUInt32LE(dirs + index * 8 + 4)
    if (!rva && !size) return
    if (!rva || size < entryBytes) throw new Error('Incomplete PE import data directory')
    const max = Math.min(256, Math.ceil(size / entryBytes))
    let terminated = false
    for (let i = 0; i < max; i++) {
      const off = fromRva(rva + i * entryBytes, entryBytes)
      const entry = buffer.subarray(off, off + entryBytes)
      if (entry.every(b => b === 0)) { terminated = true; break }
      let nameRva = buffer.readUInt32LE(off + nameIndex)
      if (delayed && !(buffer.readUInt32LE(off) & 1)) {
        if (nameRva < imageBase) throw new Error('Invalid VA in delayed PE import')
        nameRva -= imageBase
      }
      imports.push(asciiAt(nameRva))
    }
    if (!terminated) throw new Error('Unterminated PE import directory')
  }
  readDirectory(1, 20, 12)
  readDirectory(13, 32, 4, true)
  return [...new Set(imports)].sort()
}

export function forbiddenEngineDependencies(imports) {
  return imports.filter(name => /^(?:libssl|libcrypto)(?:[-_.]|$)/i.test(name))
}

if (process.argv[1]?.endsWith('check-windows-engine-imports.mjs')) {
  const file = process.argv[2]
  if (!file) throw new Error('Usage: node check-windows-engine-imports.mjs <llama-server.exe>')
  const imports = inspectWindowsPeImports(fs.readFileSync(file))
  const forbidden = forbiddenEngineDependencies(imports)
  if (forbidden.length) {
    console.error('LU_NATIVE_ENGINE_IMPORTS_FAIL forbidden_runtime_dll=' + forbidden.join(','))
    process.exitCode = 1
  } else {
    console.log('LU_NATIVE_ENGINE_IMPORTS_PASS direct_and_delayed=' + imports.length + ' openssl=false')
  }
}
