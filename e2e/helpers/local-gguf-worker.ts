import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path'

/**
 * Start a real packaged Windows llama.cpp worker for the disposable
 * WebView2->custom-provider->GGUF integration test.
 *
 * This verifies Lu's graphical chat path through the installed worker's
 * OpenAI-compatible loopback service. It does NOT exercise the built-in
 * llama.cpp model import/library UX, which needs a separate acceptance gate.
 */
export type RealGgufWorker = {
  baseUrl: string
  modelId: string
  apiKey: string
  close: () => Promise<void>
}

function isUnder(parent: string, child: string) {
  const path = relative(parent, child)
  return path.length > 0 && path !== '..' &&
    !path.startsWith('..\\') && !path.startsWith('../') && !isAbsolute(path)
}

export async function startRealGgufWorker(): Promise<RealGgufWorker> {
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.RUNNER_OS !== 'Windows' || process.env.LU_E2E_REAL_MODEL !== '1') {
    throw new Error('Real Lu GGUF GUI test requires a disposable Windows GitHub Actions runner')
  }
  const runnerTemp = process.env.RUNNER_TEMP
  const workerPath = process.env.LU_GGUF_WORKER_EXE
  const modelPath = process.env.LU_TEST_GGUF
  if (!runnerTemp || !workerPath || !modelPath) {
    throw new Error('Missing pinned bundled worker, model or runner-temporary directory')
  }

  const root = resolve(runnerTemp)
  const executable = resolve(workerPath)
  const model = resolve(modelPath)
  if (!isUnder(root, executable) || !isUnder(root, model) ||
      !existsSync(executable) || !existsSync(model) ||
      extname(executable).toLowerCase() !== '.exe' ||
      extname(model).toLowerCase() !== '.gguf') {
    throw new Error('Lu worker/GGUF must be existing files under runner temp')
  }

  const owned = mkdtempSync(join(root, 'lu-gui-gguf-'))
  const preset = join(owned, 'local-model.preset.ini')
  // Use the CPU-only preset established by the previous real-inference CI.
  const modelId = 'lu-real-smol'
  writeFileSync(preset, [
    '[*]', 'parallel = 1', 'threads = 2', 'ctx-size = 512',
    'n-gpu-layers = 0', 'no-warmup = true', 'fit = off',
    '', '[' + modelId + ']', 'model = ' + model,
    'load-on-startup = false', '',
  ].join('\n'), 'utf8')

  const apiKey = randomBytes(32).toString('hex')
  const workerDir = dirname(executable)
  const worker = spawn(executable, [
    '--preset', preset, '--port', '0', '--models-max', '1',
  ], {
    cwd: workerDir,
    env: {
      ...process.env,
      JAN_LLAMA_API_KEY: apiKey,
      PATH: workerDir + ';' + (process.env.PATH ?? ''),
    },
    stdio: ['pipe', 'pipe', 'inherit'],
    windowsHide: true,
  })

  async function close() {
    if (worker.exitCode === null && worker.signalCode === null) {
      worker.stdin.end()
      await new Promise<void>((done) => {
        const deadline = setTimeout(() => {
          if (worker.exitCode === null && worker.signalCode === null) worker.kill()
          done()
        }, 15_000)
        worker.once('exit', () => { clearTimeout(deadline); done() })
        worker.once('error', () => { clearTimeout(deadline); done() })
      })
    }
    rmSync(owned, { recursive: true, force: true, maxRetries: 6, retryDelay: 200 })
  }

  try {
    const firstLine = await new Promise<string>((ok, fail) => {
      let data = ''
      let settled = false
      const timer = setTimeout(() => failOnce(new Error('GGUF worker handshake timeout')), 90_000)
      function failOnce(err: Error) {
        if (settled) return
        settled = true
        clearTimeout(timer)
        fail(err)
      }
      worker.once('error', failOnce)
      worker.once('exit', (code) => failOnce(new Error('Worker exited before handshake: ' + code)))
      worker.stdout.on('data', (chunk: Buffer) => {
        if (settled) return
        data += chunk.toString('utf8')
        if (data.length > 32768) return failOnce(new Error('Oversized GGUF handshake'))
        const index = data.indexOf('\n')
        if (index < 0) return
        settled = true
        clearTimeout(timer)
        ok(data.slice(0, index).trim())
      })
    })

    const hello = JSON.parse(firstLine) as {
      port?: number
      pid?: number
      models?: string[]
    }
    if (!Number.isSafeInteger(hello.port) || !hello.port || hello.port < 1 ||
        hello.port > 65535 || hello.pid !== worker.pid ||
        !Array.isArray(hello.models) || !hello.models.includes(modelId)) {
      throw new Error('Bundled worker did not register real GGUF on authenticated loopback')
    }

    const baseUrl = 'http://127.0.0.1:' + hello.port + '/v1'
    const response = await fetch(baseUrl + '/models', {
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) {
      throw new Error('GGUF worker authenticated model list failed: HTTP ' + response.status)
    }
    console.log('[lu-e2e] Authenticated bundled GGUF worker, model:', modelId)
    return { baseUrl, modelId, apiKey, close }
  } catch (error) {
    await close()
    throw error
  }
}
