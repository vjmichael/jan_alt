import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { useLuInference } from '@/lib/luInference'

/** Explicit user choice; never auto-replaces the Jan provider for a thread. */
export function LuNativeModelPicker({ threadId }: { threadId: string }) {
  const catalog = useLuInference(state => state.catalog)
  const active = useLuInference(state => state.enabledThreads[threadId] === true)
  const busy = useLuInference(state => state.busy)
  const error = useLuInference(state => state.error)
  const loadedModel = useLuInference(state => state.loadedModel)
  const sessionId = useLuInference(state => state.sessionId)
  const refresh = useLuInference(state => state.refresh)
  const load = useLuInference(state => state.load)
  const unload = useLuInference(state => state.unload)
  const setThreadEnabled = useLuInference(state => state.setThreadEnabled)
  const [choice, setChoice] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    if (LU_BRAND && isTauri()) void refresh()
  }, [refresh])
  useEffect(() => {
    if (!choice && catalog?.models.length) setChoice(catalog.models[0].id)
  }, [catalog, choice])
  if (!LU_BRAND || !isTauri()) return null
  const available = catalog?.available === true
  const loaded = Boolean(sessionId && loadedModel)
  const safeChoice = catalog?.models.some(model => model.id === choice) ? choice : (catalog?.models[0]?.id ?? '')
  return (
    <section aria-label="Lu native inference" className="mb-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <strong>Lu native CPU</strong>
        <label htmlFor="lu-native-model" className="sr-only">Lu model</label>
        <select
          id="lu-native-model"
          aria-label="Lu GGUF model"
          className="max-w-56 rounded border bg-background px-2 py-1"
          disabled={!available || busy || active}
          value={safeChoice}
          onChange={event => setChoice(event.target.value)}
        >
          {catalog?.models.length ? catalog.models.map(model =>
            <option key={model.id} value={model.id}>{model.name}</option>
          ) : <option value="">No admitted GGUF</option>}
        </select>
        <button
          type="button" className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={!available || !safeChoice || busy}
          onClick={() => {
            setNotice('')
            void load(safeChoice).catch(() => setNotice('Native model loading failed; see Lu status.'))
          }}
        >{busy ? 'Working…' : loadedModel === safeChoice ? 'Loaded' : 'Load'}</button>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={active}
            disabled={!available || !loaded || busy}
            onChange={event => setThreadEnabled(threadId, event.target.checked)}
          /> Use Lu for this chat
        </label>
        <button
          type="button" className="rounded border px-2 py-1 disabled:opacity-50"
          disabled={!loaded || busy}
          onClick={() => {
            setNotice('')
            void unload().catch(() => setNotice('Cannot unload while native generation is active.'))
          }}
        >Unload</button>
        <button type="button" className="rounded border px-2 py-1" onClick={() => void refresh()}>Refresh</button>
      </div>
      <p className="mt-1 text-muted-foreground">
        {active ? 'Lu native text-only ChatML mode. No Jan inference fallback, tools, or multimodal media.' :
          available ? 'Opt in to run this thread using the persistent Lu-owned GGUF engine.' :
          (catalog?.reason || 'Lu inference is not packaged or enabled in this build.')}
        {error ? ' ' + error : ''}{notice ? ' ' + notice : ''}
      </p>
    </section>
  )
}
