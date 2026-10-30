import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { isTauri } from '@tauri-apps/api/core'
import { useThreads } from '@/hooks/useThreads'
import { useLuInference } from '@/lib/luInference'
import { LuNativeModelPicker } from './LuNativeModelPicker'
import { route } from '@/constants/routes'
import { SESSION_STORAGE_PREFIX } from '@/constants/chat'

const NEW_CHAT = '__lu_new_chat__'

/** First native turn starts from a durable Lu-owned thread, without a Jan provider. */
export function LuNativeNewChat() {
  const router = useRouter()
  const createThread = useThreads(state => state.createThread)
  const loadedModel = useLuInference(state => state.loadedModel)
  const active = useLuInference(state => state.enabledThreads[NEW_CHAT] === true)
  const setThreadEnabled = useLuInference(state => state.setThreadEnabled)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!LU_BRAND || !isTauri()) return null
  const submit = async () => {
    const text = message.trim()
    if (!text || !loadedModel || !active || busy) return
    if (new TextEncoder().encode(text).length > 16 * 1024) {
      setError('Lu native messages must be at most 16 KiB.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const thread = await createThread(
        { provider: 'lu-native', id: loadedModel }, text
      )
      setThreadEnabled(thread.id, true)
      setThreadEnabled(NEW_CHAT, false)
      sessionStorage.setItem(
        `${SESSION_STORAGE_PREFIX.INITIAL_MESSAGE}${thread.id}`,
        JSON.stringify({ text, draft: text, files: [] })
      )
      await router.navigate({ to: route.threadsDetail, params: { threadId: thread.id } })
      setMessage('')
    } catch {
      // No raw host/storage error reaches the visible chat surface.
      setError('Lu could not create this chat. Please retry.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="mx-auto w-full max-w-3xl px-3">
    <h1 className="mb-4 text-center text-2xl font-medium">Chat with Lu</h1>
    <LuNativeModelPicker threadId={NEW_CHAT} />
    <form onSubmit={event => { event.preventDefault(); void submit() }}>
      <label className="sr-only" htmlFor="lu-native-first-message">Message Lu</label>
      <textarea id="lu-native-first-message" data-testid="lu-native-first-message"
        className="w-full rounded-lg border bg-background p-3" rows={3}
        placeholder="Ask Lu something…" value={message}
        onChange={event => setMessage(event.target.value)} />
      <button type="submit" data-testid="lu-native-first-send"
        className="mt-2 rounded-lg border px-4 py-2 disabled:opacity-50"
        disabled={!message.trim() || !loadedModel || !active || busy}>
        {busy ? 'Starting…' : 'Send to Lu'}
      </button>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </form>
  </div>
}
