import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { janUserDataDir } from '../helpers/paths.js'
import { browser, $, $$ } from '@wdio/globals'
import { ASSISTANT_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { startMockOpenAI, type MockOpenAI } from '../helpers/mock-openai.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'
import { goto } from '../helpers/navigation.js'
import { parseLuSavedTurnRows } from '../helpers/lu-saved-turns.js'

/**
 * WebView2-to-Tauri-to-Protobuf-to-persistent-GGUF acceptance.
 * A mock provider only bootstraps the existing thread UI. The two Lu-native
 * turns MUST NOT touch it, ensuring the model factory path is bypassed.
 * All files live in the disposable JAN_E2E_HOME (never the user's AppData).
 */
describe('Lu native persisted GGUF WebView2 integration', () => {
  let mock: MockOpenAI
  let expectedMockCalls = 0
  let sessionId = ''
  let pid = 0
  let threadId = ''
  const marker = 'LU_NATIVE_TOOL_PROOF_E2E_9f73d6a2'
  // Keep security acceptance independent from the separate W01 model/tool
  // continuation proof: both share the same real GGUF bootstrap and host.
  const positiveTest = process.env.LU_E2E_SECURITY_ONLY === '1' ||
    process.env.LU_E2E_DX_SCOPED_ONLY === '1' ||
    process.env.LU_E2E_DX_EXPORT_ONLY === '1' ||
    process.env.LU_E2E_DX_HOST_FINDING_ONLY === '1' ? it.skip : it
  const scopedDxTest = process.env.LU_E2E_DX_SCOPED_ONLY === '1' ? it : it.skip
  const exportDxTest = process.env.LU_E2E_DX_EXPORT_ONLY === '1' ? it : it.skip
  const hostFindingDxTest = process.env.LU_E2E_DX_HOST_FINDING_ONLY === '1' ? it : it.skip

  const status = async () => browser.execute(async () => {
    const host = window as Window & {
      __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<{
        sessionId: string | null
        modelRef: string | null
        generationId: string | null
        phase: string
        pid: number | null
      }> }
    }
    if (!host.__TAURI_INTERNALS__) throw new Error('Tauri invoke unavailable in real WebView2')
    return host.__TAURI_INTERNALS__.invoke('lu_inference_status')
  })

  before(async () => {
    mock = await startMockOpenAI({ modelId: 'lu-native-bootstrap' })
    await $('#root').waitForExist({ timeout: 60_000 })
    await configureMockProvider(mock, 'lu-native-bootstrap-provider')
    await goto('/')
    await selectModel(mock.modelId)
    await sendPrompt('Bootstrap this new thread before native-model selection.')
    // The send button can briefly reappear before the async provider request
    // reaches the mock. Requiring exactly one call here raced the initial
    // dispatch and failed before the native tool path could be tested.
    await browser.waitUntil(async () => mock.streamedPrompts.length > 0, {
      timeout: 60_000,
      timeoutMsg: 'The bootstrap user turn never reached the Jan-compatible mock provider',
    })
    await waitForStreamToFinish(90_000)
    // Retain the actual bootstrap baseline. Later Lu-native calls must not
    // increase this count; retries during bootstrap are a separate concern.
    expectedMockCalls = mock.streamedPrompts.length
    await browser.waitUntil(async () =>
      (await browser.execute(() => window.location.pathname)).startsWith('/threads/'),
    { timeout: 30_000, timeoutMsg: 'Lu did not create a thread before model selection' })
    threadId = (await browser.execute(() => window.location.pathname)).split('/')[2] ?? ''
    if (!/^[a-f0-9-]{36}$/.test(threadId)) throw new Error('Unexpected Lu thread identity')
    const testHome = process.env.JAN_E2E_HOME
    if (!testHome || process.env.LU_E2E !== '1') {
      throw new Error('Real native tool probe cannot run outside the isolated Lu profile')
    }
    const folder = join(janUserDataDir(testHome), 'agent-workspace', 'threads', threadId)
    mkdirSync(folder, { recursive: true })
    writeFileSync(join(folder, 'notes.txt'), marker + '\\n', { flag: 'wx' })
  })

  after(async () => { if (mock) await mock.close() })

  // Record only bounded, content-free host milestones when the Windows W01
  // acceptance fails. Never turn an evidence probe into a new model request,
  // and never mask the test's original error if diagnostics are unavailable.
  afterEach(async function () {
    if (this.currentTest?.state !== 'failed' || process.env.LU_E2E_SECURITY_ONLY === '1') return
    try {
      const diagnostic = await browser.execute(async () => {
        const host = window as Window & {
          __TAURI_INTERNALS__?: { invoke: (command: string) => Promise<unknown> }
        }
        return host.__TAURI_INTERNALS__
          ? host.__TAURI_INTERNALS__.invoke('lu_inference_diagnostics')
          : null
      })
      const stages = new Set([
        'native-turn-received','recovery-ready','recovery-unavailable','native-session-ready',
        'native-session-rejected','saved-user-attested','saved-user-rejected',
        'native-turn-registered','native-turn-busy','native-worker-entered',
        'native-task-authorized','native-model-loop-entered','native-model-loop-returned',
        'native-turn-succeeded','native-turn-failed','native-cancel-signalled',
      ])
      const raw = diagnostic as {
        schema?: unknown; traceRef?: unknown; clockDomain?: unknown
        recordingState?: unknown; droppedEvents?: unknown; events?: unknown
      } | null
      const v2 = raw?.schema === 'lu.native.host-trace.v2'
      const legacy = raw?.schema === 'lu.native.host-trace.v1'
      const knownTraceRef = v2 && typeof raw.traceRef === 'string' &&
        /^[a-f0-9]{32}$/.test(raw.traceRef) ? raw.traceRef : null
      const droppedEvents = v2 &&
        typeof raw.droppedEvents === 'number' &&
        Number.isSafeInteger(raw.droppedEvents) && raw.droppedEvents >= 0
        ? raw.droppedEvents : null
      const unobserved = v2 && raw?.recordingState === 'admission_unobserved'
      const events = !unobserved && (v2 || legacy) && Array.isArray(raw?.events)
        ? raw.events.slice(-64).filter((value): value is { stage: string; sequence: number; elapsedMillis: number } => {
            if (!value || typeof value !== 'object') return false
            const entry = value as Record<string, unknown>
            return typeof entry.stage === 'string' && stages.has(entry.stage) &&
              typeof entry.sequence === 'number' && Number.isSafeInteger(entry.sequence) &&
              entry.sequence > 0 &&
              typeof entry.elapsedMillis === 'number' && Number.isSafeInteger(entry.elapsedMillis) &&
              entry.elapsedMillis >= 0
          }).map(entry => ({
            stage: entry.stage, sequence: entry.sequence, elapsedMillis: entry.elapsedMillis,
          }))
        : []
      console.log('LU_W01_SANITIZED_HOST_TRACE ' + JSON.stringify({
        available: (v2 && raw?.clockDomain === 'host' && !unobserved) || legacy,
        source: unobserved ? 'trace-admission-unobserved'
          : v2 ? 'per-accepted-turn-host' : legacy ? 'legacy-uncorrelated' : 'unavailable',
        traceRef: unobserved ? null : knownTraceRef,
        droppedEvents, events,
        limitations: 'host-only; frontend and assistant persistence not causally linked',
      }))
    } catch {
      console.log('LU_W01_SANITIZED_HOST_TRACE_UNAVAILABLE')
    }
  })

  it('shows a trusted catalog, loads an admitted GGUF, and explicitly selects Lu', async () => {
    const picker = await $('[data-testid="lu-native-model-select"]')
    await picker.waitForDisplayed({ timeout: 30_000 })
    if (!(await picker.isEnabled())) {
      throw new Error('Trusted Lu model catalog unavailable: check package hashes and profile seeding')
    }
    const modelNames: string[] = await browser.execute(() =>
      Array.from(document.querySelectorAll('[data-testid="lu-native-model-select"] option'),
        option => option.textContent ?? ''))
    if (!modelNames.some(name => name.includes('qwen2.5-0.5b-instruct-q4_k_m.gguf'))) {
      throw new Error('Expected checksum-pinned GGUF missing from Lu model catalog')
    }
    await $('[data-testid="lu-native-load"]').click()
    await browser.waitUntil(async () => {
      const info = await status()
      if (!info.sessionId || !info.pid || info.phase !== 'Ready') return false
      sessionId = info.sessionId
      pid = info.pid
      return true
    }, { timeout: 120_000, timeoutMsg: 'Native GGUF did not enter Ready with a resident engine PID' })
    await $('[data-testid="lu-native-chat-toggle"]').click()
    if (!(await $('[data-testid="lu-native-chat-toggle"]').isSelected())) {
      throw new Error('Lu native chat mode was not opted in')
    }
  })

  exportDxTest('DX export button produces a content-free report in real Windows WebView2', async () => {
    // Exercise the user-facing button while the trusted GGUF engine is loaded.
    // Intercept the synthetic anchor click to avoid real disk writes or opening
    // a browser download. Read only the generated Blob and return booleans.
    const evidence = await browser.execute(async (knownThread: string) => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="lu-native-export-diagnostics"]')
      if (!button) throw new Error('Lu diagnostics export button missing')
      const originalCreate = URL.createObjectURL
      const originalClick = HTMLAnchorElement.prototype.click
      let observedBlob: Blob | null = null
      let downloadName = ''
      URL.createObjectURL = (value: Blob | MediaSource) => {
        if (value instanceof Blob) observedBlob = value
        return originalCreate(value)
      }
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        downloadName = this.download
      }
      try {
        button.click()
        for (let i = 0; i < 200 && !(observedBlob && downloadName); i++) {
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        const blob = observedBlob as Blob | null
        if (!blob) return { created: false, filenameCorrect: false, redacted: false,
          schemaCorrect: false, enginePresent: false }
        const json = await blob.text()
        const report = JSON.parse(json) as {
          schema?: unknown
          operatingSystem?: unknown
          engine?: { processPresent?: unknown; statusProbe?: unknown }
          hostTrace?: { status?: unknown }
        }
        return {
          created: downloadName.length > 0,
          filenameCorrect: downloadName === 'lu-native-diagnostics.json',
          schemaCorrect: report.schema === 'lu.native.diagnostics.v1' &&
            report.operatingSystem === 'windows' &&
            report.hostTrace !== null && typeof report.hostTrace === 'object',
          enginePresent: report.engine?.processPresent === true &&
            report.engine?.statusProbe === 'ok',
          redacted: !json.includes(knownThread) &&
            !json.includes('Bootstrap this new thread before native-model selection.') &&
            !json.includes('lu-native-bootstrap-provider') &&
            !json.includes('sessionId') && !json.includes('generationId') &&
            !json.includes('modelRef') && !json.includes('C:\\\\Users\\\\'),
        }
      } finally {
        URL.createObjectURL = originalCreate
        HTMLAnchorElement.prototype.click = originalClick
      }
    }, threadId)
    if (!evidence.created || !evidence.filenameCorrect || !evidence.redacted ||
        !evidence.schemaCorrect || !evidence.enginePresent) {
      throw new Error('Lu DX user-facing export failed its Windows redaction or engine-status gate: ' +
        JSON.stringify(evidence))
    }
    console.log('LU_DX_EXPORT_WEBVIEW2_PASS available=true redacted=true model_process=true')
  })

  it('W02 rejects non-user, missing, cross-thread and invalid saved-turn requests before native model generation', async () => {
    if (!sessionId || !pid || !threadId) throw new Error('Native Lu session and thread required for host denial probe')
    const messagesPath = join(janUserDataDir(process.env.JAN_E2E_HOME ?? ''), 'threads', threadId, 'messages.jsonl')
    const rows = () => existsSync(messagesPath)
      ? parseLuSavedTurnRows(readFileSync(messagesPath, 'utf8'))
      : []
    await browser.waitUntil(async () => rows().some(row => row.role === 'assistant' && row.id), {
      timeout: 30_000,
      timeoutMsg: 'Bootstrap assistant turn was not persisted; cannot prove native non-user role denial',
    })
    const assistantId = rows().find(row => row.role === 'assistant' && row.id)?.id
    if (!assistantId) throw new Error('Missing persisted assistant message ID')
    const currentSession = await status()
    if (currentSession.phase !== 'Ready' || currentSession.generationId !== null) {
      throw new Error('Denial probes require an idle trusted Lu model session')
    }
    const forbidden: Array<{ reason: string; threadId: string; userTurnId: string; sessionId: string; turnId: string }> = [
      { reason: 'assistant-role', threadId, userTurnId: assistantId, sessionId, turnId: randomUUID() },
      { reason: 'nonexistent-user', threadId, userTurnId: randomUUID(), sessionId, turnId: randomUUID() },
      { reason: 'nonexistent-thread', threadId: randomUUID(), userTurnId: assistantId, sessionId, turnId: randomUUID() },
      { reason: 'wrong-model-session', threadId, userTurnId: assistantId, sessionId: 's-foreign', turnId: randomUUID() },
      { reason: 'invalid-turn-id', threadId, userTurnId: assistantId, sessionId, turnId: 'not-a-uuid' },
    ]
    for (const request of forbidden) {
      const accepted = await browser.execute(async (argumentsFromWebview) => {
        const host = window as Window & {
          __TAURI_INTERNALS__?: {
            invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>
          }
        }
        if (!host.__TAURI_INTERNALS__) throw new Error('Tauri invoke missing')
        try {
          await host.__TAURI_INTERNALS__.invoke('lu_inference_native_turn', argumentsFromWebview)
          return true
        } catch {
          return false
        }
      }, {
        sessionId: request.sessionId,
        threadId: request.threadId,
        userTurnId: request.userTurnId,
        turnId: request.turnId,
      })
      if (accepted) throw new Error('Lu accepted forbidden native turn: ' + request.reason)
      const snapshot = await status()
      if (snapshot.sessionId !== sessionId || snapshot.pid !== pid ||
          snapshot.generationId !== null || snapshot.phase !== 'Ready') {
        throw new Error('Denied Lu request changed the trusted inference engine: ' + request.reason)
      }
      if (mock.streamedPrompts.length !== expectedMockCalls) {
        throw new Error('Denied Lu native request leaked to the Jan provider: ' + request.reason)
      }
    }
    console.log('LU_W02_WEBVIEW2_DENIAL_PASS cases=5 no_generation=true no_provider_leak=true')
  })

  it('W04 cancels a real reserved GGUF generation and does not strand the native engine', async () => {
    if (!sessionId || !pid) throw new Error('Lu GGUF session not loaded')
    const result = await browser.execute(async (activeSession: string) => {
      const host = window as Window & {
        __TAURI_INTERNALS__?: {
          invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>
        }
      }
      const invoke = host.__TAURI_INTERNALS__?.invoke
      if (!invoke) throw new Error('Trusted Tauri IPC unavailable')
      const accepted = await invoke('lu_inference_generate', {
        sessionId: activeSession,
        prompt: 'Continue counting aloud from 1 to 100000, one number per line, without stopping.',
        maxNewTokens: 8192,
      }) as { generationId?: string }
      if (!accepted.generationId) throw new Error('Lu did not reserve a real generation ID')
      let wrongSessionRejected = false
      try {
        await invoke('lu_inference_cancel', {
          sessionId: 's-foreign',
          generationId: accepted.generationId,
        })
      } catch {
        wrongSessionRejected = true
      }
      const cancelled = await invoke('lu_inference_cancel', {
        sessionId: activeSession,
        generationId: accepted.generationId,
      }) as { signalled?: boolean }
      return { cancelled: cancelled.signalled === true, wrongSessionRejected }
    }, sessionId)
    if (!result.cancelled || !result.wrongSessionRejected) {
      throw new Error('Lu failed to signal active generation cancellation or reject a foreign session')
    }
    await browser.waitUntil(async () => {
      const snapshot = await status()
      return snapshot.sessionId === sessionId && snapshot.pid === pid &&
        snapshot.phase === 'Ready' && snapshot.generationId === null
    }, {
      timeout: 60_000,
      timeoutMsg: 'Cancellation did not release Lu reserved generation or preserve resident model',
    })
    const unknownNativeCancellation = await browser.execute(async (activeSession: string, fakeTurnId: string) => {
      const host = window as Window & {
        __TAURI_INTERNALS__?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> }
      }
      const invoke = host.__TAURI_INTERNALS__?.invoke
      if (!invoke) throw new Error('Trusted Tauri IPC unavailable')
      return await invoke('lu_inference_native_turn_cancel', {
        sessionId: activeSession,
        turnId: fakeTurnId,
      }) as { signalled?: boolean }
    }, sessionId, randomUUID())
    if (unknownNativeCancellation.signalled !== false) {
      throw new Error('Unknown native chat turn cancellation was incorrectly acknowledged')
    }
    if (mock.streamedPrompts.length !== expectedMockCalls) {
      throw new Error('Cancellation accessed Jan-compatible model provider')
    }
    console.log('LU_W04_WEBVIEW2_CANCEL_PASS active_signal=true foreign_denied=true released=true same_pid=true')
  })

  hostFindingDxTest('DX-04 real GGUF turn yields a bounded host finding in the operator export', async () => {
    if (!sessionId || !threadId) throw new Error('Real Windows Lu GGUF session required')
    const savedPath = join(janUserDataDir(process.env.JAN_E2E_HOME ?? ''),
      'threads', threadId, 'messages.jsonl')
    const saved = parseLuSavedTurnRows(readFileSync(savedPath, 'utf8'))
    const userTurnId = saved.find(row => row.role === 'user' && row.id)?.id
    if (!userTurnId) throw new Error('Missing persisted USER turn for real native diagnostic probe')
    const turnId = randomUUID()
    // The native turn starts inside the actual WebView2 host. Do not await it
    // inside the first browser.execute: it must outlive that short script.
    await browser.execute((args: { sessionId: string; threadId: string; userTurnId: string; turnId: string }) => {
      type Probe = { settled: boolean; failed: boolean }
      const w = window as Window & {
        __luDxHostFindingProbe?: Probe
        __TAURI_INTERNALS__?: {
          invoke: (name: string, parameters: Record<string, unknown>) => Promise<unknown>
        }
      }
      if (!w.__TAURI_INTERNALS__) throw new Error('Lu Tauri IPC unavailable')
      const probe: Probe = { settled: false, failed: false }
      w.__luDxHostFindingProbe = probe
      void w.__TAURI_INTERNALS__.invoke('lu_inference_native_turn', args).then(
        () => { probe.settled = true },
        () => { probe.failed = true; probe.settled = true },
      )
    }, { sessionId, threadId, userTurnId, turnId })

    let timeoutCancelled = false
    try {
      await browser.waitUntil(async () => browser.execute(() => {
        const w = window as Window & { __luDxHostFindingProbe?: { settled: boolean } }
        return w.__luDxHostFindingProbe?.settled === true
      }), { timeout: 90_000, interval: 200,
        timeoutMsg: 'Real GGUF host turn did not settle during DX host finding acceptance' })
    } catch {
      timeoutCancelled = true
      await browser.execute(async (args: { sessionId: string; turnId: string }) => {
        const w = window as Window & {
          __TAURI_INTERNALS__?: { invoke: (command: string, params: Record<string, unknown>) => Promise<unknown> }
        }
        await w.__TAURI_INTERNALS__?.invoke('lu_inference_native_turn_cancel', args).catch(() => undefined)
      }, { sessionId, turnId })
      await browser.waitUntil(async () => browser.execute(() => {
        const w = window as Window & { __luDxHostFindingProbe?: { settled: boolean } }
        return w.__luDxHostFindingProbe?.settled === true
      }), { timeout: 20_000, interval: 200,
        timeoutMsg: 'Cancelled DX probe did not settle; cannot certify host terminal event' })
    }

    const host = await browser.execute(async () => {
      const w = window as Window & {
        __luDxHostFindingProbe?: { settled: boolean; failed: boolean }
        __TAURI_INTERNALS__?: { invoke: (name: string) => Promise<unknown> }
      }
      if (!w.__TAURI_INTERNALS__) throw new Error('Real Tauri IPC missing')
      const response = await w.__TAURI_INTERNALS__.invoke('lu_inference_diagnostics') as {
        schema?: unknown; traceRef?: unknown; recordingState?: unknown
        droppedEvents?: unknown; finding?: Record<string, unknown>
        events?: Array<{ stage?: unknown }>
      }
      const stages = Array.isArray(response.events)
        ? response.events.map(e => e.stage) : []
      const failed = w.__luDxHostFindingProbe?.failed === true
      const expectedStatus = failed ? 'bounded_host_boundary' : 'host_turn_returned'
      const expectedFirst = failed ? 'native-model-loop-returned'
        : 'assistant_persistence_unobserved'
      const finding = response.finding
      return {
        accepted: response.schema === 'lu.native.host-trace.v2' &&
          response.recordingState === 'accepted_turn' &&
          typeof response.traceRef === 'string' && /^[0-9a-f]{32}$/.test(response.traceRef),
        traceRef: typeof response.traceRef === 'string' &&
          /^[0-9a-f]{32}$/.test(response.traceRef) ? response.traceRef : '',
        noLoss: response.droppedEvents === 0,
        entered: stages.includes('native-model-loop-entered'),
        terminal: stages.includes(failed ? 'native-turn-failed' : 'native-turn-succeeded'),
        terminalTypeConsistent: failed
          ? !stages.includes('native-model-loop-returned')
          : stages.includes('native-model-loop-returned'),
        findingCorrect: finding?.schema === 'lu.native.host-finding.v1' &&
          finding.scope === 'host_only' && finding.status === expectedStatus &&
          finding.firstUnobserved === expectedFirst &&
          finding.nextProbe === (failed ? 'inspect_engine_and_native_tool_journal'
            : 'verify_assistant_persistence_and_render'),
        status: typeof finding?.status === 'string' ? finding.status : 'missing',
        failed,
      }
    })
    if (!host.accepted || !host.noLoss || !host.entered || !host.terminal ||
        !host.terminalTypeConsistent || !host.findingCorrect) {
      throw new Error('DX real host checkpoint finding did not match observed GGUF stages: ' +
        JSON.stringify({ ...host, traceRef: host.traceRef ? 'redacted' : '' }))
    }

    // Exercise the actual operator's Export diagnostics button, not merely a
    // synthetic TypeScript builder. Do not write a report to the runner disk.
    const exported = await browser.execute(async (expected: { traceRef: string; status: string; threadId: string }) => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-testid="lu-native-export-diagnostics"]')
      if (!button) throw new Error('Lu operator diagnostic export unavailable')
      const originalCreate = URL.createObjectURL
      const originalClick = HTMLAnchorElement.prototype.click
      let blob: Blob | null = null
      let name = ''
      URL.createObjectURL = (value: Blob | MediaSource) => {
        if (value instanceof Blob) blob = value
        return originalCreate(value)
      }
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        name = this.download
      }
      try {
        button.click()
        for (let i = 0; i < 200 && !(blob && name); i++) {
          await new Promise(resolve => setTimeout(resolve, 25))
        }
        const captured = blob as Blob | null
        if (!captured) return { created: false, linked: false, redacted: false }
        const content = await captured.text()
        const report = JSON.parse(content) as {
          hostTrace?: { traceRef?: unknown }
          hostFinding?: { schema?: unknown; scope?: unknown; status?: unknown; firstUnobserved?: unknown }
        }
        return {
          created: name === 'lu-native-diagnostics.json',
          linked: report.hostTrace?.traceRef === expected.traceRef &&
            report.hostFinding?.schema === 'lu.native.host-finding.v1' &&
            report.hostFinding.scope === 'host_only' &&
            report.hostFinding.status === expected.status &&
            typeof report.hostFinding.firstUnobserved === 'string',
          redacted: !content.includes(expected.threadId) &&
            !content.includes('Bootstrap this new thread before native-model selection.') &&
            !content.includes('lu-native-bootstrap-provider') &&
            !content.includes('sessionId') &&
            !content.includes('generationId') &&
            !content.includes('modelRef') &&
            !content.includes('C:\\\\Users\\\\'),
        }
      } finally {
        URL.createObjectURL = originalCreate
        HTMLAnchorElement.prototype.click = originalClick
      }
    }, { traceRef: host.traceRef, status: host.status, threadId })
    if (!exported.created || !exported.linked || !exported.redacted) {
      throw new Error('DX host finding did not survive redacted WebView2 export: ' +
        JSON.stringify(exported))
    }
    if (mock.streamedPrompts.length !== expectedMockCalls) {
      throw new Error('DX native host probe incorrectly used Jan-compatible provider')
    }
    console.log('LU_DX_HOST_FINDING_WEBVIEW2_PASS real_turn=true bounded=true redacted=true' +
      (timeoutCancelled ? ' cancelled_after_timeout=true' : ' settled=true'))
  })

  scopedDxTest('DX-01 scopes a live WebView2 GGUF host trace, rejects foreign turns, and matches the host reply', async () => {
    if (!sessionId || !pid || !threadId) throw new Error('Real GGUF must be loaded in WebView2')
    // Reuse an actual USER-role message saved by the UI bootstrap, not a
    // fabricated JSONL line or arbitrary WebView prompt. The Rust host
    // independently attests it and constructs the trusted model context.
    const savedPath = join(janUserDataDir(process.env.JAN_E2E_HOME ?? ''),
      'threads', threadId, 'messages.jsonl')
    const saved = parseLuSavedTurnRows(readFileSync(savedPath, 'utf8'))
    const userTurnId = saved.find(row => row.role === 'user' && row.id)?.id
    if (!userTurnId) throw new Error('No persisted USER-role turn to exercise real native model')

    const proof = await browser.execute(async (args: {
      sessionId: string; threadId: string; userTurnId: string
      turnId: string; foreignTurnId: string
    }) => {
      const host = window as Window & {
        __TAURI_INTERNALS__?: {
          invoke: (command: string, params?: Record<string, unknown>) => Promise<unknown>
        }
      }
      if (!host.__TAURI_INTERNALS__) throw new Error('Real Tauri WebView2 IPC missing')
      const invoke = host.__TAURI_INTERNALS__.invoke
      let settled = false
      let response: { answer?: unknown; traceRef?: unknown } | null = null
      let failure = false
      const generation = invoke('lu_inference_native_turn', {
        sessionId: args.sessionId,
        threadId: args.threadId,
        userTurnId: args.userTurnId,
        turnId: args.turnId,
      }).then(value => {
        response = value as { answer?: unknown; traceRef?: unknown }
        settled = true
      }, () => {
        failure = true
        settled = true
      })
      type Snapshot = {
        schema?: unknown; recordingState?: unknown; traceRef?: unknown
        droppedEvents?: unknown
        events?: Array<{ stage?: unknown }>
      }
      let live: Snapshot | null = null
      const deadline = Date.now() + 90_000
      while (Date.now() < deadline && !settled) {
        try {
          const candidate = await invoke('lu_inference_diagnostics', {
            turnId: args.turnId,
          }) as Snapshot
          if (candidate.schema === 'lu.native.host-trace.v2' &&
              candidate.recordingState === 'accepted_turn' &&
              typeof candidate.traceRef === 'string' &&
              /^[a-f0-9]{32}$/.test(candidate.traceRef) &&
              Array.isArray(candidate.events) &&
              candidate.events.some(event => event.stage === 'native-model-loop-entered') &&
              !settled) {
            live = candidate
            break
          }
        } catch { /* Not admitted yet: never fall back to a stale unscoped trace. */ }
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      if (!live) {
        // Avoid leaving a user task running after the probe fails.
        if (!settled) {
          await invoke('lu_inference_native_turn_cancel',
            { sessionId: args.sessionId, turnId: args.turnId }).catch(() => undefined)
        }
        await Promise.race([generation, new Promise(resolve => setTimeout(resolve, 5_000))])
        return { observedInFlight: false, foreignDenied: false,
          matchingTrace: false, nativeAnswered: false, hostUnchanged: false,
          evidenceLoss: null as number | null, generatedBeforeProbe: settled,
          nativeFailed: failure }
      }

      let foreignDenied = false
      try {
        await invoke('lu_inference_diagnostics', { turnId: args.foreignTurnId })
      } catch {
        foreignDenied = true
      }
      const afterForeign = await invoke('lu_inference_diagnostics') as Snapshot
      // The foreign request must not reset the original host trace.
      const hostUnchanged = afterForeign.traceRef === live.traceRef &&
        afterForeign.recordingState === 'accepted_turn'
      // Await actual model/tool loop completion; *only* the Rust result may
      // assert its host-minted trace reference.
      await Promise.race([generation, new Promise(resolve => setTimeout(resolve, 90_000))])
      if (!settled) {
        await invoke('lu_inference_native_turn_cancel',
          { sessionId: args.sessionId, turnId: args.turnId }).catch(() => undefined)
      }
      // The response is assigned by a Promise callback, so TypeScript cannot
      // establish its post-await value via ordinary control-flow narrowing.
      const completed = response as { answer?: unknown; traceRef?: unknown } | null
      return {
        observedInFlight: true,
        foreignDenied,
        matchingTrace: settled && !failure &&
          completed?.traceRef === live.traceRef,
        nativeAnswered: settled && !failure &&
          typeof completed?.answer === 'string' && completed.answer.trim().length > 0,
        hostUnchanged,
        evidenceLoss: typeof live.droppedEvents === 'number'
          ? live.droppedEvents : null,
        generatedBeforeProbe: false,
        nativeFailed: failure || !settled,
      }
    }, {
      sessionId, threadId, userTurnId,
      turnId: randomUUID(), foreignTurnId: randomUUID(),
    })

    if (!proof.observedInFlight || !proof.foreignDenied ||
        !proof.matchingTrace || !proof.nativeAnswered || !proof.hostUnchanged ||
        proof.nativeFailed || proof.evidenceLoss !== 0) {
      throw new Error('DX-01 live host correlation gate failed: ' + JSON.stringify(proof))
    }
    const after = await status()
    if (after.pid !== pid || after.sessionId !== sessionId || after.phase !== 'Ready') {
      throw new Error('Scoped DX probe altered the persistent native GGUF engine')
    }
    if (mock.streamedPrompts.length !== expectedMockCalls) {
      throw new Error('DX scoped probe leaked to Jan mock provider')
    }
    console.log('LU_DX01_WEBVIEW2_LIVE_SCOPE_PASS in_flight=true foreign_denied=true host_unchanged=true return_ref_matched=true real_gguf=true')
  })

  positiveTest('streams two real assistant replies with one unchanged Lu engine PID and no Jan generation', async () => {
    if (!sessionId || !pid) throw new Error('Native model was not loaded')
    const prompts = ['Reply briefly with hello.', 'Reply briefly with goodbye.']
    for (const prompt of prompts) {
      const before = (await $$(ASSISTANT_MESSAGES)).length
      await sendPrompt(prompt)
      await browser.waitUntil(async () => (await $$(ASSISTANT_MESSAGES)).length > before,
        { timeout: 120_000, timeoutMsg: 'Lu native chat did not create an assistant message' })
      await waitForStreamToFinish(120_000)
      const actual = (await browser.execute((selector: string) => {
        const replies = document.querySelectorAll(selector)
        return replies.item(replies.length - 1)?.textContent ?? ''
      }, ASSISTANT_MESSAGES)).trim()
      if (actual.length < 2 || actual.includes('Failed to')) {
        throw new Error('Native GGUF did not render a substantive assistant reply')
      }
      const after = await status()
      if (after.sessionId !== sessionId || after.pid !== pid || after.phase !== 'Ready') {
        throw new Error('Lu native engine reloaded or lost its process across turns')
      }
      if (mock.streamedPrompts.length !== expectedMockCalls) {
        throw new Error('A Lu native chat turn unexpectedly reached the Jan-compatible provider')
      }
    }
    console.log('LU_P3_WEBVIEW2_NATIVE_GGUF_PASS turns=2 same_pid=true jan_generations=0')
  })

  positiveTest('reads an isolated workspace file through Lu native Protobuf and returns the real marker', async () => {
    if (!sessionId || !threadId) throw new Error('No host-bound model session or saved conversation')
    const saved = readFileSync(join(janUserDataDir(process.env.JAN_E2E_HOME ?? ''),
      'agent-workspace', 'threads', threadId, 'notes.txt'), 'utf8')
    if (!saved.includes(marker)) throw new Error('Test-only tool file not present')
    const before = (await browser.execute((selector: string) => document.querySelectorAll(selector).length, ASSISTANT_MESSAGES))
    const requested = 'Read notes.txt using the lu_files_read_text tool. Do not guess. ' +
      'Return exactly the marker from the file in your final answer.'
    await sendPrompt(requested)
    await browser.waitUntil(async () => (await browser.execute((selector: string) => document.querySelectorAll(selector).length, ASSISTANT_MESSAGES)) > before,
      { timeout: 180_000, timeoutMsg: 'Lu native tool turn produced no assistant reply' })
    await waitForStreamToFinish(180_000)
    const reply = await browser.execute((selector: string) => {
      const nodes = document.querySelectorAll(selector)
      return nodes.item(nodes.length - 1)?.textContent ?? ''
    }, ASSISTANT_MESSAGES)
    if (!reply.includes(marker)) {
      throw new Error('The model did not return the scratch-file marker after native tool dispatch')
    }
    const panel = await $('section:has([data-testid="lu-native-chat-toggle"])')
    const text = await panel.getText()
    if (!/Last response: [1-9][0-9]* native tool call/.test(text)) {
      throw new Error('Lu desktop did not report a completed native tool call')
    }
    const current = await status()
    if (current.sessionId !== sessionId || current.pid !== pid || current.phase !== 'Ready') {
      throw new Error('Lu native inference session changed after the Protobuf tool turn')
    }
    if (mock.streamedPrompts.length !== expectedMockCalls) {
      throw new Error('Lu native tool call leaked into Jan-compatible mock provider')
    }
    console.log('LU_DESKTOP_REAL_NATIVE_TOOL_PASS marker_verified=true tool_count=true same_pid=true')
  })

  it('unloads the native model on user request', async () => {
    await $('[data-testid="lu-native-unload"]').click()
    await browser.waitUntil(async () => {
      const current = await status()
      return current.phase === 'Idle' && current.pid === null && current.sessionId === null
    }, { timeout: 45_000, timeoutMsg: 'Lu native model did not unload' })
  })
})
