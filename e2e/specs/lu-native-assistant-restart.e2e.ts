import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { browser, $, $$ } from '@wdio/globals'
import { ASSISTANT_MESSAGES, USER_MESSAGES, waitForStreamToFinish } from '../helpers/chat.js'
import { janUserDataDir } from '../helpers/paths.js'
import { goto } from '../helpers/navigation.js'

// Process-A failure reports fixed status codes only; never upload test profile.
/** Two separately launched real Windows Lu WebView2/host processes, same
 * disposable data root, one real native GGUF reply. Never user AppData. */
const home = process.env.JAN_E2E_HOME ?? ''
const phase = process.env.LU_E2E_NATIVE_RESTART_PHASE
const checkpoint = join(home, 'lu-dx-native-restart-checkpoint.json')
const prompt = 'Give a short English greeting.'
type Checkpoint = {
  threadId: string; assistantId: string; answer: string; savedContentHash: string
}
type Stored = { id?: unknown; role?: unknown; content?: unknown; thread_id?: unknown }
const hash = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex')
const safeThreadId = (id: string) => /^(?:[0-9a-f-]{36}|[0-9A-HJKMNP-TV-Z]{26})$/.test(id)

function requireRunnerProfile() {
  const root = process.env.RUNNER_TEMP
  const sub = root && home ? relative(resolve(root), resolve(home)) : ''
  if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
      process.env.LU_E2E !== '1' || !root || !sub || sub === '..' ||
      sub.startsWith('../') || sub.startsWith('..\\') || isAbsolute(sub)) {
    throw new Error('Native restart test requires a disposable Windows runner profile')
  }
  if (phase !== 'write' && phase !== 'read') throw new Error('Invalid native restart phase')
}
function savedMessages(threadId: string): Stored[] {
  if (!safeThreadId(threadId)) throw new Error('Untrusted thread ID in test checkpoint')
  const file = join(janUserDataDir(home), 'threads', threadId, 'messages.jsonl')
  if (!existsSync(file)) return []
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
    const parsed: unknown = JSON.parse(line)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid persisted message JSONL object')
    }
    return parsed as Stored
  })
}
async function diagnosticDelivery(): Promise<{
  readback: unknown; reactCommit: unknown; safe: boolean
  hostStatus: string; lastStage: string; correlation: string
  hostRegion: string; hostLast: string; hostFirst: string; nextProbe: string
}> {
  return browser.execute(async () => {
    const button = document.querySelector<HTMLButtonElement>(
      '[data-testid="lu-native-export-diagnostics"]')
    if (!button) throw new Error('Lu operator diagnostic export missing')
    const originalUrl = URL.createObjectURL
    const originalClick = HTMLAnchorElement.prototype.click
    let blob: Blob | null = null
    URL.createObjectURL = (data: Blob | MediaSource) => {
      if (data instanceof Blob) blob = data
      return originalUrl(data)
    }
    HTMLAnchorElement.prototype.click = function () { /* capture only, never download */ }
    try {
      button.click()
      for (let i = 0; i < 160 && !blob; i++) {
        await new Promise(resolve => setTimeout(resolve, 25))
      }
      const result = blob as Blob | null
      if (!result) throw new Error('No Lu diagnostic payload was created')
      const json = await result.text()
      const parsed = JSON.parse(json) as {
        assistantDelivery?: { scope?: unknown; readback?: unknown; reactCommit?: unknown }
        hostFinding?: { status?: unknown; faultRegion?: unknown; lastObserved?: unknown;
          firstUnobserved?: unknown; nextProbe?: unknown }
        hostTrace?: { events?: Array<{ stage?: unknown }> }
        correlation?: { status?: unknown }
      }
      return {
        readback: parsed.assistantDelivery?.readback,
        reactCommit: parsed.assistantDelivery?.reactCommit,
        hostStatus: typeof parsed.hostFinding?.status === 'string'
          ? parsed.hostFinding.status : 'unavailable',
        hostRegion: typeof parsed.hostFinding?.faultRegion === 'string'
          ? parsed.hostFinding.faultRegion : 'unavailable',
        hostLast: typeof parsed.hostFinding?.lastObserved === 'string'
          ? parsed.hostFinding.lastObserved : 'unavailable',
        hostFirst: typeof parsed.hostFinding?.firstUnobserved === 'string'
          ? parsed.hostFinding.firstUnobserved : 'unavailable',
        nextProbe: typeof parsed.hostFinding?.nextProbe === 'string'
          ? parsed.hostFinding.nextProbe : 'unavailable',
        lastStage: typeof parsed.hostTrace?.events?.at(-1)?.stage === 'string'
          ? parsed.hostTrace.events.at(-1)!.stage as string : 'unavailable',
        correlation: typeof parsed.correlation?.status === 'string'
          ? parsed.correlation.status : 'unavailable',
        safe: parsed.assistantDelivery?.scope === 'webview_only' &&
          !json.includes('Give a short English greeting.') &&
          !json.includes('lu-dx-native-restart') &&
          !json.includes('assistantId') && !json.includes('threadId'),
      }
    } finally {
      URL.createObjectURL = originalUrl
      HTMLAnchorElement.prototype.click = originalClick
    }
  })
}

