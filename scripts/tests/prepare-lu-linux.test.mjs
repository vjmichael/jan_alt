import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { stageLinuxPackage } from '../stage-lu-linux-engine.mjs'

const prepare = fileURLToPath(new URL('../prepare-lu-linux.mjs', import.meta.url))
const SAMPLE_CARGO = [
  'default-run = "Jan-Desktop"',
  'name = "Jan-Desktop"',
  'lu-distribution = ["lu-foundation", "tauri-plugin-agent-tools/lu-distribution"]',
].join('\n') + '\n'

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-linux-prepare-fixture-'))
  try {
    const tauri = path.join(root, 'src-tauri')
    const build = path.join(root, 'build')
    const bin = path.join(root, 'bin')
    fs.mkdirSync(tauri)
    fs.mkdirSync(build)
    fs.mkdirSync(bin)
    fs.writeFileSync(path.join(tauri, 'tauri.lu.conf.json'),
      JSON.stringify({ identifier: 'ai.lu.preview' }))
    fs.writeFileSync(path.join(tauri, 'tauri.lu.linux.conf.json'), JSON.stringify({
      identifier: 'ai.lu.preview', productName: 'Lu', mainBinaryName: 'Lu-Desktop',
      app: { windows: [{ label: 'main', title: 'Lu' }] },
      bundle: { targets: ['deb'], icon: ['icons/lu/32x32.png'] },
    }))
    const cargoPath = path.join(tauri, 'Cargo.toml')
    fs.writeFileSync(cargoPath, SAMPLE_CARGO)
    const elf = Buffer.alloc(64)
    elf.set([0x7f, 0x45, 0x4c, 0x46, 2, 1])
    elf.writeUInt16LE(62, 18)
    fs.writeFileSync(path.join(build, 'llama-server'), elf, { mode: 0o755 })
    const packageDir = path.join(tauri, 'resources', 'lu-inference')
    const pins = stageLinuxPackage(build, packageDir)
    const fakeYarn = path.join(bin, 'yarn')
    fs.writeFileSync(fakeYarn, '#!/bin/sh\nexit 0\n', { mode: 0o755 })
    const launch = (mode, env = {}) => spawnSync(process.execPath, [prepare, mode], {
      cwd: root, encoding: 'utf8',
      env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH, ...env },
    })
    return run({ root, cargoPath, pins, launch })
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}

test('read-only check leaves original Jan Cargo settings intact', () => {
  fixture(({ cargoPath, launch }) => {
    const r = launch('--check')
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /LU_LINUX_CONFIG_CHECK_PASS/)
    assert.equal(fs.readFileSync(cargoPath, 'utf8'), SAMPLE_CARGO)
  })
})

test('bad SHA pin refuses preparation without Cargo mutation', () => {
  fixture(({ cargoPath, launch }) => {
    const r = launch('--prepare', {
      LU_TRUSTED_LLAMA_SERVER_SHA256: 'bad',
      LU_TRUSTED_LLAMA_PACKAGE_SHA256: 'bad',
    })
    assert.notEqual(r.status, 0)
    assert.equal(fs.readFileSync(cargoPath, 'utf8'), SAMPLE_CARGO)
  })
})

test('correct engine SHA pins allow isolated Linux preparation', () => {
  fixture(({ cargoPath, pins, launch }) => {
    const r = launch('--prepare', {
      LU_TRUSTED_LLAMA_SERVER_SHA256: pins.executableSha256,
      LU_TRUSTED_LLAMA_PACKAGE_SHA256: pins.packageSha256,
    })
    assert.equal(r.status, 0, r.stderr)
    assert.match(r.stdout, /LU_LINUX_PREPARE_PASS/)
    assert.match(fs.readFileSync(cargoPath, 'utf8'), /Lu-Desktop/)
    assert.doesNotMatch(fs.readFileSync(cargoPath, 'utf8'), /Jan-Desktop/)
  })
})
