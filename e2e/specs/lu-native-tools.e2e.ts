import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, $ } from '@wdio/globals'

import { ASSISTANT_MESSAGES, sendPrompt, waitForStreamToFinish } from '../helpers/chat.js'
import { goto } from '../helpers/navigation.js'
import { janUserDataDir } from '../helpers/paths.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'
import {
  startNativeToolMock,
  NATIVE_ALLOWED_CALL,
  NATIVE_DENIED_CALL,
  NATIVE_MODEL_ID,
  NATIVE_PROBE_TRIGGER,
  type NativeToolMock,
} from '../helpers/native-tool-mock.js'

const testHome = process.env.JAN_E2E_HOME!
const PROVIDER = 'lu-native-ci-provider'
const ALLOWED = 'ALLOW_ONLY_LU_THREAD_FILE_49C86'
const SECRET = 'OUTSIDE_LU_THREAD_MUST_NOT_BE_READ_59E20'

/**
 * Model -> SSE tool-call -> WebView2 chat dispatcher -> Rust Tauri IPC ->
 * Lu Protobuf model adapter -> read-only sandbox -> model tool result -> chat.
 *
 * The local model-response fixture only generates tool-call *requests*.
 * It cannot read Lu's file itself: the fixture runs in Node and receives
 * its results only over the application's genuine OpenAI-compatible channel.
 */
describe('Lu Windows model-originated native file tool gate', () => {
  let mock: NativeToolMock | undefined
  let threadId = ''
  let workspace = ''
  let canary = ''

  before(async () => {
    if (process.env.LU_E2E !== '1' || process.platform !== 'win32') {
      throw new Error('Lu native tool E2E requires isolated Windows desktop')
    }
    mock = await startNativeToolMock()
    await $('#root').waitForExist({ timeout: 60_000 })
    await configureMockProvider(mock, PROVIDER, mock.apiKey)

    // Custom providers default to completion-only; turn on Tools through
    // the genuine Edit Model GUI, not by silently forging React/zustand state.
    await goto('/settings/providers/' + PROVIDER)
    await $('[data-testid="edit-model-' + NATIVE_MODEL_ID + '"]').waitForDisplayed({
      timeout: 30_000,
    })
    await $('[data-testid="edit-model-' + NATIVE_MODEL_ID + '"]').click()
    const switcher = await $('#tools-capability')
    await switcher.waitForDisplayed({ timeout: 15_000 })
    await switcher.click()
    await $('button=Save Changes').click()
  })

  after(async () => {
    if (mock) await mock.close()
  })

  it('lets Lu create a dedicated native tool workspace for the selected chat', async () => {
    await goto('/')
    await selectModel(NATIVE_MODEL_ID)
    await sendPrompt('Initialize this Lu scratch conversation, no tools required.')
    await $(ASSISTANT_MESSAGES).waitForDisplayed({ timeout: 40_000 })
    await waitForStreamToFinish(50_000)
    await browser.waitUntil(async () => {
      const route = await browser.execute(() => window.location.pathname)
      threadId = route.startsWith('/threads/') ? route.slice('/threads/'.length) : ''
      return threadId.length > 0
    }, { timeout: 30_000 })

    const luRoot = janUserDataDir(testHome)
    workspace = join(luRoot, 'agent-workspace', 'threads', threadId)
    const parent = join(luRoot, 'agent-workspace', 'threads')
    mkdirSync(workspace, { recursive: true })
    canary = join(parent, 'outside.txt')
    writeFileSync(join(workspace, 'allowed.txt'), ALLOWED)
    writeFileSync(canary, SECRET)
    if (!existsSync(join(workspace, 'allowed.txt'))) {
      throw new Error('Lu thread scratch fixture was not created')
    }
  })

  it('dispatches allowed read and rejects escaping path through Rust with structured results', async () => {
    if (!mock || !threadId) throw new Error('Missing Lu test model or thread')
    await sendPrompt(NATIVE_PROBE_TRIGGER)

    await browser.waitUntil(
      () => mock!.toolResults.length >= 2,
      {
        timeout: 75_000,
        interval: 200,
        timeoutMsg: 'Model-issued Lu native tool calls were not returned via the chat provider',
      }
    )
    await waitForStreamToFinish(75_000)
    const toolNames = mock.requestedToolNames.flat()
    if (!toolNames.includes('lu_files_read_text') ||
        !toolNames.includes('lu_files_list_directory')) {
      throw new Error('Lu chat did not advertise the two native tools to the model')
    }

    const good = mock.toolResults.find(x => x.tool_call_id === NATIVE_ALLOWED_CALL)
    const bad = mock.toolResults.find(x => x.tool_call_id === NATIVE_DENIED_CALL)
    if (!good || !bad) {
      throw new Error('Lu model did not receive both the authorized and denied result')
    }
    if (!good.content.includes(ALLOWED)) {
      throw new Error('The real Lu host did not return the authorized thread-scoped file content')
    }
    let denied: {
      ok?: boolean
      tool?: string
      error?: { code?: string; message?: string; retryable?: boolean }
    }
    try {
      denied = JSON.parse(bad.content)
    } catch {
      throw new Error('Lu did not send a structured JSON model-tool denial')
    }
    if (denied.ok !== false ||
        denied.tool !== 'lu_files_read_text' ||
        denied.error?.code !== 'INVALID_ARGUMENTS' ||
        denied.error?.retryable !== false ||
        typeof denied.error.message !== 'string' ||
        bad.content.includes(SECRET)) {
      throw new Error('Lu native scope denial was absent, unstructured, or leaked the outside file')
    }
    if (readFileSync(canary, 'utf8') !== SECRET) {
      throw new Error('Lu native read tool unexpectedly modified the outside workspace canary')
    }

    await browser.waitUntil(async () => {
      const messages = await browser.$(ASSISTANT_MESSAGES)
      if (messages.length < 2) return false
      const text = await messages[messages.length - 1].getText()
      return text.includes('Lu native tool results received')
    }, {
      timeout: 40_000,
      timeoutMsg: 'Lu did not render the final assistant turn after model tool results',
    })
    console.log('[lu-e2e] Native Protobuf read succeeded; ../ access was denied; both outcomes reached model')
  })
})
