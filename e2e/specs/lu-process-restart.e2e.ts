import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, relative, isAbsolute } from 'node:path'
import { browser, expect, $, $$ } from '@wdio/globals'
import { ASSISTANT_MESSAGES, USER_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { startRealGgufWorker, type RealGgufWorker } from '../helpers/local-gguf-worker.js'
import { goto } from '../helpers/navigation.js'
import { janUserDataDir } from '../helpers/paths.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'

const home = process.env.JAN_E2E_HOME!
const phase = process.env.LU_E2E_RESTART_PHASE
const checkpoint = join(home, 'lu-restart-checkpoint.json')
const prompt = 'Give a short English greeting.'
type Checkpoint = { threadId: string; prompt: string; reply: string; modelId: string }

function assertRunnerIsolation() {
  const root = resolve(process.env.RUNNER_TEMP ?? '')
  const path = resolve(home)
  const sub = relative(root, path)
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
      !process.env.RUNNER_TEMP || !sub || sub === '..' ||
      sub.startsWith('../') || sub.startsWith('..\\') || isAbsolute(sub)) {
    throw new Error('Lu restart E2E requires a profile nested under Windows runner temporary storage')
  }
}

describe('Lu genuine Windows desktop restart — separate WDIO processes', () => {
  let worker: RealGgufWorker | undefined
  before(async () => {
    assertRunnerIsolation()
    if (phase !== 'write' && phase !== 'read') throw new Error('Invalid LU_E2E_RESTART_PHASE')
    if (phase === 'write') {
      if (existsSync(checkpoint)) throw new Error('Existing restart checkpoint must not be overwritten')
      worker = await startRealGgufWorker()
      await $('#root').waitForExist({ timeout: 60_000 })
      await configureMockProvider(worker, 'lu-restart-local-gguf', worker.apiKey)
    } else {
      if (!existsSync(checkpoint)) {
        throw new Error('Missing process-A checkpoint; second process cannot claim restoration')
      }
      // A new worker is intentionally needed: process A closed its worker and
      // the previous loopback URL/bearer token must not accidentally work.
      worker = await startRealGgufWorker()
    }
  })
  after(async () => { if (worker) await worker.close() })

  it('writes real GGUF chat and a disk checkpoint in process A', async function () {
    if (phase !== 'write') this.skip()
    if (!worker) throw new Error('GGUF worker not initialized')
    await goto('/')
    await selectModel(worker.modelId)
    await sendPrompt(prompt)
    let threadId = ''
    await browser.waitUntil(async () => {
      const route = await browser.execute(() => window.location.pathname)
      if (!route.startsWith('/threads/')) return false
      threadId = route.slice('/threads/'.length)
      return !!threadId
    }, { timeout: 45_000 })
    await $(ASSISTANT_MESSAGES).waitForDisplayed({ timeout: 120_000 })
    await waitForStreamToFinish(120_000)
    const replies = await $(ASSISTANT_MESSAGES).getElements()
    const reply = (await replies[replies.length - 1].getText()).trim()
    if (reply.length < 2 || reply.includes('Failed to')) throw new Error('No valid model-generated answer')
    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(1)
    const threadDir = join(janUserDataDir(home), 'threads', threadId)
    await browser.waitUntil(() => existsSync(threadDir), {
      timeout: 30_000, timeoutMsg: 'Native thread directory absent before process shutdown',
    })
    // Checkpoint is owned by the test harness, never written in app thread storage.
    writeFileSync(checkpoint, JSON.stringify({ threadId, prompt, reply, modelId: worker.modelId } satisfies Checkpoint), { flag: 'wx' })
  })

  it('loads identical conversation in independent process B', async function () {
    if (phase !== 'read') this.skip()
    const saved = JSON.parse(readFileSync(checkpoint, 'utf8')) as Checkpoint
    if (!saved.threadId || !saved.reply || !saved.prompt) throw new Error('Invalid phase-A checkpoint')
    if (!worker) throw new Error('Independent phase-B model worker did not start')
    await $('#root').waitForExist({ timeout: 60_000 })
    await goto('/')
    await $('[data-testid="model-selector-trigger"]').waitForDisplayed({ timeout: 60_000 })
    await goto('/threads/' + saved.threadId)
    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(1)
    await expect($$(ASSISTANT_MESSAGES)).toBeElementsArrayOfSize(1)
    const user = (await $(USER_MESSAGES).getText()).trim()
    const answer = (await $(ASSISTANT_MESSAGES).getText()).trim()
    if (!user.includes(saved.prompt) || answer !== saved.reply) {
      throw new Error('Saved conversation differs after full Lu process shutdown and relaunch')
    }
    // Rebind to an independently spawned authenticated inference worker and
    // continue *the same* persisted thread. Old worker credentials cannot work.
    await configureMockProvider(worker, 'lu-restart-phase-b-gguf', worker.apiKey)
    await goto('/threads/' + saved.threadId)
    await selectModel(worker.modelId)
    await sendPrompt('Reply with a short English farewell.')
    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(2)
    await browser.waitUntil(async () => {
      const replies = await $(ASSISTANT_MESSAGES).getElements()
      if (replies.length !== 2) return false
      const final = (await replies[1].getText()).trim()
      return final.length >= 2 && !final.includes('Failed to')
    }, { timeout: 120_000, timeoutMsg: 'Restarted Lu did not resume inference on restored thread' })
    await waitForStreamToFinish(120_000)
    const restoredFirst = (await (await $(ASSISTANT_MESSAGES).getElements())[0].getText()).trim()
    if (restoredFirst !== saved.reply) throw new Error('Resuming chat mutated the original assistant answer')
  })
})
