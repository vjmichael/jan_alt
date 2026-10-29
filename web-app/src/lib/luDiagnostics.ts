/** Export strictly allowlisted Lu native troubleshooting data.
 * No raw logs, prompts, model paths, thread IDs, tokens, or file contents. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useLuInference } from './luInference'
import { readLuDiagnosticEvents, type LuDiagnosticEvent } from './luDiagnosticEvents'

export type LuStatusProbe = {
  phase?: unknown; pid?: unknown; sessionId?: unknown; generationId?: unknown
}
export type HostCheckpoint = { sequence: number; elapsedMillis: number; stage: string }
export type HostTrace = { status: 'ok' | 'unavailable'; events: HostCheckpoint[] }
export type LuDiagnostics = {
  schema: 'lu.native.diagnostics.v1'
  createdAt: string
  operatingSystem: 'windows' | 'unknown'
  model: { catalogAvailable: boolean; admittedCount: number; selected: boolean; loaded: boolean; busy: boolean }
  engine: { phase: string; processPresent: boolean; sessionPresent: boolean; generationActive: boolean; statusProbe: 'ok' | 'unavailable' }
  lastNativeToolCalls: number | null
  events: LuDiagnosticEvent[]
  hostTrace: HostTrace
}
const phases = new Set(['Ready','Loading','Unloaded','Failed','Starting','Stopping','Idle'])
const clientCodes = new Set([
  'catalog-ready','catalog-failed','model-load-start','model-load-ready',
  'model-load-failed','model-unload-ready','model-unload-failed',
  'native-turn-start','native-turn-finished','native-turn-failed','native-turn-cancel-requested',
  'user-turn-persisted','native-ipc-invoked','native-ipc-returned','native-stream-closed',
])
const hostCodes = new Set([
  'native-turn-received','recovery-ready','recovery-unavailable','native-session-ready',
  'native-session-rejected','saved-user-attested','saved-user-rejected',
  'native-turn-registered','native-turn-busy','native-worker-entered',
  'native-task-authorized','native-model-loop-entered','native-model-loop-returned',
  'native-turn-succeeded','native-turn-failed','native-cancel-signalled',
])

/** A native command can return unexpected fields; never copy it into JSON. */
export function sanitizeLuHostTrace(raw: unknown): HostTrace {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { status: 'unavailable', events: [] }
  }
  const record = raw as Record<string, unknown>
  if (record.schema !== 'lu.native.host-trace.v1' || !Array.isArray(record.events)) {
    return { status: 'unavailable', events: [] }
  }
  const events: HostCheckpoint[] = record.events.filter(event => {
    if (!event || typeof event !== 'object' || Array.isArray(event)) return false
    const e = event as Record<string, unknown>
    return typeof e.stage === 'string' && hostCodes.has(e.stage) &&
      typeof e.sequence === 'number' && Number.isSafeInteger(e.sequence) && e.sequence > 0 &&
      typeof e.elapsedMillis === 'number' && Number.isSafeInteger(e.elapsedMillis) && e.elapsedMillis >= 0
  }).slice(-64).map(event => {
    const e = event as Record<string, unknown>
    return { sequence: e.sequence as number, elapsedMillis: e.elapsedMillis as number, stage: e.stage as string }
  })
  return { status: 'ok', events }
}

export function buildLuDiagnostics(
  state: {
    catalogAvailable: boolean; admittedCount: number; loaded: boolean; busy: boolean
    lastNativeToolCalls: number | null
  },
  status: LuStatusProbe | null,
  events: LuDiagnosticEvent[],
  at = new Date().toISOString(),
  rawHostTrace: unknown = null,
): LuDiagnostics {
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
    events: events.filter(event => clientCodes.has(event.code) &&
      typeof event.at === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(event.at)).slice(-32)
      .map(event => ({ code: event.code, at: event.at })),
    hostTrace: sanitizeLuHostTrace(rawHostTrace),
  }
}
export async function exportLuNativeDiagnostics(): Promise<void> {
  if (!isTauri()) throw new Error('Lu diagnostic export requires the installed desktop')
  const state = useLuInference.getState()
  let status: LuStatusProbe | null = null
  let hostTrace: unknown = null
  try { status = await invoke<LuStatusProbe>('lu_inference_status') } catch { /* redacted probe failure */ }
  try { hostTrace = await invoke<unknown>('lu_inference_diagnostics') } catch { /* host trace unavailable */ }
  const report = buildLuDiagnostics({
    catalogAvailable: state.catalog?.available === true,
    admittedCount: state.catalog?.models.length ?? 0,
    loaded: Boolean(state.loadedModel),
    busy: state.busy,
    lastNativeToolCalls: state.lastTurnToolCalls,
  }, status, readLuDiagnosticEvents(), new Date().toISOString(), hostTrace)
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
