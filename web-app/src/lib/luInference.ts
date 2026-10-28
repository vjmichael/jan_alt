/** Lu-owned opt-in GGUF chat. Rust authorizes models and emits canonical Protobuf internally. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { create } from 'zustand'
import type { UIMessage } from '@ai-sdk/react'
import type { UIMessageChunk } from 'ai'

export type LuModelChoice = { id: string; name: string }
type Catalog = { available: boolean; reason?: string | null; models: LuModelChoice[]; backendId: string; contextTokens: number }
type NativeEvent = { requestId: string; sessionId: string; generationId: string; sequence: number; kind: string; data: Record<string, unknown> }
type State = {
  catalog: Catalog | null
  sessionId: string | null
  loadedModel: string | null
  enabledThreads: Record<string, boolean>
  busy: boolean
  error: string | null
  refresh: () => Promise<void>
  load: (modelId: string) => Promise<void>
  unload: () => Promise<void>
  setThreadEnabled: (threadId: string, enabled: boolean) => void
}
export const useLuInference = create<State>((set, get) => ({
  catalog: null, sessionId: null, loadedModel: null, enabledThreads: {}, busy: false, error: null,
  refresh: async () => {
    if (!isTauri()) return
    try {
      const catalog = await invoke<Catalog>('lu_inference_models')
      const status = catalog.available
        ? await invoke<{ sessionId: string | null; modelRef: string | null }>('lu_inference_status')
        : null
      set({ catalog, sessionId: status?.sessionId ?? null, loadedModel: status?.modelRef ?? null, error: null })
    } catch {
      set({ catalog: { available: false, models: [], backendId: '', contextTokens: 0 }, error: 'Lu native inference unavailable' })
    }
  },
  load: async modelId => {
    const { catalog, sessionId, loadedModel } = get()
    if (!catalog?.available || !catalog.models.some(model => model.id === modelId)) {
      throw new Error('Select an admitted Lu GGUF model')
    }
    if (get().busy) throw new Error('Lu model operation already in progress')
    set({ busy: true, error: null })
    try {
      if (sessionId && loadedModel === modelId) return
      if (sessionId) await invoke('lu_inference_unload', { sessionId })
      set({ sessionId: null, loadedModel: null, enabledThreads: {} })
      const result = await invoke<{ sessionId: string; modelRef: string }>('lu_inference_load', { modelRef: modelId })
      set({ sessionId: result.sessionId, loadedModel: result.modelRef })
    } catch (error) {
      set({ error: String(error) })
      throw error
    } finally { set({ busy: false }) }
  },
  unload: async () => {
    const { sessionId } = get()
    if (!sessionId) return
    if (get().busy) throw new Error('Lu model operation already in progress')
    set({ busy: true, error: null })
    try {
      await invoke('lu_inference_unload', { sessionId })
      set({ sessionId: null, loadedModel: null, enabledThreads: {} })
    } catch (error) {
      set({ error: String(error) })
      throw error
    } finally { set({ busy: false }) }
  },
  setThreadEnabled: (threadId, enabled) =>
    set(state => ({ enabledThreads: { ...state.enabledThreads, [threadId]: enabled } })),
}))
export function luNativeEnabledForThread(threadId: string): boolean {
  return isTauri() && useLuInference.getState().enabledThreads[threadId] === true
}
function chatML(messages: UIMessage[]): string {
  const segments: string[] = []
  for (const message of messages) {
    if (message.parts.some(part => part.type !== 'text')) {
      throw new Error('Lu CPU chat is text-only. Turn Lu mode off for images, files, audio and tools.')
    }
    const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('\n')
    if (!text.trim()) continue
    const role = message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user'
    const safe = text.replaceAll('<|im_start|>', '[im_start]').replaceAll('<|im_end|>', '[im_end]')
    segments.push('<|im_start|>' + role + '\n' + safe + '<|im_end|>')
  }
  if (!segments.some(segment => segment.startsWith('<|im_start|>user\n'))) {
    throw new Error('Lu needs a user text message to generate.')
  }
  const prompt = segments.join('\n') + '\n<|im_start|>assistant\n'
  if (new TextEncoder().encode(prompt).length > 2 * 1024 * 1024) {
    throw new Error('Lu native prompt exceeds the byte limit')
  }
  return prompt
}
export function sendLuNativeConversation(messages: UIMessage[], abortSignal?: AbortSignal): ReadableStream<UIMessageChunk> {
  const current = useLuInference.getState()
  if (!current.sessionId || !current.loadedModel || !current.catalog?.available) {
    throw new Error('Load a Lu GGUF model before generating.')
  }
  const sessionId = current.sessionId
  const prompt = chatML(messages)
  let signalCancel: (() => void) | undefined
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      let generationId: string | null = null
      let done = false
      let cancelled = false
      let textStarted = false
      let lastSequence = -1
      const pending: NativeEvent[] = []
      const id = crypto.randomUUID()
      let unlisten: (() => void) | undefined
      const close = () => {
        if (done) return
        done = true
        abortSignal?.removeEventListener('abort', onAbort)
        unlisten?.()
      }
      const fail = (msg: string) => {
        if (done) return
        close()
        controller.error(new Error(msg))
      }
      const onAbort = () => {
        cancelled = true
        if (generationId) {
          void invoke('lu_inference_cancel', { sessionId, generationId }).catch(() => undefined)
        }
        // Cancellation request is not a terminal engine acknowledgment.
      }
      signalCancel = onAbort
      const handle = (event: NativeEvent) => {
        if (done || event.sessionId !== sessionId || !event.generationId) return
        if (!generationId) {
          if (pending.length >= 2048) { fail('Lu event backlog limit exceeded'); return }
          pending.push(event)
          return
        }
        if (event.generationId !== generationId) return
        if (!Number.isSafeInteger(event.sequence) || event.sequence <= lastSequence) return
        lastSequence = event.sequence
        if (event.kind === 'text' && typeof event.data.text === 'string') {
          if (!textStarted) { textStarted = true; controller.enqueue({ type: 'text-start', id }) }
          controller.enqueue({ type: 'text-delta', id, delta: event.data.text })
        } else if (event.kind === 'failure') {
          fail(typeof event.data.code === 'string' ? 'Lu inference: ' + event.data.code : 'Lu native generation failed')
        } else if (event.kind === 'finished') {
          if (textStarted) controller.enqueue({ type: 'text-end', id })
          controller.enqueue({ type: 'finish', finishReason: cancelled ? 'other' : 'stop' } as UIMessageChunk)
          close()
          controller.close()
        }
      }
      if (abortSignal?.aborted) { fail('Lu request cancelled'); return }
      abortSignal?.addEventListener('abort', onAbort, { once: true })
      void (async () => {
        try {
          unlisten = await listen<NativeEvent>('lu-inference-event', event => handle(event.payload))
          if (done || abortSignal?.aborted) { fail('Lu request cancelled'); return }
          const result = await invoke<{ generationId: string }>('lu_inference_generate', {
            sessionId, prompt, maxNewTokens: 256,
          })
          generationId = result.generationId
          for (const event of pending.splice(0)) handle(event)
          if (cancelled) onAbort()
        } catch (error) { fail('Lu native generation start failed: ' + String(error)) }
      })()
    },
    cancel() { signalCancel?.() },
  })
}
