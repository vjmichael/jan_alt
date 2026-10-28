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
    await waitForStreamToFinish(90_000)
    expectedMockCalls = mock.streamedPrompts.length
    if (expectedMockCalls !== 1) throw new Error('Expected exactly one mock bootstrap turn')
    await browser.waitUntil(async () =>
      (await browser.execute(() => window.location.pathname)).startsWith('/threads/'),
    { timeout: 30_000, timeoutMsg: 'Lu did not create a thread before model selection' })
  })

  after(async () => { if (mock) await mock.close() })

  it('shows a trusted catalog, loads an admitted GGUF, and explicitly selects Lu', async () => {
    const picker = await $('[data-testid="lu-native-model-select"]')
    await picker.waitForDisplayed({ timeout: 30_000 })
    if (!(await picker.isEnabled())) {
      throw new Error('Trusted Lu model catalog unavailable: check package hashes and profile seeding')
    }
    const names = await picker.$$('option')
    if (!(await names.map(async option => option.getText())).some(name =>
      name.includes('SmolLM2-135M-Instruct-Q4_K_M.gguf'))) {
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

  it('streams two real assistant replies with one unchanged Lu engine PID and no Jan generation', async () => {
    if (!sessionId || !pid) throw new Error('Native model was not loaded')
    const prompts = ['Reply briefly with hello.', 'Reply briefly with goodbye.']
    for (const prompt of prompts) {
      const before = (await $$(ASSISTANT_MESSAGES)).length
      await sendPrompt(prompt)
      await browser.waitUntil(async () => (await $$(ASSISTANT_MESSAGES)).length > before,
        { timeout: 120_000, timeoutMsg: 'Lu native chat did not create an assistant message' })
      await waitForStreamToFinish(120_000)
      const replies = await $$(ASSISTANT_MESSAGES)
      const actual = (await replies[replies.length - 1].getText()).trim()
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

  it('unloads the native model on user request', async () => {
    await $('[data-testid="lu-native-unload"]').click()
    await browser.waitUntil(async () => {
      const current = await status()
      return current.phase === 'Idle' && current.pid === null && current.sessionId === null
    }, { timeout: 45_000, timeoutMsg: 'Lu native model did not unload' })
  })
})
