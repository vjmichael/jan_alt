/**
 * LCX-01: Lu-native AI SDK transport. No Jan ModelFactory, service hub,
 * MCP orchestrator, Cowork transport, inherited llama plugin or JS tool loop.
 *
 * Host admission still verifies the saved USER turn, exact model session,
 * native tool authorization and durable effect journal. This is not an
 * independent credential issuer or a source of native tool grants.
 */
import type { UIMessage } from '@ai-sdk/react'
import type { ChatRequestOptions, ChatTransport, UIMessageChunk } from 'ai'
import {
  luNativeEnabledForThread,
  sendLuNativeConversation,
} from '@/lib/luInference'

export class LuChatTransport implements ChatTransport<UIMessage> {
  constructor(private readonly boundThreadId: string) {
    if (!boundThreadId || boundThreadId.length > 128) {
      throw new Error('Lu native chat requires a valid conversation identity.')
    }
  }

  async sendMessages(
    options: Parameters<ChatTransport<UIMessage>['sendMessages']>[0]
  ): Promise<ReadableStream<UIMessageChunk>> {
    if (options.chatId !== this.boundThreadId) {
      throw new Error('Lu native chat transport rejected cross-conversation reuse.')
    }
    options.abortSignal?.throwIfAborted()
    if (!luNativeEnabledForThread(this.boundThreadId)) {
      throw new Error('Select a Lu GGUF model and enable Use Lu for this chat before sending.')
    }
    // Lu host reconstructs prompt from persisted messages; WebView data is
    // never treated as an authorization record or native filesystem root.
    return sendLuNativeConversation(
      options.messages,
      this.boundThreadId,
      options.abortSignal
    )
  }

  async reconnectToStream(
    _options: { chatId: string } & ChatRequestOptions
  ): Promise<ReadableStream<UIMessageChunk> | null> {
    // No implicit resumption into a new model turn on app restart. Durable
    // recovery is host-owned and must be explicitly reconciled later.
    return null
  }
}
