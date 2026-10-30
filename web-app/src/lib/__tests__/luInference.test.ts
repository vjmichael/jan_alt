import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@ai-sdk/react'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

import {
  luNativeEnabledForThread, luNativeUserContext,
  sendLuNativeConversation, useLuInference,
} from '../luInference'
import { activeLuNativeDiagnosticTurn, readLuNativeTraceReceipt } from '../luDiagnosticEvents'
import { useThreads } from '@/hooks/useThreads'

const msg = (role: 'user' | 'assistant', text: string): UIMessage =>
  ({ id: crypto.randomUUID(), role, parts: [{ type: 'text', text }] }) as UIMessage

beforeEach(() => {
  useThreads.setState({ threads: {} })
  mocks.invoke.mockReset()
  mocks.isTauri.mockReturnValue(true)
  useLuInference.setState({
    catalog: {
      available: true, backendId: 'llama-cpu', contextTokens: 4096,
      models: [{ id: 'm-admitted', name: 'Qwen.gguf' }],
    },
    sessionId: 's-host',
    loadedModel: 'm-admitted',
    enabledThreads: {},
    busy: false,
    lastTurnToolCalls: null,
    error: null,
  })
})

describe('Lu native chat with Rust-hosted Protobuf tool calls', () => {
  it('enables only the selected thread and never falls back to a provider', () => {
    expect(luNativeEnabledForThread('thread-1')).toBe(false)
    useLuInference.getState().setThreadEnabled('thread-1', true)
    expect(luNativeEnabledForThread('thread-1')).toBe(true)
    expect(luNativeEnabledForThread('thread-2')).toBe(false)
  })

  it('keeps a saved native-owned thread on Lu after the opt-in store resets', () => {
    useThreads.setState({ threads: {
      native: { id: 'native', model: { provider: 'lu-native', id: 'm-admitted' } } as Thread,
    } })
    expect(luNativeEnabledForThread('native')).toBe(true)
    mocks.isTauri.mockReturnValue(false)
    expect(luNativeEnabledForThread('native')).toBe(false)
  })

  it('validates only the current user turn; Rust owns persisted history', () => {
    const text = luNativeUserContext([
      msg('user', 'Earlier question'), msg('assistant', 'Earlier answer'),
      msg('user', 'Read notes.txt'),
    ])
    expect(text).toBe('Read notes.txt')
    expect(() => luNativeUserContext([msg('user', 'x'.repeat(17 * 1024))])).toThrow(/limit/)
    expect(() => luNativeUserContext([])).toThrow(/user/)
  })

  it('allows prior multimodal/tool messages but refuses an attachment in the active user turn', () => {
    const earlierWithFile = {
      id: 'earlier-file', role: 'user',
      parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,x' }],
    } as UIMessage
    const earlierTool = {
      id: 'earlier-tool', role: 'assistant',
      parts: [{ type: 'tool-lu_files_read_text', toolCallId: 'tool-1', state: 'output-available', output: 'done' }],
    } as UIMessage
    expect(luNativeUserContext([earlierWithFile, earlierTool, msg('user', 'Hello')])).toBe('Hello')
    expect(() => luNativeUserContext([msg('user', 'Hello'), earlierWithFile])).toThrow(/text only/)
  })

  it('enforces byte-based UTF-8 size limits for the current user message', () => {
    expect(luNativeUserContext([msg('user', '🚀'.repeat(4096))])).toHaveLength(8192)
    expect(() => luNativeUserContext([msg('user', '🚀'.repeat(4097))])).toThrow(/16 KiB/)
  })

  it('delivers only the answer from the Rust native tool loop', async () => {
    mocks.invoke.mockResolvedValue({
      answer: 'I found the marker in notes.txt.', toolCalls: 1, modelGenerations: 2,
      traceRef: '0123456789abcdef0123456789abcdef',
    })
    const reader = sendLuNativeConversation([msg('user', 'Read notes.txt')], 'thread-1').getReader()
    const chunks: Array<{ type: string; delta?: string }> = []
    for (;;) {
      const item = await reader.read()
      if (item.done) break
      chunks.push(item.value as { type: string; delta?: string })
    }
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.invoke).toHaveBeenCalledWith('lu_inference_native_turn', expect.objectContaining({
      sessionId: 's-host', threadId: 'thread-1',
      userTurnId: expect.any(String), turnId: expect.any(String),
    }))
    const nativeArgs = mocks.invoke.mock.calls[0]?.[1] as Record<string, unknown>
    expect(nativeArgs).not.toHaveProperty('userText')
    expect(nativeArgs).not.toHaveProperty('prompt')
    expect(nativeArgs).not.toHaveProperty('workspaceRoot')
    expect(chunks.map(chunk => chunk.type))
      .toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish'])
    expect(chunks.find(chunk => chunk.type === 'text-delta')?.delta)
      .toBe('I found the marker in notes.txt.')
    expect(useLuInference.getState().lastTurnToolCalls).toBe(1)
    expect(useLuInference.getState().busy).toBe(false)
    expect(readLuNativeTraceReceipt()).toEqual({
      status: 'returned', traceRef: '0123456789abcdef0123456789abcdef',
    })
    expect(activeLuNativeDiagnosticTurn()).toBeNull()
  })

  it('rejects nontext attachments before asking Rust to generate', () => {
    const withFile = {
      id: 'u-1', role: 'user',
      parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,x' }],
    } as UIMessage
    expect(() => sendLuNativeConversation([withFile], 'thread-1')).toThrow(/text only/)
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('fails closed on host rejection or a forged native result', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error('permission denied'))
    const failed = sendLuNativeConversation([msg('user', 'Read notes.txt')], 'thread-1').getReader()
    expect((await failed.read()).value?.type).toBe('start')
    await expect(failed.read()).rejects.toThrow(/Lu denied this native operation/)
    mocks.invoke.mockResolvedValueOnce({ answer: '', toolCalls: 1, modelGenerations: 2 })
    const forged = sendLuNativeConversation([msg('user', 'Read notes.txt')], 'thread-1').getReader()
    expect((await forged.read()).value?.type).toBe('start')
    await expect(forged.read()).rejects.toThrow(/Invalid Lu native turn result/)
  })

  it('never renders private host exception text in the native response stream', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error(
      'engine launch failed at C:\\\\Users\\\\private\\\\models\\\\secret.gguf token=PRIVATE_KEY',
    ))
    const reader = sendLuNativeConversation([msg('user', 'Hello')], 'thread-1').getReader()
    expect((await reader.read()).value?.type).toBe('start')
    let failure: unknown
    try { await reader.read() } catch (error) { failure = error }
    const message = String(failure)
    expect(message).toContain('The selected GGUF is missing or unavailable')
    for (const secret of ['Users', 'private', 'secret.gguf', 'PRIVATE_KEY']) {
      expect(message).not.toContain(secret)
    }
  })

  it('provides an ephemeral turn ID for scoped diagnostics only while active', async () => {
    let resolveTurn: (value: unknown) => void = () => undefined
    mocks.invoke.mockImplementation(() => new Promise(resolve => { resolveTurn = resolve }))
    const reader = sendLuNativeConversation([msg('user', 'Read note')], 'thread-1').getReader()
    expect((await reader.read()).value?.type).toBe('start')
    const active = activeLuNativeDiagnosticTurn()
    expect(active).toMatch(/^[0-9a-f-]{36}$/)
    expect(readLuNativeTraceReceipt()).toEqual({ status: 'pending', traceRef: null })
    expect(mocks.invoke.mock.calls[0][1]).toEqual(expect.objectContaining({ turnId: active }))
    resolveTurn({ answer: 'Done.', toolCalls: 0, modelGenerations: 1 })
    for (;;) {
      if ((await reader.read()).done) break
    }
    // A successful response without a host trace is not marked correlated.
    expect(readLuNativeTraceReceipt()).toEqual({ status: 'returned', traceRef: null })
    expect(activeLuNativeDiagnosticTurn()).toBeNull()
  })

  it('asks the trusted Rust host to cancel, never dispatches a tool from JS', async () => {
    let resolveTurn: (value: unknown) => void = () => undefined
    mocks.invoke.mockImplementation((command: string) =>
      command === 'lu_inference_native_turn'
        ? new Promise(resolve => { resolveTurn = resolve })
        : Promise.resolve({ signalled: true }),
    )
    const abort = new AbortController()
    const reader = sendLuNativeConversation([msg('user', 'Read notes.txt')], 'thread-1', abort.signal).getReader()
    expect((await reader.read()).value?.type).toBe('start')
    abort.abort()
    expect(mocks.invoke).toHaveBeenCalledWith('lu_inference_native_turn_cancel', expect.objectContaining({
      sessionId: 's-host', turnId: expect.any(String),
    }))
    resolveTurn({ answer: 'Should not display', toolCalls: 1, modelGenerations: 2 })
    await expect(reader.read()).rejects.toThrow(/cancelled/)
  })
})
