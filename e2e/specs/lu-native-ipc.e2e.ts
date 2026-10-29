import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { browser, expect, $, $$ } from '@wdio/globals'
import { startMockOpenAI, type MockOpenAI } from '../helpers/mock-openai.js'
import { configureMockProvider, selectModel } from '../helpers/provider.js'
import { sendPrompt, USER_MESSAGES, waitForStreamToFinish } from '../helpers/chat.js'
import { goto } from '../helpers/navigation.js'
import { janUserDataDir } from '../helpers/paths.js'

/**
 * Actual Windows Lu WebView2 -> Tauri IPC -> Protobuf native-tool gate.
 * The provider's chat reply is mocked; tool execution is real. This is an
 * app-integration prerequisite, NOT a model-generated tool-call test.
 */
describe('Lu Windows desktop native Protobuf tool integration', () => {
  let mock: MockOpenAI | undefined
  let threadId = ''
  const home = process.env.JAN_E2E_HOME!

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

  it('advertises only the two scoped Lu-native read-only tools', async () => {
    const response = await nativeInvoke('lu_native_tool_catalog', { threadId })
    if (response.failure) throw new Error(response.failure)
    const catalog = response.result as Array<{ function?: { name?: string } }>
    expect(catalog.map(x => x.function?.name).sort()).toEqual([
      'lu_files_list_directory', 'lu_files_read_text',
      'lu_files_search_text', 'lu_files_stat',
    ])
  })

  it('executes a real authorized Protobuf file read and rejects traversal', async () => {
    // The host defines the root; this fixture is never an untrusted model path.
    const workspace = join(janUserDataDir(home), 'agent-workspace', 'threads', threadId)
    // The application data_folder is itself the "data" folder, not the profile root.
    mkdirSync(workspace, { recursive: true })
    writeFileSync(join(workspace, 'fixture.txt'), 'LU_NATIVE_IPC_VERIFIED', { flag: 'wx' })
    const call = async (callId: string, path: string) => nativeInvoke('lu_native_tool_execute', {
      threadId, toolName: 'lu_files_read_text', callId, argumentsJson: JSON.stringify({ path }),
    })
    const success = await call('ipc-success', 'fixture.txt')
    if (success.failure) throw new Error(success.failure)
    expect(success.result).toMatchObject({
      ok: true, tool: 'lu_files_read_text',
      result: { content: 'LU_NATIVE_IPC_VERIFIED' },
    })
    const rejected = await call('ipc-traversal', '../fixture.txt')
    expect(rejected.failure || JSON.stringify(rejected.result)).toMatch(/INVALID|rejected|path/i)
    const unknown = await nativeInvoke('lu_native_tool_execute', {
      threadId, toolName: 'shell', callId: 'ipc-unknown', argumentsJson: '{}',
    })
    expect(unknown.failure || JSON.stringify(unknown.result)).toMatch(/unknown|rejected|tool/i)
    if (!existsSync(join(workspace, 'fixture.txt'))) throw new Error('Test fixture unexpectedly removed')
  })
  it('executes stat and literal text search through real Lu Protobuf tools', async () => {
    const workspace = join(janUserDataDir(home), 'agent-workspace', 'threads', threadId)
    mkdirSync(workspace, { recursive: true })
    const file = join(workspace, 'inspection-fixture.txt')
    writeFileSync(file, 'alpha\nLu native search marker\nomega\n')
    const run = async (toolName: string, callId: string, input: Record<string, unknown>) =>
      nativeInvoke('lu_native_tool_execute', {
        threadId, toolName, callId, argumentsJson: JSON.stringify(input),
      })
    const metadata = await run('lu_files_stat', 'stat-success', { path: 'inspection-fixture.txt' })
    if (metadata.failure) throw new Error(metadata.failure)
    expect(metadata.result).toMatchObject({ ok: true, result: { kind: 'file' } })
    const search = await run('lu_files_search_text', 'search-success', { query: 'Lu native search marker' })
    if (search.failure) throw new Error(search.failure)
    expect(search.result).toMatchObject({
      ok: true, result: { hits: [{ path: 'inspection-fixture.txt', line_number: 2 }] },
    })
    const rejected = await run('lu_files_search_text', 'search-reject', { path: '..', query: 'marker' })
    expect(rejected.failure || JSON.stringify(rejected.result)).toMatch(/INVALID|rejected|path/i)
  })

})
