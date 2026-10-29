import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { UIMessage } from '@ai-sdk/react'
import type * as ProviderCaps from '@/lib/providerCaps'
import { Chat } from '@ai-sdk/react'
import { waitFor } from '@testing-library/react'
import { useAppState } from '@/hooks/useAppState'

// Regression test for https://github.com/janhq/jan/issues/8432 (Stop-during-load):
// aborting a request while ModelFactory.createModel() is still awaiting
// llama-server's "Loading model..." phase must (1) reject the in-flight
// sendMessages() call and (2) unload the (possibly still-loading) model via
// the tauri-plugin-llamacpp guest-js command directly, instead of silently
// ignoring the abort until the model finishes/times out.

const h = vi.hoisted(() => ({
  serviceHub: null as unknown,
  getLoadedModels: vi.fn(async () => [] as string[]),
  unloadLlamaModel: vi.fn(async () => ({ success: true })),
  resolveCreateModel: undefined as (() => void) | undefined,
  createModelMock: vi.fn(
    () =>
      new Promise((resolve) => {
        h.resolveCreateModel = () => resolve({ modelId: 'qwen3-4b' })
      })
  ),
}))

h.serviceHub = {
  mcp: () => ({ getTools: vi.fn(async () => []) }),
  rag: () => ({ getTools: async () => [] }),
}

const provider = { provider: 'llamacpp', api_key: '', models: [] }
const selectedModel = { id: 'qwen3-4b', capabilities: [] as string[] }

vi.mock('@/hooks/useServiceHub', () => ({
  getServiceHub: () => h.serviceHub,
  useServiceStore: { getState: () => ({ serviceHub: h.serviceHub }) },
}))
vi.mock('@/hooks/useToolAvailable', () => ({
  useToolAvailable: {
    getState: () => ({
      getDisabledTools: () => [],
      getDefaultDisabledTools: () => [],
    }),
  },
}))
vi.mock('@/hooks/useModelProvider', () => ({
  useModelProvider: {
    getState: () => ({
      selectedModel,
      selectedProvider: 'llamacpp',
      getProviderByName: () => provider,
    }),
  },
}))
vi.mock('@/hooks/useAssistant', () => ({
  useAssistant: { getState: () => ({ currentAssistant: null }) },
}))
vi.mock('@/hooks/useThreads', () => ({
  useThreads: { getState: () => ({ threads: {} }) },
}))
vi.mock('@/hooks/useAttachments', () => ({
  useAttachments: { getState: () => ({ enabled: false }) },
}))
vi.mock('@/hooks/useMCPServers', () => ({
  useMCPServers: { getState: () => ({ settings: {} }) },
}))
vi.mock('@janhq/tauri-plugin-llamacpp-api', () => ({
  getLoadedModels: h.getLoadedModels,
  unloadLlamaModel: h.unloadLlamaModel,
}))
vi.mock('@/lib/extension', () => ({
  ExtensionManager: { getInstance: () => ({ get: () => null }) },
}))
vi.mock('@/lib/mcp-orchestrator', () => ({
  mcpOrchestrator: { getRelevantTools: vi.fn() },
}))
vi.mock('@/lib/mcp-router-model-filter', () => ({
  isRouterModelSelectable: () => false,
}))
vi.mock('@/lib/reasoningProviderOptions', () => ({
  buildReasoningProviderOptions: () => undefined,
}))
vi.mock('@/lib/providerCaps', async (importOriginal) => ({
  ...(await importOriginal<typeof ProviderCaps>()),
  isPredefinedRemoteProvider: () => false,
  getProviderApiType: () => 'openai',
}))

// Simulates llama-server's real "Loading model..." phase: createModel()
// blocks until manually resolved, standing in for the 600s wait_until_loaded
// poll loop on the Rust side.
vi.mock('../model-factory', () => ({
  ModelFactory: { createModel: h.createModelMock },
}))
// The load-success path calls through to real streamText(), which validates
// the resolved model against AI SDK's LanguageModelV2 shape -- irrelevant to
// this test's concern (did createModelOrAbort resolve without unloading).
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai')
  return {
    ...actual,
    streamText: () => ({
      toUIMessageStream: () => new ReadableStream({ start: (c) => {
        c.enqueue({ type: 'start', messageId: 'reply' })
        c.enqueue({ type: 'text-start', id: 'text' })
        c.enqueue({ type: 'text-delta', id: 'text', delta: 'Recovered' })
        c.enqueue({ type: 'text-end', id: 'text' })
        c.enqueue({ type: 'finish', finishReason: 'stop' })
        c.close()
      } }),
    }),
  }
})

import { CustomChatTransport } from '../custom-chat-transport'

const user = (id: string, text: string): UIMessage =>
  ({ id, role: 'user', parts: [{ type: 'text', text }] }) as UIMessage

