import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UIMessage } from '@ai-sdk/react'
import type { ChatTransport } from 'ai'
const h = vi.hoisted(() => ({
  enabled: vi.fn(() => true),
  send: vi.fn(() => new ReadableStream()),
}))
vi.mock('@/lib/luInference', () => ({
  luNativeEnabledForThread: h.enabled,
  sendLuNativeConversation: h.send,
}))
import { LuChatTransport } from '../luChatTransport'

const message = {
  id: 'saved-user-01', role: 'user', parts: [{ type: 'text', text: 'hello' }],
} as UIMessage
type Send = Parameters<ChatTransport<UIMessage>['sendMessages']>[0]
const options = (chatId='thread-a', abortSignal?: AbortSignal): Send => ({
  chatId, messages: [message], trigger: 'submit-message',
  messageId: message.id, abortSignal,
} as Send)

describe('Lu-owned transport is not a Jan provider or a tool dispatcher', () => {
  beforeEach(() => { h.enabled.mockReset().mockReturnValue(true);h.send.mockClear() })
  it('passes saved turn and abort signal into Lu-native host adapter', async () => {
    const t = new LuChatTransport('thread-a')
    const controller = new AbortController()
    await t.sendMessages(options('thread-a', controller.signal))
    expect(h.send).toHaveBeenCalledTimes(1)
    expect(h.send).toHaveBeenCalledWith([message],'thread-a',controller.signal)
  })
  it('refuses a cross-thread transport reuse', async () => {
    await expect(new LuChatTransport('thread-a').sendMessages(options('thread-b')))
      .rejects.toThrow(/cross-conversation/)
    expect(h.send).not.toHaveBeenCalled()
  })
  it('refuses non-native session without entering Jan provider factory', async () => {
    h.enabled.mockReturnValue(false)
    await expect(new LuChatTransport('thread-a').sendMessages(options()))
      .rejects.toThrow(/Select a Lu GGUF/)
    expect(h.send).not.toHaveBeenCalled()
  })
  it('refuses already-aborted turn before host request', async () => {
    const ac=new AbortController();ac.abort()
    await expect(new LuChatTransport('thread-a').sendMessages(options('thread-a',ac.signal)))
      .rejects.toThrow()
    expect(h.send).not.toHaveBeenCalled()
  })
  it('rejects missing conversation identity', () => {
    expect(() => new LuChatTransport('')).toThrow(/valid conversation/)
  })
  it('never implicitly reconnects or forges a new turn after restart', async () => {
    expect(await new LuChatTransport('thread-a').reconnectToStream({chatId:'thread-a'})).toBeNull()
    expect(h.send).not.toHaveBeenCalled()
  })
})
