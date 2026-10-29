/** In-memory, bounded, content-free Lu diagnostic timeline.
 * Never record prompts, file paths, model filenames, secrets, or thread IDs. */
export type LuDiagnosticCode =
  | 'catalog-ready' | 'catalog-failed' | 'model-load-start' | 'model-load-ready'
  | 'model-load-failed' | 'model-unload-ready' | 'model-unload-failed'
  | 'native-turn-start' | 'native-turn-finished' | 'native-turn-failed'
  | 'native-turn-cancel-requested'
export type LuDiagnosticEvent = { code: LuDiagnosticCode; at: string }
const allowed = new Set<LuDiagnosticCode>([
  'catalog-ready','catalog-failed','model-load-start','model-load-ready',
  'model-load-failed','model-unload-ready','model-unload-failed',
  'native-turn-start','native-turn-finished','native-turn-failed','native-turn-cancel-requested',
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
