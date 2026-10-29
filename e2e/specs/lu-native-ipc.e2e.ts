import { browser, expect, $, $$ } from '@wdio/globals'
import { startMockOpenAI, type MockOpenAI } from '../helpers/mock-openai.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'
import { sendPrompt, USER_MESSAGES, waitForStreamToFinish } from '../helpers/chat.js'
import { goto } from '../helpers/navigation.js'

/**
 * Actual Windows Lu WebView2 -> Tauri IPC denial gate. The mock provider
 * creates a persisted conversation, but cannot admit a trusted native turn.
 * Positive Protobuf tool execution is verified by the separate real-GGUF
 * installed-worker gate; this suite must never mint tool authority itself.
 */
describe('Lu Windows desktop native Protobuf tool integration', () => {
  let mock: MockOpenAI | undefined
  let threadId = ''

  async function nativeInvoke(command: string, args: Record<string, unknown>) {
    return browser.executeAsync((name, params, done) => {
      const internal = (window as unknown as {
        __TAURI_INTERNALS__?: { invoke?: (cmd: string, data: Record<string, unknown>) => Promise<unknown> }
      }).__TAURI_INTERNALS__
      if (!internal?.invoke) {
        done({ failure: 'Tauri IPC unavailable in Windows WebView2' })
        return
      }
      internal.invoke(name, params).then(
        (result) => done({ result }),
        (reason) => done({ failure: String(reason) })
      )
    }, command, args) as Promise<{ result?: unknown; failure?: string }>
  }

  before(async () => {
    if (process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true' ||
        process.env.LU_E2E !== '1') {
      throw new Error('Lu native IPC gate requires a disposable Windows CI runner')
    }
    mock = await startMockOpenAI({ modelId: 'lu-native-ipc-fixture' })
    await $('#root').waitForExist({ timeout: 60_000 })
    await configureMockProvider(mock, 'lu-native-ipc-provider')
    await goto('/')
    await selectModel(mock.modelId)
    await sendPrompt('Create a Lu test conversation')
    await browser.waitUntil(async () => {
      const path = await browser.execute(() => window.location.pathname)
      if (!path.startsWith('/threads/')) return false
      threadId = path.slice('/threads/'.length)
      return threadId.length > 0
    }, { timeout: 45_000 })
    await waitForStreamToFinish()
    await expect($$(USER_MESSAGES)).toBeElementsArrayOfSize(1)
  })

  after(async () => { if (mock) await mock.close() })

  it('denies legacy Cowork execution and session IPC from the Lu main window', async () => {
    // Use a real, saved conversation. A denial caused by an unknown thread would
    // not establish that the native command or capability boundary is closed.
    for (const command of [
      'execute_tool',
      'execute_tool_streaming',
      'session_workspace_path',
      'session_workspace_delete',
      'session_workspace_sweep',
      'subagent_result_reserve',
      'subagent_result_fill',
      'start_monitor',
      'stop_monitor',
      'list_monitors',
      'session_monitor_ids',
      'stop_session_monitors',
      'blackboard_write',
      'preview_register_root',
      'preview_unregister_root',
      'attachment_import',
      'skill_invoke',
    ]) {
      const response = await nativeInvoke(`plugin:agent-tools|${command}`, {
        threadId,
        sessionId: 'legacy-cowork-probe',
        toolName: 'shell',
        args: {},
      })
      if (response.result !== undefined) throw new Error(`${command} unexpectedly returned a result`)
      if (!response.failure) throw new Error(`${command} unexpectedly succeeded`)
      expect(response.failure).toMatch(
        /not allowed|not found|unknown command|forbidden|denied/i
      )
    }
  })

  it('denies OS opening of caller-selected paths in the Lu WebView', async () => {
    // Deliberately nonexistent: even an incorrect grant must never launch a
    // real executable, application, private document, or user-chosen program.
    const response = await nativeInvoke('plugin:opener|open_path', {
      path: 'C:\\lu-denial-sentinel-never-created\\forbidden.txt',
    })
    if (response.result !== undefined) throw new Error('Lu reopened the legacy arbitrary path opener')
    if (!response.failure) throw new Error('Lu path opener returned no permission denial')
    expect(response.failure).toMatch(/not allowed|forbidden|denied|unknown command/i)
  })

  it('does not admit direct native tools without a saved native turn', async () => {
    for (const scope of [undefined, 'thread', 'session']) {
      const args = scope ? { threadId, scope } : { threadId }
      const catalog = await nativeInvoke('lu_native_tool_catalog', args)
      if (catalog.failure) throw new Error(catalog.failure)
      expect(catalog.result).toEqual([])

      const execution = await nativeInvoke('lu_native_tool_execute', {
        ...args,
        toolName: 'lu_files_read_text',
        callId: `direct-${scope ?? 'missing'}`,
        argumentsJson: JSON.stringify({ path: 'fixture.txt' }),
      })
      if (execution.result !== undefined) throw new Error(`Direct ${scope ?? 'missing'} scope executed a tool`)
      if (!execution.failure) throw new Error(`Direct ${scope ?? 'missing'} scope did not return a denial`)
      expect(execution.failure).toMatch(/saved native turn|denied|not allowed/i)
    }
  })

})
