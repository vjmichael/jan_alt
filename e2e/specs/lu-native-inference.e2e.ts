import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { janUserDataDir } from '../helpers/paths.js'
import { browser, $, $$ } from '@wdio/globals'
import { ASSISTANT_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { startMockOpenAI, type MockOpenAI } from '../helpers/mock-openai.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'
import { goto } from '../helpers/navigation.js'

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
  const positiveTest = process.env.LU_E2E_SECURITY_ONLY === '1' ? it.skip : it

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

  it('W02 rejects non-user, missing, cross-thread and invalid saved-turn requests before native model generation', async () => {
    if (!sessionId || !pid || !threadId) throw new Error('Native Lu session and thread required for host denial probe')
    const messagesPath = join(janUserDataDir(process.env.JAN_E2E_HOME ?? ''), 'threads', threadId, 'messages.jsonl')
    const rows = () => existsSync(messagesPath)
      ? readFileSync(messagesPath, 'utf8').split(/\\r?\\n/).filter(Boolean)
        .map(line => JSON.parse(line) as { id?: string; role?: string })
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
