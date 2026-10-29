import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@ai-sdk/react'

const invoke = vi.fn()
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
  isTauri: () => true,
}))

import {
  luNativeUserContext,
  sendLuNativeConversation,
  useLuInference,
} from './luInference'

const user = (text: string) => ({ id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] }) as UIMessage
const assistant = (text: string) => ({ id: crypto.randomUUID(), role: 'assistant', parts: [{ type: 'text', text }] }) as UIMessage

describe('Lu desktop native chat transport', () => {
  beforeEach(() => {
    invoke.mockReset()
    useLuInference.setState({
      catalog: { available: true, models: [{ id: 'model-1', name: 'Qwen' }], backendId: 'llama-cpu', contextTokens: 4096 },
      sessionId: 'session-1',
      loadedModel: 'model-1',
      enabledThreads: { 'thread-1': true },
      busy: false,
      lastTurnToolCalls: null,
      error: null,
    })
  })

  it('provides bounded conversation context while keeping the last user request', () => {
    const text = luNativeUserContext([user('Old question'), assistant('Old reply'), user('Read notes.txt')])
    expect(text).toContain('Previous user: Old question')
    expect(text).toContain('Previous assistant: Old reply')
    expect(text).toContain('Current user request:\nRead notes.txt')
    expect(() => luNativeUserContext([user('a'.repeat(17 * 1024))])).toThrow(/limit/)
    expect(() => luNativeUserContext([])).toThrow(/user/)
  })

  it('delegates to Rust, emits only the verified final text and records tool count', async () => {
    invoke.mockResolvedValue({ answer: 'Marker found in notes.txt', toolCalls: 1, modelGenerations: 2 })
    const stream = sendLuNativeConversation([user('Read notes.txt')], 'thread-1')
    const reader = stream.getReader()
    const chunks: Array<{ type: string; delta?: string }> = []
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      chunks.push(next.value as { type: string; delta?: string })
    }
    expect(invoke).toHaveBeenCalledWith('lu_inference_native_turn', expect.objectContaining({
      sessionId: 'session-1', threadId: 'thread-1',
      userText: 'Read notes.txt',
    }))
    expect(chunks.map(chunk => chunk.type)).toEqual(['start', 'text-start', 'text-delta', 'text-end', 'finish'])
    expect(chunks.find(chunk => chunk.type === 'text-delta')?.delta).toBe('Marker found in notes.txt')
    expect(useLuInference.getState().lastTurnToolCalls).toBe(1)
    expect(useLuInference.getState().busy).toBe(false)
  })

  it('does not fabricate an answer if the host rejects the tool turn', async () => {
    invoke.mockRejectedValue(new Error('native turn rejected'))
    const reader = sendLuNativeConversation([user('Read notes.txt')], 'thread-1').getReader()
    expect((await reader.read()).value?.type).toBe('start')
    await expect(reader.read()).rejects.toThrow(/native turn rejected/)
    expect(useLuInference.getState().lastTurnToolCalls).toBeNull()
  })
})
