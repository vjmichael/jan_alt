import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

import {
  executeLuNativeTool,
  getLuNativeToolSchemas,
  LU_NATIVE_TOOL_NAMES,
} from '../luNativeTools'

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.isTauri.mockReset()
  mocks.isTauri.mockReturnValue(true)
})

describe('Lu first-party native desktop tool adapter', () => {
  const schema = (name: string) => ({
    type: 'function',
    function: {
      name,
      description: 'Read-only Lu workspace tool',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  })

  it('advertises only Lu-owned default tools provided by the host', async () => {
    mocks.invoke.mockResolvedValue([
      schema('lu_files_read_text'),
      schema('lu_files_list_directory'),
      schema('lu_files_stat'),
      schema('lu_files_search_text'),
      schema('malicious_override'),
    ])
    const schemas = await getLuNativeToolSchemas('thread-a')
    expect(schemas.map((s) => s.function.name)).toEqual([
      'lu_files_read_text',
      'lu_files_list_directory',
      'lu_files_stat',
      'lu_files_search_text',
    ])
    expect(LU_NATIVE_TOOL_NAMES.size).toBe(4)
    expect(mocks.invoke).toHaveBeenCalledWith('lu_native_tool_catalog', {
      threadId: 'thread-a',
    })
  })

  it('rejects malformed host catalog entries and prevents extra tool exposure', async () => {
    mocks.invoke.mockResolvedValue([
      schema('lu_files_read_text'),
      { type: 'function', function: { name: 'lu_files_list_directory', description: 123, parameters: { type: 'object' } } },
      { type: 'function', function: { name: 'shell', description: 'unsafe', parameters: { type: 'object' } } },
      { type: 'function', function: { name: 'lu_files_read_text', description: 'bad schema', parameters: { type: 'string' } } },
    ])
    const catalog = await getLuNativeToolSchemas('thread-probe')
    expect(catalog.map(x => x.function.name)).toEqual(['lu_files_read_text'])
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })

  it('requests Cowork session namespace without a caller-controlled root', async () => {
    mocks.invoke.mockResolvedValue({ ok: true, tool: 'lu_files_read_text', result: {} })
    await getLuNativeToolSchemas('session-a', 'session')
    await executeLuNativeTool('lu_files_read_text', {}, 'session-a', 'call-b', 'session')
    expect(mocks.invoke).toHaveBeenCalledWith('lu_native_tool_catalog', {
      threadId: 'session-a', scope: 'session',
    })
    expect(mocks.invoke).toHaveBeenCalledWith('lu_native_tool_execute', {
      threadId: 'session-a', scope: 'session', toolName: 'lu_files_read_text',
      callId: 'call-b', argumentsJson: '{}',
    })
  })

  it('sends model arguments and thread scope to Rust, not a caller filesystem root', async () => {
    mocks.invoke.mockResolvedValue({
      ok: true,
      tool: 'lu_files_read_text',
      result: { content: 'hello', truncated: false },
    })
    const result = await executeLuNativeTool(
      'lu_files_read_text',
      { path: 'hello.txt' },
      'thread-a',
      'call-a'
    )
    expect(result.error).toBeUndefined()
    expect(JSON.parse(result.content ?? '{}')).toMatchObject({
      ok: true,
      result: { content: 'hello' },
    })
    expect(mocks.invoke).toHaveBeenCalledWith('lu_native_tool_execute', {
      threadId: 'thread-a',
      toolName: 'lu_files_read_text',
      callId: 'call-a',
      argumentsJson: '{"path":"hello.txt"}',
    })
  })

  it('preserves structured native failure output', async () => {
    mocks.invoke.mockResolvedValue({
      ok: false,
      tool: 'lu_files_read_text',
      error: { code: 'FILE_ACCESS', message: 'not found', retryable: false },
    })
    const result = await executeLuNativeTool(
      'lu_files_read_text', { path: 'missing.txt' }, 'thread-a', 'call-a'
    )
    expect(JSON.parse(result.content ?? '{}').error.code).toBe('FILE_ACCESS')
  })

  it('refuses unknown tools and mismatched Rust result names', async () => {
    expect((await executeLuNativeTool('shell', {}, 'thread-a', 'a')).error)
      .toContain('unknown native tool')
    expect(mocks.invoke).not.toHaveBeenCalled()
    mocks.invoke.mockResolvedValue({
      ok: true, tool: 'different', result: {},
    })
    expect((await executeLuNativeTool(
      'lu_files_list_directory', {}, 'thread-a', 'b'
    )).error).toContain('identity mismatch')
  })


  it('rejects primitive, array, circular and oversized arguments without invoking native host', async () => {
    for (const invalid of [null, 'text', 42, [], true]) {
      const result = await executeLuNativeTool('lu_files_read_text', invalid, 'thread-a', 'bad')
      expect(result.error).toContain('JSON object')
    }
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect((await executeLuNativeTool('lu_files_read_text', circular, 'thread-a', 'loop')).error)
      .toContain('encoded')
    expect((await executeLuNativeTool('lu_files_read_text', { path: 'x'.repeat(70000) }, 'thread-a', 'huge')).error)
      .toContain('size limit')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('redacts thrown host details from tool results and catalog logs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      mocks.invoke.mockRejectedValue(new Error('C:\\\\Users\\\\secret\\\\token=PRIVATE'))
      const result = await executeLuNativeTool(
        'lu_files_read_text', { path: 'note.txt' }, 'thread-a', 'call-a'
      )
      expect(result.error).toBe('Lu native tool call failed. Check local diagnostics.')
      expect(JSON.stringify(result)).not.toMatch(/Users|PRIVATE/)
      expect(await getLuNativeToolSchemas('thread-a')).toEqual([])
      expect(JSON.stringify(warn.mock.calls)).not.toMatch(/Users|PRIVATE/)
    } finally { warn.mockRestore() }
  })

  it('does not advertise desktop native capabilities in a browser or disabled host', async () => {
    mocks.isTauri.mockReturnValue(false)
    expect(await getLuNativeToolSchemas('thread-a')).toEqual([])
    expect((await executeLuNativeTool(
      'lu_files_read_text', { path: 'hello.txt' }, 'thread-a', 'c'
    )).error).toContain('desktop')
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockRejectedValue(new Error('not enabled'))
    expect(await getLuNativeToolSchemas('thread-a')).toEqual([])
  })
})