describe('CustomChatTransport: abort during model load', () => {
  beforeEach(() => {
    h.getLoadedModels.mockClear()
    h.unloadLlamaModel.mockClear()
    h.resolveCreateModel = undefined
    h.createModelMock.mockClear()
    useAppState.setState({
      currentStreamThreadId: undefined,
      loadingModel: false,
      loadingModels: {},
      modelLoadProgressByThread: {},
    })
  })

  it('rejects with AbortError and unloads the model when aborted mid-load', async () => {
    const transport = new CustomChatTransport()
    const controller = new AbortController()

    const send = transport.sendMessages({
      chatId: 'thread-1',
      messages: [user('m1', 'hi')],
      abortSignal: controller.signal,
      trigger: 'submit-message',
      messageId: undefined,
    })

    // Give sendMessages a tick to reach createModel() and start "loading".
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())

    controller.abort()

    await expect(send).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.unloadLlamaModel).toHaveBeenCalledWith('qwen3-4b')
  })

  it('resolves normally when load finishes before any abort', async () => {
    const transport = new CustomChatTransport()
    const controller = new AbortController()

    const send = transport.sendMessages({
      chatId: 'thread-1',
      messages: [user('m1', 'hi')],
      abortSignal: controller.signal,
      trigger: 'submit-message',
      messageId: undefined,
    })

    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    h.resolveCreateModel?.()

    await expect(send).resolves.toBeDefined()
    expect(h.unloadLlamaModel).not.toHaveBeenCalled()
  })

  it('does not start a model for an already cancelled request', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(new CustomChatTransport().sendMessages({
      chatId: 'a', messages: [user('u', 'Saved prompt')],
      abortSignal: controller.signal, trigger: 'submit-message', messageId: undefined,
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.createModelMock).not.toHaveBeenCalled()
    expect(h.unloadLlamaModel).not.toHaveBeenCalled()
  })

  it('does not start loading if Stop happens during the loaded-model probe', async () => {
    let release!: (models: string[]) => void
    h.getLoadedModels.mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
    const controller = new AbortController()
    const pending = new CustomChatTransport().sendMessages({
      chatId: 'a', messages: [user('u', 'Saved prompt')],
      abortSignal: controller.signal, trigger: 'submit-message', messageId: undefined,
    })
    controller.abort()
    release([])
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(h.createModelMock).not.toHaveBeenCalled()
    expect(useAppState.getState().currentStreamThreadId).toBeUndefined()
  })

  it('releases pre-stream state on model load failure as well as Stop', async () => {
    h.createModelMock.mockRejectedValueOnce(new Error('Worker load failed'))
    await expect(new CustomChatTransport().sendMessages({
      chatId: 'a', messages: [user('u', 'Saved prompt')],
      abortSignal: undefined, trigger: 'submit-message', messageId: undefined,
    })).rejects.toBeDefined()
    expect(useAppState.getState().currentStreamThreadId).toBeUndefined()
    expect(useAppState.getState().loadingModels.a).toBeFalsy()
  })

  it('keeps cancellation terminal even when the worker unload rejects', async () => {
    h.unloadLlamaModel.mockRejectedValueOnce(new Error('Worker unavailable'))
    const controller = new AbortController()
    const pending = new CustomChatTransport().sendMessages({
      chatId: 'a', messages: [user('u', 'Saved prompt')],
      abortSignal: controller.signal, trigger: 'submit-message', messageId: undefined,
    })
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    h.resolveCreateModel!()
    await Promise.resolve()
    expect(useAppState.getState().currentStreamThreadId).toBeUndefined()
  })

  it('clears the pre-stream request owner and permits Retry without duplicating the prompt', async () => {
    const chat = new Chat({ id: 'a', transport: new CustomChatTransport(undefined, 'a') })
    const pending = chat.sendMessage(user('original', 'Saved prompt'))
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    expect(chat.status).toBe('submitted')
    expect(useAppState.getState().currentStreamThreadId).toBe('a')
    const finishOldLoad = h.resolveCreateModel!
    await chat.stop()
    await pending
    expect(chat.status).toBe('ready')
    expect(chat.messages).toEqual([user('original', 'Saved prompt')])
    expect(useAppState.getState().currentStreamThreadId).toBeUndefined()
    expect(useAppState.getState().loadingModels.a).toBeFalsy()
    finishOldLoad()
    await Promise.resolve()
    // Same operation the unanswered user message's Play button uses.
    h.resolveCreateModel = undefined
    const retry = chat.regenerate({ messageId: 'original' })
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    h.resolveCreateModel!()
    await retry
    expect(chat.status).toBe('ready')
    expect(chat.messages.filter(m => m.role === 'user')).toEqual([user('original', 'Saved prompt')])
    expect(chat.messages.at(-1)?.parts).toContainEqual({ type: 'text', text: 'Recovered', state: 'done' })
  })

  it('cancelling A does not clear B loading state; A remains retryable after rehydration', async () => {
    const a = new Chat({ id: 'a', transport: new CustomChatTransport(undefined, 'a') })
    const pendingA = a.sendMessage(user('original', 'Saved prompt'))
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    const finishA = h.resolveCreateModel!
    h.resolveCreateModel = undefined
    const b = new Chat({ id: 'b', transport: new CustomChatTransport(undefined, 'b') })
    const pendingB = b.sendMessage(user('other', 'Another conversation'))
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    const finishB = h.resolveCreateModel!
    await a.stop()
    await pendingA
    expect(useAppState.getState().currentStreamThreadId).toBe('b')
    expect(useAppState.getState().loadingModel).toBe(true)
    expect(useAppState.getState().loadingModels.b).toBe(true)
    finishA()
    finishB()
    await pendingB
    expect(b.messages.at(-1)?.role).toBe('assistant')
    // A fresh SDK session models reload from the persisted user turn, with
    // no volatile cancellation flag or placeholder assistant required.
    const reopened = new Chat({ id: 'a', messages: JSON.parse(JSON.stringify(a.messages)), transport: new CustomChatTransport(undefined, 'a') })
    h.resolveCreateModel = undefined
    const retry = reopened.regenerate({ messageId: 'original' })
    await waitFor(() => expect(h.resolveCreateModel).toBeDefined())
    h.resolveCreateModel!()
    await retry
    expect(reopened.messages.filter(m => m.role === 'user')).toHaveLength(1)
    expect(reopened.messages.at(-1)?.role).toBe('assistant')
  })
})