describe('DX-15E: native GGUF assistant cold process restart', () => {
  before(async () => {
    requireRunnerProfile()
    if (phase === 'write') {
      if (existsSync(checkpoint)) throw new Error('Refusing to overwrite a prior restart witness')
      await $('#root').waitForExist({ timeout: 60_000 })
    } else if (!existsSync(checkpoint)) {
      throw new Error('Phase B cannot run without phase A saved witness')
    }
  })
  it('Process A generates real native GGUF answer, confirms storage and exits', async function () {
    if (phase !== 'write') this.skip()
    await goto('/')
    await $('[data-testid="lu-native-model-select"]').waitForDisplayed({ timeout: 30_000 })
    const catalog = await browser.execute(() => Array.from(
      document.querySelectorAll('[data-testid="lu-native-model-select"] option'),
      option => option.textContent ?? ''))
    if (!catalog.some(name => name.includes('qwen2.5-0.5b-instruct-q4_k_m.gguf'))) {
      throw new Error('Pinned Lu GGUF not present in isolated model catalog')
    }
    await $('[data-testid="lu-native-load"]').click()
    await browser.waitUntil(async () => browser.execute(async () => {
      const host = window as Window & {
        __TAURI_INTERNALS__?: { invoke: (cmd: string) => Promise<{ phase?: string; pid?: number }> }
      }
      const s = await host.__TAURI_INTERNALS__?.invoke('lu_inference_status')
      return s?.phase === 'Ready' && typeof s.pid === 'number' && s.pid > 0
    }), { timeout: 120_000, timeoutMsg: 'Pinned GGUF failed to load in native Lu host' })
    await $('[data-testid="lu-native-chat-toggle"]').click()
    if (!(await $('[data-testid="lu-native-chat-toggle"]').isSelected())) {
      throw new Error('Native chat opt-in did not activate')
    }
    await $('[data-testid="lu-native-first-message"]').setValue(prompt)
    await $('[data-testid="lu-native-first-send"]').click()
    let threadId = ''
    await browser.waitUntil(async () => {
      const path = await browser.execute(() => window.location.pathname)
      threadId = path.startsWith('/threads/') ? path.split('/')[2] ?? '' : ''
      return safeThreadId(threadId)
    }, { timeout: 45_000, timeoutMsg: 'No persisted Lu-native first-turn thread' })
    if (await $('[data-testid="lu-native-first-message"]').isExisting()) {
      throw new Error('First native chat did not navigate to its saved thread')
    }
    const before = 0
    try {
      await browser.waitUntil(async () => (await browser.execute((selector: string) =>
        document.querySelectorAll(selector).length, ASSISTANT_MESSAGES)) > before, {
        timeout: 180_000, timeoutMsg: 'Native GGUF created no assistant UI message',
      })
    } catch {
      // Export only fixed diagnostic enums/stages. Never print the WebView DOM,
      // model text, saved JSONL, IDs or arbitrary host exception strings.
      const receipt = await diagnosticDelivery().catch(() => null)
      const safe = receipt?.safe === true ? receipt : null
      throw new Error('Native GGUF created no assistant UI message; ' +
        `host=${safe?.hostStatus ?? 'unavailable'} ` +
        `region=${safe?.hostRegion ?? 'unavailable'} ` +
        `lastConfirmed=${safe?.hostLast ?? 'unavailable'} ` +
        `firstUnconfirmed=${safe?.hostFirst ?? 'unavailable'} ` +
        `nextProbe=${safe?.nextProbe ?? 'unavailable'} ` +
        `last=${safe?.lastStage ?? 'unavailable'} ` +
        `correlation=${safe?.correlation ?? 'unavailable'} ` +
        `readback=${safe?.readback ?? 'unavailable'} ` +
        `react=${safe?.reactCommit ?? 'unavailable'}`)
    }
    await waitForStreamToFinish(180_000)
    const replies = await $$(ASSISTANT_MESSAGES)
    const answer = (await replies[(await replies.length) - 1].getText()).trim()
    if (answer.length < 2 || answer.includes('Failed to')) {
      throw new Error('Native GGUF reply was empty or failed')
    }
    await browser.waitUntil(() =>
      savedMessages(threadId).filter(row => row.role === 'assistant').length > before, {
      timeout: 60_000, timeoutMsg: 'Native assistant was visible but not written to JSONL',
    })
    const persisted = savedMessages(threadId).filter(row => row.role === 'assistant')
    const latest = persisted[persisted.length - 1]
    if (typeof latest.id !== 'string' || !latest.id || latest.content === undefined) {
      throw new Error('Saved native assistant lacks a persisted ID or content')
    }
    await browser.waitUntil(async () => {
      const receipt = await diagnosticDelivery()
      return receipt.readback === 'confirmed' && receipt.reactCommit === 'observed' && receipt.safe
    }, { timeout: 30_000, timeoutMsg: 'DX-15D WebView readback or React commit was not confirmed' })
    writeFileSync(checkpoint, JSON.stringify({
      threadId, assistantId: latest.id, answer,
      savedContentHash: hash(latest.content),
    } satisfies Checkpoint), { flag: 'wx' })
    console.log('LU_DX_NATIVE_RESTART_PHASE_A_PASS model=native_gguf readback=confirmed react=committed')
  })

  it('Process B restores the exact native assistant with no model regeneration', async function () {
    if (phase !== 'read') this.skip()
    const witness = JSON.parse(readFileSync(checkpoint, 'utf8')) as Checkpoint
    if (!safeThreadId(witness.threadId) ||
        typeof witness.assistantId !== 'string' || !witness.assistantId ||
        typeof witness.answer !== 'string' || !witness.answer ||
        !/^[a-f0-9]{64}$/.test(witness.savedContentHash)) {
      throw new Error('Invalid independent process-A checkpoint')
    }
    await $('#root').waitForExist({ timeout: 60_000 })
    // No model is loaded or prompted by phase B: restoration must come from storage.
    await goto('/')
    await $('[data-testid="lu-native-first-message"]').waitForDisplayed({ timeout: 60_000 })
    await goto('/threads/' + witness.threadId)
    await browser.waitUntil(async () => (await browser.execute((selector: string) =>
      document.querySelectorAll(selector).length, ASSISTANT_MESSAGES)) >= 1, {
      timeout: 60_000, timeoutMsg: 'Native reply not restored by new Lu process',
    })
    const replies = await $$(ASSISTANT_MESSAGES)
    const answer = (await replies[(await replies.length) - 1].getText()).trim()
    if (answer !== witness.answer) {
      throw new Error('Native reply changed after cold Windows Lu restart')
    }
    if ((await browser.execute((selector: string) =>
      document.querySelectorAll(selector).length, USER_MESSAGES)) < 1) {
      throw new Error('Saved native user turn missing after restart')
    }
    const saved = savedMessages(witness.threadId).filter(row =>
      row.role === 'assistant' && row.id === witness.assistantId)
    if (saved.length !== 1 || hash(saved[0].content) !== witness.savedContentHash) {
      throw new Error('Native assistant record was missing or modified on new Lu process')
    }
    // In this second process no model generation is requested. The saved
    // text must originate from disk, not in-memory state or a new inference.
    console.log('LU_DX_NATIVE_RESTART_PHASE_B_PASS source=saved_jsonl new_process=true')
  })
})
