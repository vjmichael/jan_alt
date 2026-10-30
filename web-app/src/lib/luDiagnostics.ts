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
export type HostFinding = {
  schema: 'lu.native.host-finding.v1'
  scope: 'host_only'
  status: 'insufficient_evidence' | 'bounded_host_boundary' | 'host_turn_returned' | 'in_progress'
  lastObserved: string
  firstUnobserved: string
  faultRegion: string
  nextProbe: string
  droppedEvents: number
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
  // Host-only interpretation; never proof of a causal Protobuf root cause.
  hostFinding: HostFinding | null
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

/** The Tauri host response may contain unexpected keys, arbitrary strings or
 * old/cross-turn findings. Copy ONLY known host codes and only when the
 * underlying v2 host trace was accepted without malformed evidence. */
export function sanitizeLuHostFinding(raw: unknown, trace: HostTrace): HostFinding | null {
  if (trace.status !== 'ok' || trace.recordingState !== 'accepted_turn' ||
      trace.droppedEvents === null || !raw || typeof raw !== 'object' ||
      Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const statuses = new Set(['insufficient_evidence', 'bounded_host_boundary',
    'host_turn_returned', 'in_progress'])
  const lastCodes = new Set([...hostCodes, 'none'])
  const firstCodes = new Set(['unknown', 'native-model-loop-returned',
    'native_turn_succeeded', 'assistant_persistence_unobserved',
    'worker_terminated_unobserved'])
  const regions = new Set(['unknown', 'host_boundary', 'model_or_tool_continuation',
    'post_model_return', 'worker_recovery'])
  const probes = new Set(['collect_scoped_host_trace', 'inspect_engine_and_native_tool_journal',
    'verify_assistant_persistence_and_render', 'inspect_native_reply_boundary',
    'inspect_host_admission_and_worker', 'await_host_terminal_checkpoint',
    'check_worker_exit_and_journal'])
  if (r.schema !== 'lu.native.host-finding.v1' || r.scope !== 'host_only' ||
      typeof r.status !== 'string' || !statuses.has(r.status) ||
      typeof r.lastObserved !== 'string' || !lastCodes.has(r.lastObserved) ||
      typeof r.firstUnobserved !== 'string' || !firstCodes.has(r.firstUnobserved) ||
      typeof r.faultRegion !== 'string' || !regions.has(r.faultRegion) ||
      typeof r.nextProbe !== 'string' || !probes.has(r.nextProbe) ||
      r.droppedEvents !== trace.droppedEvents) return null
  // A damaged trace cannot certify a localization boundary.
  if (trace.droppedEvents > 0 && r.status !== 'insufficient_evidence') return null
  if (r.status !== 'insufficient_evidence') {
    const events = trace.events
    if (events.length === 0 || events.some((event, index) => index > 0 && (
      event.sequence <= events[index - 1].sequence ||
      event.elapsedMillis < events[index - 1].elapsedMillis
    ))) return null

    const stages = events.map(event => event.stage)
    const entered = stages.indexOf('native-model-loop-entered')
    const returned = stages.indexOf('native-model-loop-returned')
    const succeeded = stages.indexOf('native-turn-succeeded')
    const failed = stages.indexOf('native-turn-failed')
    const terminal = succeeded >= 0 ? succeeded : failed
    if ((succeeded >= 0 && failed >= 0) ||
        (terminal >= 0 && terminal !== stages.length - 1) ||
        stages.filter(stage => stage === 'native-turn-succeeded' ||
          stage === 'native-turn-failed').length > 1 ||
        stages.filter(stage => stage === 'native-model-loop-entered').length > 1 ||
        stages.filter(stage => stage === 'native-model-loop-returned').length > 1 ||
        (returned >= 0 && (entered < 0 || returned <= entered)) ||
        (succeeded >= 0 && returned < 0)) return null

    // Match the host's narrowly-scoped finding to the observation sequence
    // itself, not merely to a collection of individually allowed strings.
    if (r.status === 'host_turn_returned') {
      if (succeeded < 0 || r.lastObserved !== 'native-turn-succeeded' ||
          r.firstUnobserved !== 'assistant_persistence_unobserved' ||
          r.faultRegion !== 'host_boundary' ||
          r.nextProbe !== 'verify_assistant_persistence_and_render') return null
    } else if (r.status === 'bounded_host_boundary') {
      if (failed < 0) return null
      if (r.faultRegion === 'model_or_tool_continuation') {
        if (entered < 0 || returned >= 0 ||
            r.lastObserved !== 'native-model-loop-entered' ||
            r.firstUnobserved !== 'native-model-loop-returned' ||
            r.nextProbe !== 'inspect_engine_and_native_tool_journal') return null
      } else if (r.faultRegion === 'post_model_return') {
        if (returned < 0 || r.lastObserved !== 'native-model-loop-returned' ||
            r.firstUnobserved !== 'native_turn_succeeded' ||
            r.nextProbe !== 'inspect_native_reply_boundary') return null
      } else return null
    } else if (r.status === 'in_progress') {
      if (terminal >= 0) return null
      if (r.firstUnobserved === 'worker_terminated_unobserved') {
        if (stages[stages.length - 1] !== 'native-cancel-signalled' ||
            r.lastObserved !== 'native-cancel-signalled' ||
            r.faultRegion !== 'worker_recovery' ||
            r.nextProbe !== 'check_worker_exit_and_journal') return null
      } else if (r.firstUnobserved === 'native-model-loop-returned') {
        if (entered < 0 || returned >= 0 ||
            r.lastObserved !== 'native-model-loop-entered' ||
            r.faultRegion !== 'model_or_tool_continuation' ||
            r.nextProbe !== 'await_host_terminal_checkpoint') return null
      } else if (r.firstUnobserved !== 'unknown' ||
          r.lastObserved !== stages[stages.length - 1] ||
          r.faultRegion !== 'host_boundary' ||
          r.nextProbe !== 'await_host_terminal_checkpoint') return null
    }
  }
  return {
    schema: 'lu.native.host-finding.v1', scope: 'host_only',
    status: r.status as HostFinding['status'],
    lastObserved: r.lastObserved, firstUnobserved: r.firstUnobserved,
    faultRegion: r.faultRegion, nextProbe: r.nextProbe,
    droppedEvents: trace.droppedEvents,
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
    hostFinding: sanitizeLuHostFinding(
      rawHostTrace && typeof rawHostTrace === 'object' && !Array.isArray(rawHostTrace)
        ? (rawHostTrace as Record<string, unknown>).finding : null, hostTrace),
    correlation: { status: link, scope: 'host_only' },
  }
}
/** The operator-facing interpretation contains only fixed phrases.
 * No raw host errors, paths, prompts, model text or caller-provided strings
 * may ever be interpolated into these messages. This is a host-only hint,
 * never a complete Protobuf causal finding or authorization decision. */
export function describeLuHostFinding(finding: HostFinding | null): string {
  if (!finding) return 'No validated host finding is available. Export diagnostics for further investigation.'
  if (finding.status === 'insufficient_evidence') {
    return 'The latest host trace has insufficient evidence. Export diagnostics and check the missing checkpoints.'
  }
  if (finding.status === 'host_turn_returned') {
    return 'The native host turn completed. Assistant message saving and display have not been verified.'
  }
  if (finding.status === 'bounded_host_boundary') {
    if (finding.faultRegion === 'model_or_tool_continuation') {
      return 'The host entered the model loop but the turn failed before its return. Inspect the engine and native-tool journal; the root cause is unconfirmed.'
    }
    if (finding.faultRegion === 'post_model_return') {
      return 'The model loop returned but the native turn failed afterward. Inspect the native response boundary; the root cause is unconfirmed.'
    }
  }
  if (finding.status === 'in_progress') {
    if (finding.firstUnobserved === 'worker_terminated_unobserved') {
      return 'Cancellation was signalled, but worker exit was not observed. Check worker recovery evidence.'
    }
    return 'The latest native turn has no observed terminal checkpoint yet. Recheck after completion.'
  }
  return 'The host finding is inconclusive. Export diagnostics for further investigation.'
}

/** A read-only operator probe; it never starts, cancels or repairs inference. */
export async function checkLuNativeHealth(): Promise<string> {
  if (!isTauri()) return 'Lu diagnostics require the desktop application.'
  try {
    const turnId = activeLuNativeDiagnosticTurn()
    const raw = await invoke<unknown>('lu_inference_diagnostics',
      turnId ? { turnId } : {})
    const trace = sanitizeLuHostTrace(raw)
    const finding = sanitizeLuHostFinding(
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>).finding : null,
      trace,
    )
    return describeLuHostFinding(finding)
  } catch {
    // Intentionally suppress the underlying exception, which may include
    // arbitrary OS paths or backend logs.
    return 'The host diagnostic probe is unavailable. Export diagnostics for further investigation.'
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
