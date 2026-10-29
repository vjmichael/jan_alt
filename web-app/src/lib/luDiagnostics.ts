/** Export strictly allowlisted Lu native troubleshooting data.
 * No raw logs, prompts, model paths, thread IDs, tokens, or file contents. */
import { invoke, isTauri } from '@tauri-apps/api/core'
import { useLuInference } from './luInference'
import {
  activeLuNativeDiagnosticTurn, readLuDiagnosticEvents, readLuNativeTraceReceipt,
  type LuDiagnosticEvent, type LuNativeTraceReceipt,
} from './luDiagnosticEvents'

export type LuStatusProbe = {
  phase?: unknown; pid?: unknown; sessionId?: unknown; generationId?: unknown
}
export type HostCheckpoint = { sequence: number; elapsedMillis: number; stage: string }
export type HostTrace = {
  status: 'ok' | 'legacy' | 'unavailable'
  // Host-issued per accepted turn. A trace reference is NEVER authorization.
  traceRef: string | null
  recordingState: 'accepted_turn' | 'no_accepted_turn' | 'admission_unobserved' | null
  clockDomain: 'host' | null
  // Null means the legacy source could not prove whether records were lost.
  droppedEvents: number | null
  events: HostCheckpoint[]
}
export type LuDiagnostics = {
  schema: 'lu.native.diagnostics.v1'
  createdAt: string
  operatingSystem: 'windows' | 'unknown'
  model: { catalogAvailable: boolean; admittedCount: number; selected: boolean; loaded: boolean; busy: boolean }
  engine: { phase: string; processPresent: boolean; sessionPresent: boolean; generationActive: boolean; statusProbe: 'ok' | 'unavailable' }
  lastNativeToolCalls: number | null
  events: LuDiagnosticEvent[]
  hostTrace: HostTrace
  // Evidence of a match, NOT proof of assistant persistence or rendering.
  correlation: { status: 'matched_active' | 'matched_returned' | 'mismatch' | 'unlinked' | 'unavailable'; scope: 'host_only' }
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

/** A native command can return unexpected fields; never copy it into JSON.
 * In particular, never promote an anonymous correlation token to authority. */
export function sanitizeLuHostTrace(raw: unknown): HostTrace {
  const unavailable: HostTrace = {
    status: 'unavailable', traceRef: null, recordingState: null,
    clockDomain: null, droppedEvents: null, events: [],
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return unavailable
  const record = raw as Record<string, unknown>
  const v2 = record.schema === 'lu.native.host-trace.v2'
  const legacy = record.schema === 'lu.native.host-trace.v1'
  if ((!v2 && !legacy) || !Array.isArray(record.events)) return unavailable
  if (v2 && (
    !['accepted_turn', 'no_accepted_turn', 'admission_unobserved'].includes(String(record.recordingState)) ||
    (record.traceRef !== null && (
      typeof record.traceRef !== 'string' || !/^[0-9a-f]{32}$/.test(record.traceRef)
    )) ||
    (record.recordingState === 'accepted_turn') !== (typeof record.traceRef === 'string') ||
    record.clockDomain !== 'host' ||
    typeof record.droppedEvents !== 'number' ||
    !Number.isSafeInteger(record.droppedEvents) || record.droppedEvents < 0
  )) return unavailable

  // Never materialize arbitrary host contents into the local export. A
  // malformed event and a truncated ring both lower our evidence quality.
  // A failed admission must not silently expose the previous turn's ring,
  // even if the host returned an object containing stale event fields.
  if (v2 && record.recordingState === 'admission_unobserved' &&
      (record.traceRef !== null || record.events.length > 0 || record.droppedEvents === 0)) {
    return unavailable
  }
  const last = record.events.slice(-64)
  let invalid = record.events.length - last.length
  const events: HostCheckpoint[] = []
  for (const event of last) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      invalid++
      continue
    }
    const e = event as Record<string, unknown>
    if (typeof e.stage !== 'string' || !hostCodes.has(e.stage) ||
        typeof e.sequence !== 'number' || !Number.isSafeInteger(e.sequence) || e.sequence <= 0 ||
        typeof e.elapsedMillis !== 'number' ||
        !Number.isSafeInteger(e.elapsedMillis) || e.elapsedMillis < 0) {
      invalid++
      continue
    }
    events.push({
      stage: e.stage, sequence: e.sequence, elapsedMillis: e.elapsedMillis,
    })
  }
  return {
    status: v2 && record.recordingState === 'admission_unobserved'
      ? 'unavailable' : v2 ? 'ok' : 'legacy',
    traceRef: v2 ? record.traceRef as string | null : null,
    recordingState: v2 ? record.recordingState as HostTrace['recordingState'] : null,
    clockDomain: v2 ? 'host' : null,
    droppedEvents: v2
      ? Math.min(Number.MAX_SAFE_INTEGER, (record.droppedEvents as number) + invalid)
      : null,
    events,
  }
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
  receipt: LuNativeTraceReceipt = { status: 'none', traceRef: null },
  scopedToActiveTurn = false,
): LuDiagnostics {
  const hostTrace = sanitizeLuHostTrace(rawHostTrace)
  let link: LuDiagnostics['correlation']['status'] = 'unlinked'
  if (receipt.status === 'pending') {
    link = scopedToActiveTurn && hostTrace.status === 'ok' &&
      hostTrace.recordingState === 'accepted_turn' ? 'matched_active' : 'unavailable'
  } else if (receipt.status === 'returned') {
    link = !receipt.traceRef || hostTrace.status !== 'ok' || hostTrace.traceRef === null
      ? 'unavailable'
      : hostTrace.traceRef === receipt.traceRef ? 'matched_returned' : 'mismatch'
  } else if (receipt.status === 'failed') {
    link = 'unavailable'
  }
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
    hostTrace,
    correlation: { status: link, scope: 'host_only' },
  }
}
export async function exportLuNativeDiagnostics(): Promise<void> {
  if (!isTauri()) throw new Error('Lu diagnostic export requires the installed desktop')
  const state = useLuInference.getState()
  const activeTurnId = activeLuNativeDiagnosticTurn()
  const receipt = readLuNativeTraceReceipt()
  let status: LuStatusProbe | null = null
  let hostTrace: unknown = null
  try { status = await invoke<LuStatusProbe>('lu_inference_status') } catch { /* redacted probe failure */ }
  try {
    hostTrace = await invoke<unknown>('lu_inference_diagnostics',
      activeTurnId ? { turnId: activeTurnId } : {})
  } catch { /* host trace or scoped admission unavailable */ }
  const report = buildLuDiagnostics({
    catalogAvailable: state.catalog?.available === true,
    admittedCount: state.catalog?.models.length ?? 0,
    loaded: Boolean(state.loadedModel),
    busy: state.busy,
    lastNativeToolCalls: state.lastTurnToolCalls,
  }, status, readLuDiagnosticEvents(), new Date().toISOString(), hostTrace,
  receipt, activeTurnId !== null)
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
