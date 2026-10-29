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

const msg = (role: 'user' | 'assistant', text: string): UIMessage =>
  ({ id: crypto.randomUUID(), role, parts: [{ type: 'text', text }] }) as UIMessage

beforeEach(() => {
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

  it('includes bounded prior text without converting it into a system role', () => {
    const text = luNativeUserContext([
      msg('user', 'Earlier question'), msg('assistant', 'Earlier answer'),
      msg('user', 'Read notes.txt'),
    ])
    expect(text).toContain('Previous user: Earlier question')
    expect(text).toContain('Previous assistant: Earlier answer')
    expect(text).toContain('Current user request:\nRead notes.txt')
    expect(() => luNativeUserContext([msg('user', 'x'.repeat(17 * 1024))])).toThrow(/limit/)
    expect(() => luNativeUserContext([])).toThrow(/user/)
  })

  it('delivers only the answer from the Rust native tool loop', async () => {
    mocks.invoke.mockResolvedValue({
      answer: 'I found the marker in notes.txt.', toolCalls: 1, modelGenerations: 2,
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
      userText: 'Read notes.txt', turnId: expect.any(String),
    }))
    expect(chunks.map(chunk => chunk.type))
      .toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish'])
    expect(chunks.find(chunk => chunk.type === 'text-delta')?.delta)
      .toBe('I found the marker in notes.txt.')
    expect(useLuInference.getState().lastTurnToolCalls).toBe(1)
    expect(useLuInference.getState().busy).toBe(false)
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
    await expect(failed.read()).rejects.toThrow(/permission denied/)
    mocks.invoke.mockResolvedValueOnce({ answer: '', toolCalls: 1, modelGenerations: 2 })
    const forged = sendLuNativeConversation([msg('user', 'Read notes.txt')], 'thread-1').getReader()
    expect((await forged.read()).value?.type).toBe('start')
    await expect(forged.read()).rejects.toThrow(/Invalid Lu native turn result/)
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
