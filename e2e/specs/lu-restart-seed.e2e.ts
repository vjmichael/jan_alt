import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $, expect } from '@wdio/globals'

import { ASSISTANT_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { startMockOpenAI, MOCK_REPLY_PREFIX, type MockOpenAI } from '../helpers/mock-openai.js'
import { goto } from '../helpers/navigation.js'
import { janUserDataDir } from '../helpers/paths.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'

const testHome = process.env.JAN_E2E_HOME!
const modelId = 'lu-process-restart-echo-model'
const providerName = 'lu-restart-provider'
const prompt = 'LU_RESTART_DISK_PROBE_381F model chat saved before complete process termination'
const marker = join(testHome, 'lu-restart-evidence.json')

describe('Lu process-restart persistence: launch 1 creates real chat', () => {
  let mock: MockOpenAI | undefined

  before(async () => {
    if (process.env.LU_E2E_PROCESS_RESTART !== '1' ||
        process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Lu restart seed must run on disposable Windows GitHub Actions')
    }
    if (existsSync(marker)) {
      throw new Error('Lu restart marker already exists; test profile is not fresh')
    }
    mock = await startMockOpenAI({ modelId })
    await $('#root').waitForExist({ timeout: 60_000 })
    await configureMockProvider(mock, providerName)
  })

  after(async () => {
    if (mock) await mock.close()
  })

  it('streams a model reply and saves the Lu thread to disk before process shutdown', async () => {
    await goto('/')
    await selectModel(modelId)
    await sendPrompt(prompt)
    const reply = await $(ASSISTANT_MESSAGES)
    await reply.waitForDisplayed({ timeout: 60_000 })
    await expect(reply).toHaveText(expect.stringContaining(MOCK_REPLY_PREFIX + prompt))
    await waitForStreamToFinish(60_000)

    let threadId = ''
    await browser.waitUntil(async () => {
      const route = await browser.execute(() => window.location.pathname)
      threadId = route.startsWith('/threads/') ? route.slice('/threads/'.length) : ''
      return threadId.length > 0
    }, { timeout: 25_000, timeoutMsg: 'Lu did not navigate to the persisted thread on first launch' })

    const folder = join(janUserDataDir(testHome), 'threads', threadId)
    await browser.waitUntil(() => existsSync(folder), {
      timeout: 30_000,
      timeoutMsg: 'First Lu desktop process did not persist its chat to the Lu profile',
    })

    // The handoff marker is test metadata, never a replacement for Lu's actual
    // stored thread data. Only the genuine desktop thread folder is verified.
    writeFileSync(marker, JSON.stringify({
      version: 1,
      threadId,
      prompt,
      reply: MOCK_REPLY_PREFIX + prompt,
      profile: janUserDataDir(testHome),
    }), { encoding: 'utf8', flag: 'wx' })
    console.log('[lu-e2e] Launch 1 saved Lu chat thread ' + threadId + ' to isolated profile.')
  })
})
