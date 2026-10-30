/** In-memory, bounded, content-free Lu diagnostic timeline.
 * Never record prompts, file paths, model filenames, secrets, or thread IDs. */
export type LuDiagnosticCode =
  | 'catalog-ready' | 'catalog-failed' | 'model-load-start' | 'model-load-ready'
  | 'model-load-failed' | 'model-unload-ready' | 'model-unload-failed'
  | 'native-turn-start' | 'native-turn-finished' | 'native-turn-failed'
  | 'native-turn-cancel-requested' | 'user-turn-persisted' | 'native-ipc-invoked' | 'native-ipc-returned' | 'native-stream-closed'
export type LuDiagnosticEvent = { code: LuDiagnosticCode; at: string }
const allowed = new Set<LuDiagnosticCode>([
  'catalog-ready','catalog-failed','model-load-start','model-load-ready',
  'model-load-failed','model-unload-ready','model-unload-failed',
  'native-turn-start','native-turn-finished','native-turn-failed','native-turn-cancel-requested','user-turn-persisted','native-ipc-invoked',
  'native-ipc-returned','native-stream-closed',
])
const events: LuDiagnosticEvent[] = []
export function noteLuDiagnostic(code: LuDiagnosticCode): void {
  if (!allowed.has(code)) return
  events.push({ code, at: new Date().toISOString() })
  if (events.length > 32) events.splice(0, events.length - 32)
}
export function readLuDiagnosticEvents(): LuDiagnosticEvent[] {
  return events.map(event => ({ ...event }))
}


/** Ephemeral WebView-side correlation, never an authorization record.
 * The locally generated turn ID is used ONLY for a scoped read from the host,
 * and is never included in diagnostics exports. A late reply from a cancelled
 * turn cannot overwrite a newer operation's evidence. */
export type LuNativeTraceReceipt = {
  status: 'none' | 'pending' | 'returned' | 'failed'
  traceRef: string | null
}
let nativeTrace: LuNativeTraceReceipt = { status: 'none', traceRef: null }
let activeTurnId: string | null = null

export function beginLuNativeTrace(turnId: string): void {
  activeTurnId = turnId
  nativeTrace = { status: 'pending', traceRef: null }
}

export function finishLuNativeTrace(turnId: string, traceRef: unknown): boolean {
  if (activeTurnId !== turnId || nativeTrace.status !== 'pending') return false
  nativeTrace = {
    status: 'returned',
    traceRef: typeof traceRef === 'string' && /^[0-9a-f]{32}$/.test(traceRef)
      ? traceRef : null,
  }
  activeTurnId = null
  return true
}

export function failLuNativeTrace(turnId: string): void {
  if (activeTurnId !== turnId || nativeTrace.status !== 'pending') return
  nativeTrace = { status: 'failed', traceRef: null }
  activeTurnId = null
}

export function activeLuNativeDiagnosticTurn(): string | null {
  return nativeTrace.status === 'pending' ? activeTurnId : null
}

export function readLuNativeTraceReceipt(): LuNativeTraceReceipt {
  return { ...nativeTrace }
}
