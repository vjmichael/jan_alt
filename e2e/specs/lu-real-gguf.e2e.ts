import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $, $$ } from '@wdio/globals'

import { ASSISTANT_MESSAGES, USER_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { startRealGgufWorker, type RealGgufWorker } from '../helpers/local-gguf-worker.js'
import { goto } from '../helpers/navigation.js'
import { janUserDataDir } from '../helpers/paths.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'

const testHome = process.env.JAN_E2E_HOME!
const PROMPT = 'Give a very short greeting in English.'

/**
 * Real local GGUF through Lu's actual Windows WebView2 chat UI.
 *
 * This test intentionally creates an OpenAI-compatible LOCAL provider that
 * points to the packaged llama.cpp worker. It covers model choice, WebView2,
 * Rust HTTP transport, GGUF decoding, streamed assistant DOM text and thread
 * persistence. It does not cover native llamacpp model-import UI, Lu tool
 * calls, nor a full desktop process restart.
 */
describe('Lu Windows graphical chat -> real bundled GGUF worker', () => {
  let local: RealGgufWorker | undefined
  let threadId = ''
  let responseText = ''

  before(async () => {
    local = await startRealGgufWorker()
    await $('#root').waitForExist({ timeout: 60_000 })
    await configureMockProvider(local, 'lu-gguf-loopback', local.apiKey)
  })

  after(async () => {
    if (local) await local.close()
  })

  it('selects a local GGUF worker through Lu and renders streamed generated tokens', async () => {
    if (!local) throw new Error('The real GGUF worker did not start')
    await goto('/')
    await selectModel(local.modelId)
    await sendPrompt(PROMPT)

    await browser.waitUntil(async () => {
      const route = await browser.execute(() => window.location.pathname)
      if (!route.startsWith('/threads/')) return false
      threadId = route.slice('/threads/'.length)
      return threadId.length > 0
    }, { timeout: 45_000, timeoutMsg: 'Lu UI did not create a thread for the local GGUF message' })

    await $(ASSISTANT_MESSAGES).waitForDisplayed({
      timeout: 120_000,
      timeoutMsg: 'Lu did not render a local GGUF assistant message after sending',
    })
    await waitForStreamToFinish(120_000)

    const turns = await $$(ASSISTANT_MESSAGES).getElements()
    if (turns.length < 1) throw new Error('Lu did not retain the GGUF assistant turn')
    responseText = (await turns[turns.length - 1].getText()).trim()
    if (responseText.length < 2 ||
        responseText.includes('Failed to fetch') ||
        responseText.includes('Failed to generate')) {
      throw new Error('Lu chat did not contain an actual local GGUF response')
    }
    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(1)
    console.log('[lu-e2e] Real GGUF response was streamed into WebView2 (' +
      responseText.length + ' characters)')
  })

  it('restores the generated GGUF response from Rust thread storage after webview reload', async () => {
    if (!threadId || !responseText) throw new Error('No completed GGUF chat to restore')
    const threadFolder = join(janUserDataDir(testHome), 'threads', threadId)
    await browser.waitUntil(() => existsSync(threadFolder), {
      timeout: 30_000,
      timeoutMsg: 'GGUF conversation did not reach Lu native thread storage on disk',
    })

    // Deep-path refresh would produce an asset-protocol 404. Refresh the SPA
    // at / and push to the existing thread, matching the normal UI test.
    await goto('/')
    await browser.refresh()
    await $('#root').waitForExist({ timeout: 60_000 })
    await goto('/threads/' + threadId)

    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(1)
    await expect($$(ASSISTANT_MESSAGES)).toBeElementsArrayOfSize(1)
    const restored = await $(ASSISTANT_MESSAGES).getText()
    if (!restored.includes(responseText.slice(0, Math.min(24, responseText.length)))) {
      throw new Error('The persisted Lu GGUF transcript differs after webview reload')
    }
    console.log('[lu-e2e] Real model text restored from isolated Lu thread storage')
  })
})
