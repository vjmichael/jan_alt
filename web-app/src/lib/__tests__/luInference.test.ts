import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@ai-sdk/react'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  listen: vi.fn(),
  event: null as null | ((event: { payload: unknown }) => void),
  unlisten: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen,
}))

import { luNativeEnabledForThread, sendLuNativeConversation, useLuInference } from '../luInference'

const msg = (role: 'user' | 'assistant', text: string): UIMessage =>
  ({ id: crypto.randomUUID(), role, parts: [{ type: 'text', text }] }) as UIMessage

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.listen.mockReset()
  mocks.unlisten.mockReset()
  mocks.event = null
  mocks.isTauri.mockReturnValue(true)
  mocks.listen.mockImplementation(async (_channel: string, callback: typeof mocks.event) => {
    mocks.event = callback
    return mocks.unlisten
  })
  useLuInference.setState({
    catalog: { available: true, backendId: 'llama-cpu', contextTokens: 4096,
      models: [{ id: 'm-admitted', name: 'Tiny.gguf' }] },
    sessionId: 's-host',
    loadedModel: 'm-admitted',
    enabledThreads: {},
    busy: false, error: null,
  })
})

describe('Lu native chat selection and trusted desktop event delivery', () => {
  it('is opt-in on a per-thread basis, not a global provider fallback', () => {
    expect(luNativeEnabledForThread('thread-1')).toBe(false)
    useLuInference.getState().setThreadEnabled('thread-1', true)
    expect(luNativeEnabledForThread('thread-1')).toBe(true)
    expect(luNativeEnabledForThread('thread-2')).toBe(false)
  })
  it('streams exactly the host-issued generation, not another session or stale sequence', async () => {
    mocks.invoke.mockResolvedValue({ generationId: 'g-host' })
    const stream = sendLuNativeConversation([msg('user', 'Say hello')])
    const reader = stream.getReader()
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith(
      'lu_inference_generate',
      expect.objectContaining({ sessionId: 's-host', maxNewTokens: 256 })
    ))
    expect(mocks.event).toBeTruthy()
    const push = (generationId: string, sequence: number, kind: string, data: unknown,
      sessionId = 's-host') => mocks.event?.({ payload: {
      requestId: 'r-1', sessionId, generationId, sequence, kind, data,
    } })
    push('g-other', 1, 'text', { text: 'NOT ALLOWED' })
    push('g-host', 1, 'text', { text: 'Hello' })
    push('g-host', 1, 'text', { text: 'duplicate' })
    push('g-host', 2, 'finished', { generatedBytes: 5, cancelled: false })
    const chunks: unknown[] = []
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      chunks.push(next.value)
    }
    expect(chunks).toEqual([
      { type: 'start' },
      expect.objectContaining({ type: 'text-start' }),
      expect.objectContaining({ type: 'text-delta', delta: 'Hello' }),
      expect.objectContaining({ type: 'text-end' }),
      expect.objectContaining({ type: 'finish' }),
    ])
    expect(mocks.unlisten).toHaveBeenCalledTimes(1)
    const request = mocks.invoke.mock.calls[0][1] as { prompt: string }
    expect(request.prompt).toContain('<|im_start|>user')
    expect(request.prompt).toContain('Say hello')
  })
  it('rejects attachment content before sending any native model request', () => {
    const withFile = {
      id: 'u-1', role: 'user',
      parts: [{ type: 'file', mediaType: 'image/png', url: 'data:image/png;base64,x' }],
    } as UIMessage
    expect(() => sendLuNativeConversation([withFile])).toThrow('text-only')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })
})
