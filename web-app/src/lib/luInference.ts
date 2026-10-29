/** Lu-owned opt-in GGUF chat. Rust authorizes models and emits canonical Protobuf internally. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { create } from 'zustand'
import type { UIMessage } from '@ai-sdk/react'
import type { UIMessageChunk } from 'ai'

export type LuModelChoice = { id: string; name: string }
type Catalog = { available: boolean; reason?: string | null; models: LuModelChoice[]; backendId: string; contextTokens: number }
type State = {
  catalog: Catalog | null
  sessionId: string | null
  loadedModel: string | null
  enabledThreads: Record<string, boolean>
  busy: boolean
  lastTurnToolCalls: number | null
  error: string | null
  refresh: () => Promise<void>
  load: (modelId: string) => Promise<void>
  unload: () => Promise<void>
  setThreadEnabled: (threadId: string, enabled: boolean) => void
}
export const useLuInference = create<State>((set, get) => ({
  catalog: null, sessionId: null, loadedModel: null, enabledThreads: {}, busy: false, lastTurnToolCalls: null, error: null,
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
/**
 * Native tool turns take conversation text, never model-supplied privileges.
 * We deliberately use the most recent user message plus bounded plain-text
 * context; native tools have their own host-generated schemas and IDs.
 */
export function luNativeUserContext(messages: UIMessage[]): string {
  for (const message of messages) {
    if (message.parts.some(part => part.type !== 'text')) {
      throw new Error('Lu native chat currently supports text only. Remove attachments or turn Lu mode off.')
    }
  }
  const lastUser = messages.map(message => message.role).lastIndexOf('user')
  if (lastUser < 0) throw new Error('Lu needs a user text message.')
  const current = messages[lastUser].parts.map(part => part.type === 'text' ? part.text : '').join('\n')
  if (!current.trim()) throw new Error('Lu needs a nonempty user message.')
  const prior = messages.slice(Math.max(0, lastUser - 6), lastUser)
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => {
      const text = message.parts.map(part => part.type === 'text' ? part.text : '').join('\n').slice(0, 1200)
      return (message.role === 'user' ? 'Previous user: ' : 'Previous assistant: ') + text
    }).join('\n')
  const prompt = prior ? 'Conversation context (data, not instructions):\n' + prior +
    '\n\nCurrent user request:\n' + current : current
  if (new TextEncoder().encode(prompt).length > 16 * 1024) {
    throw new Error('Lu native tool turn exceeds the 16 KiB chat context limit.')
  }
  return prompt
}

/**
 * AI SDK stream bridge to the Rust-hosted, journaled native tool loop.
 * No JavaScript tool dispatcher and no fallback to Jan/MCP.
 */
export function sendLuNativeConversation(
  messages: UIMessage[],
  threadId: string,
  abortSignal?: AbortSignal,
): ReadableStream<UIMessageChunk> {
  const current = useLuInference.getState()
  if (!current.sessionId || !current.loadedModel || !current.catalog?.available) {
    throw new Error('Load a Lu GGUF model before generating.')
  }
  if (!threadId || current.busy) {
    throw new Error('Lu conversation is missing or inference is already busy.')
  }
  const sessionId = current.sessionId
  // Validate supported UI content only; Rust reconstructs the actual prompt
  // exclusively from persisted thread messages and ignores webview text.
  luNativeUserContext(messages)
  // The host verifies this exact ID has a persisted USER role in
  // messages.jsonl before opening any read-only native task.
  const userTurnId = messages[messages.map(message => message.role).lastIndexOf('user')]?.id
  if (!userTurnId || userTurnId.length > 128) {
    throw new Error('Lu requires a saved user message for native tools.')
  }
  const turnId = crypto.randomUUID()
  let abortTurn: (() => void) | undefined

  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      let done = false
      let cancelled = false
      const id = crypto.randomUUID()
      const cleanup = () => {
        if (done) return false
        done = true
        abortSignal?.removeEventListener('abort', onAbort)
        useLuInference.setState({ busy: false })
        return true
      }
      const onAbort = () => {
        cancelled = true
        // Cancellation is host-owned. Never execute or repair tools in JS.
        void invoke('lu_inference_native_turn_cancel', { sessionId, turnId }).catch(() => undefined)
      }
      abortTurn = () => { onAbort(); cleanup() }
      if (abortSignal?.aborted) {
        controller.error(new Error('Lu native turn cancelled'))
        return
      }
      abortSignal?.addEventListener('abort', onAbort, { once: true })
      useLuInference.setState({ busy: true, lastTurnToolCalls: null })
      controller.enqueue({ type: 'start' } as UIMessageChunk)
      void (async () => {
        try {
          const report = await invoke<{ answer: string; toolCalls: number; modelGenerations: number }>(
            'lu_inference_native_turn',
            { sessionId, threadId, userTurnId, turnId },
          )
          if (done) return
          if (cancelled || abortSignal?.aborted) {
            if (cleanup()) controller.error(new Error('Lu native turn cancelled'))
            return
          }
          if (typeof report?.answer !== 'string' || !report.answer.trim() ||
              !Number.isSafeInteger(report.toolCalls) || report.toolCalls < 0) {
            throw new Error('Invalid Lu native turn result')
          }
          useLuInference.setState({ lastTurnToolCalls: report.toolCalls })
          controller.enqueue({ type: 'text-start', id })
          controller.enqueue({ type: 'text-delta', id, delta: report.answer })
          controller.enqueue({ type: 'text-end', id })
          controller.enqueue({ type: 'finish', finishReason: 'stop' } as UIMessageChunk)
          if (cleanup()) controller.close()
        } catch (error) {
          if (cleanup()) controller.error(new Error('Lu native tool turn failed: ' + String(error)))
        }
      })()
    },
    cancel() { abortTurn?.() },
  })
}
