// Verifies ELF linking/packaging with real native GCC binaries, not GGUF inference.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { stageLinuxPackage } from '../stage-lu-linux-engine.mjs'

const compiler = spawnSync('gcc', ['--version'], { stdio: 'ignore' }).status === 0

test('compiled Linux executable loads its packaged, hash-pinned shared library', { skip: !compiler }, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'lu-native-elf-smoke-'))
  try {
    const build = path.join(workspace, 'build')
    fs.mkdirSync(build)
    const library = path.join(workspace, 'lib.c')
    const entry = path.join(workspace, 'entry.c')
    fs.writeFileSync(library, 'int lu_test_library_answer(void) { return 42; }\n')
    fs.writeFileSync(entry, '#include <stdio.h>\nextern int lu_test_library_answer(void);\nint main(void) { printf("LU_REAL_ELF_OK=%d\\n", lu_test_library_answer()); return 0; }\n')
    const so = path.join(build, 'libggml.so.0')
    execFileSync('gcc', ['-fPIC', '-shared', '-Wl,-soname,libggml.so.0', '-o', so, library])
    fs.symlinkSync('libggml.so.0', path.join(build, 'libggml.so'))
    execFileSync('gcc', [entry, '-L' + build, '-lggml', '-o', path.join(build, 'llama-server')])
    const pkg = path.join(workspace, 'package')
    const receipt = stageLinuxPackage(build, pkg)
    assert.equal(receipt.componentCount, 3)
    assert.ok(/^[0-9a-f]{64}$/.test(receipt.packageSha256))
    const stdout = execFileSync(path.join(pkg, 'llama-server'), {
      encoding: 'utf8',
      env: { ...process.env, LD_LIBRARY_PATH: pkg, LD_PRELOAD: '', LD_AUDIT: '' },
      timeout: 10_000,
    })
    assert.equal(stdout.trim(), 'LU_REAL_ELF_OK=42')
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true })
  }
})
