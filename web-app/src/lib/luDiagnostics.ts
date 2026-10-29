/** Export strictly allowlisted Lu native troubleshooting data.
 * No raw logs, prompts, model paths, thread IDs, tokens, or file contents. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useLuInference } from './luInference'
import { readLuDiagnosticEvents, type LuDiagnosticEvent } from './luDiagnosticEvents'

export type LuStatusProbe = {
  phase?: unknown; pid?: unknown; sessionId?: unknown; generationId?: unknown
}
export type LuDiagnostics = {
  schema: 'lu.native.diagnostics.v1'
  createdAt: string
  operatingSystem: 'windows' | 'unknown'
  model: { catalogAvailable: boolean; admittedCount: number; selected: boolean; loaded: boolean; busy: boolean }
  engine: { phase: string; processPresent: boolean; sessionPresent: boolean; generationActive: boolean; statusProbe: 'ok' | 'unavailable' }
  lastNativeToolCalls: number | null
  events: LuDiagnosticEvent[]
}
const phases = new Set(['Ready','Loading','Unloaded','Failed','Starting','Stopping','Idle'])
export function buildLuDiagnostics(
  state: {
    catalogAvailable: boolean; admittedCount: number; loaded: boolean; busy: boolean
    lastNativeToolCalls: number | null
  },
  status: LuStatusProbe | null,
  events: LuDiagnosticEvent[],
  at = new Date().toISOString(),
): LuDiagnostics {
  // The only event data admitted is a bounded code + ISO timestamp.
  const allowedEvents = new Set([
    'catalog-ready','catalog-failed','model-load-start','model-load-ready',
    'model-load-failed','model-unload-ready','model-unload-failed',
    'native-turn-start','native-turn-finished','native-turn-failed','native-turn-cancel-requested',
  ])
  return {
    schema: 'lu.native.diagnostics.v1',
    createdAt: at,
    operatingSystem: 'windows',
    model: {
      catalogAvailable: state.catalogAvailable === true,
      admittedCount: Number.isSafeInteger(state.admittedCount) && state.admittedCount >= 0 ? state.admittedCount : 0,
      selected: state.loaded === true,
      loaded: state.loaded === true,
      busy: state.busy === true,
    },
    engine: {
      phase: typeof status?.phase === 'string' && phases.has(status.phase) ? status.phase : 'Unknown',
      processPresent: typeof status?.pid === 'number' && Number.isSafeInteger(status.pid) && status.pid > 0,
      sessionPresent: typeof status?.sessionId === 'string' && status.sessionId.length > 0,
      generationActive: typeof status?.generationId === 'string' && status.generationId.length > 0,
      statusProbe: status === null ? 'unavailable' : 'ok',
    },
    lastNativeToolCalls: Number.isSafeInteger(state.lastNativeToolCalls) &&
      (state.lastNativeToolCalls as number) >= 0 ? state.lastNativeToolCalls : null,
    events: events.filter(event => allowedEvents.has(event.code) &&
      typeof event.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(event.at)).slice(-32)
      .map(event => ({ code: event.code, at: event.at })),
  }
}
export async function exportLuNativeDiagnostics(): Promise<void> {
  if (!isTauri()) throw new Error('Lu diagnostic export requires the installed desktop')
  const state = useLuInference.getState()
  let status: LuStatusProbe | null = null
  try { status = await invoke<LuStatusProbe>('lu_inference_status') } catch { /* redacted probe failure */ }
  const report = buildLuDiagnostics({
    catalogAvailable: state.catalog?.available === true,
    admittedCount: state.catalog?.models.length ?? 0,
    loaded: Boolean(state.loadedModel),
    busy: state.busy,
    lastNativeToolCalls: state.lastTurnToolCalls,
  }, status, readLuDiagnosticEvents())
  const blob = new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = 'lu-native-diagnostics.json'
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
