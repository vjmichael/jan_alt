/** Lu-owned opt-in GGUF chat. Rust authorizes models and emits canonical Protobuf internally. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { create } from 'zustand'
import type { UIMessage } from '@ai-sdk/react'
import type { UIMessageChunk } from 'ai'
import { explainLuNativeFailure } from './luNativeError'
import { beginLuNativeTrace, failLuNativeTrace, finishLuNativeTrace, noteLuDiagnostic } from './luDiagnosticEvents'
import { expectLuAssistantDelivery, resetLuAssistantDelivery } from './luAssistantDeliveryEvidence'
import { useThreads } from '@/hooks/useThreads'

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
      noteLuDiagnostic('catalog-ready')
    } catch (error) {
      set({ catalog: { available: false, models: [], backendId: '', contextTokens: 0 }, error: explainLuNativeFailure(error) })
      noteLuDiagnostic('catalog-failed')
    }
  },
  load: async modelId => {
    const { catalog, sessionId, loadedModel } = get()
    if (!catalog?.available || !catalog.models.some(model => model.id === modelId)) {
      throw new Error('Select an admitted Lu GGUF model')
    }
    if (get().busy) throw new Error('Lu model operation already in progress')
    set({ busy: true, error: null })
    noteLuDiagnostic('model-load-start')
    try {
      if (sessionId && loadedModel === modelId) return
      if (sessionId) await invoke('lu_inference_unload', { sessionId })
      set({ sessionId: null, loadedModel: null, enabledThreads: {} })
      const result = await invoke<{ sessionId: string; modelRef: string }>('lu_inference_load', { modelRef: modelId })
      set({ sessionId: result.sessionId, loadedModel: result.modelRef })
      noteLuDiagnostic('model-load-ready')
    } catch (error) {
      set({ error: explainLuNativeFailure(error) })
      noteLuDiagnostic('model-load-failed')
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
      noteLuDiagnostic('model-unload-ready')
    } catch (error) {
      set({ error: explainLuNativeFailure(error) })
      noteLuDiagnostic('model-unload-failed')
      throw error
    } finally { set({ busy: false }) }
  },
  setThreadEnabled: (threadId, enabled) =>
    set(state => ({ enabledThreads: { ...state.enabledThreads, [threadId]: enabled } })),
}))
export function luNativeEnabledForThread(threadId: string): boolean {
  // Native-owned threads are persisted as such. A process restart clears the
  // opt-in store, but must never turn their next message into a Jan request.
  return isTauri() && (useLuInference.getState().enabledThreads[threadId] === true ||
    useThreads.getState().threads[threadId]?.model?.provider === 'lu-native')
}
/**
 * This is a UI compatibility check, NOT the model's prompt assembler.
 * Only the latest USER turn must be text-only. Historical attachments and
 * tool output are allowed: Rust reads persisted history and treats it as
 * untrusted context, while excluding non-text and system/tool records.
 */
export function luNativeUserContext(messages: UIMessage[]): string {
  const lastUser = messages.map(message => message.role).lastIndexOf('user')
  if (lastUser < 0) throw new Error('Lu needs a user text message.')
  const parts = messages[lastUser].parts
  if (parts.some(part => part.type !== 'text')) {
    throw new Error('Lu native chat currently supports text only. Remove attachments from this turn.')
  }
  const current = parts.map(part => part.type === 'text' ? part.text : '').join('\n')
  if (!current.trim()) throw new Error('Lu needs a nonempty user message.')
  if (new TextEncoder().encode(current).length > 16 * 1024) {
    throw new Error('Lu native user message exceeds the 16 KiB text limit.')
  }
  return current
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
        noteLuDiagnostic('native-turn-cancel-requested')
        // Cancellation is host-owned. Never execute or repair tools in JS.
        void invoke('lu_inference_native_turn_cancel', { sessionId, turnId }).catch(() => undefined)
      }
      abortTurn = () => { onAbort(); failLuNativeTrace(turnId); resetLuAssistantDelivery(); cleanup() }
      if (abortSignal?.aborted) {
        controller.error(new Error('Lu native turn cancelled'))
        return
      }
      abortSignal?.addEventListener('abort', onAbort, { once: true })
      useLuInference.setState({ busy: true, lastTurnToolCalls: null })
      beginLuNativeTrace(turnId)
      resetLuAssistantDelivery()
      noteLuDiagnostic('native-turn-start')
      controller.enqueue({ type: 'start' } as UIMessageChunk)
      void (async () => {
        try {
          noteLuDiagnostic('native-ipc-invoked')
          const report = await invoke<{ answer: string; toolCalls: number; modelGenerations: number; traceRef?: unknown }>(
            'lu_inference_native_turn',
            { sessionId, threadId, userTurnId, turnId },
          )
          noteLuDiagnostic('native-ipc-returned')
          if (done) { failLuNativeTrace(turnId); return }
          if (cancelled || abortSignal?.aborted) {
            failLuNativeTrace(turnId)
            if (cleanup()) controller.error(new Error('Lu native turn cancelled'))
            return
          }
          if (typeof report?.answer !== 'string' || !report.answer.trim() ||
              !Number.isSafeInteger(report.toolCalls) || report.toolCalls < 0) {
            throw new Error('Invalid Lu native turn result')
          }
          if (finishLuNativeTrace(turnId, report.traceRef)) {
            expectLuAssistantDelivery(threadId, userTurnId)
          }
          useLuInference.setState({ lastTurnToolCalls: report.toolCalls })
          noteLuDiagnostic('native-turn-finished')
          controller.enqueue({ type: 'text-start', id })
          controller.enqueue({ type: 'text-delta', id, delta: report.answer })
          controller.enqueue({ type: 'text-end', id })
          controller.enqueue({ type: 'finish', finishReason: 'stop' } as UIMessageChunk)
          if (cleanup()) {
            controller.close()
            noteLuDiagnostic('native-stream-closed')
          }
        } catch (error) {
          failLuNativeTrace(turnId)
          resetLuAssistantDelivery()
          noteLuDiagnostic('native-turn-failed')
          // Host errors can contain private paths, model text or tool output.
          // Preserve a useful fixed category without rendering raw IPC text.
          if (cleanup()) controller.error(new Error(explainLuNativeFailure(error)))
        }
      })()
    },
    cancel() { abortTurn?.() },
  })
}
