import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $, expect } from '@wdio/globals'

import { ASSISTANT_MESSAGES, USER_MESSAGES } from '../helpers/chat.js'
import { goto } from '../helpers/navigation.js'
import { janDataDir, janUserDataDir } from '../helpers/paths.js'

const testHome = process.env.JAN_E2E_HOME!
const marker = join(testHome, 'lu-restart-evidence.json')

type RestartEvidence = {
  version: number
  threadId: string
  prompt: string
  reply: string
  profile: string
}

describe('Lu process-restart persistence: launch 2 restores real chat', () => {
  it('restores the conversation from native Lu disk storage in a NEW Lu desktop process', async () => {
    if (process.env.LU_E2E_PROCESS_RESTART !== '1' ||
        process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true') {
      throw new Error('Lu restart verification may only run on disposable Windows GitHub Actions')
    }
    if (!existsSync(marker)) {
      throw new Error('First Lu desktop instance did not leave restart evidence')
    }

    const evidence = JSON.parse(readFileSync(marker, 'utf8')) as RestartEvidence
    if (evidence.version !== 1 ||
        !/^[a-zA-Z0-9_-]{6,128}$/.test(evidence.threadId) ||
        !evidence.prompt.startsWith('LU_RESTART_DISK_PROBE_381F') ||
        evidence.profile !== janUserDataDir(testHome)) {
      throw new Error('Lu restart marker has invalid provenance or profile')
    }
    const nativeThread = join(evidence.profile, 'threads', evidence.threadId)
    if (!existsSync(nativeThread)) {
      throw new Error('Lu native chat folder vanished between full process launches')
    }
    if (!existsSync(janDataDir(testHome))) {
      throw new Error('Lu app settings folder vanished across process restart')
    }

    // A fresh WebView2 process should find the saved provider after Rust
    // initialization, with no running local model service required just to
    // open stored chats. The prior mock was deliberately closed by launch 1.
    await $('#root').waitForExist({ timeout: 60_000 })
    await goto('/')
    await $('[data-testid="model-selector-trigger"]').waitForDisplayed({
      timeout: 60_000,
      timeoutMsg: 'Second Lu process failed to restore persisted model/provider selection',
    })

    await goto('/threads/' + evidence.threadId)
    const userTurn = await $(USER_MESSAGES)
    const assistantTurn = await $(ASSISTANT_MESSAGES)
    await userTurn.waitForDisplayed({ timeout: 60_000 })
    await assistantTurn.waitForDisplayed({ timeout: 60_000 })
    await expect(userTurn).toHaveText(expect.stringContaining(evidence.prompt))
    await expect(assistantTurn).toHaveText(expect.stringContaining(evidence.reply))
    const actualRoute = await browser.execute(() => window.location.pathname)
    if (actualRoute !== '/threads/' + evidence.threadId) {
      throw new Error('New Lu desktop process opened a different thread')
    }

    console.log('[lu-e2e] Launch 2 restored identical assistant and user turns from Lu profile.')
  })
})
