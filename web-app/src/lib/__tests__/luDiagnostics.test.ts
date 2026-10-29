import { describe, it, expect } from 'vitest'
import { buildLuDiagnostics, sanitizeLuHostTrace } from '../luDiagnostics'

describe('Lu content-free diagnostic export', () => {
  it('redacts raw host identifiers, paths and unsupported fields', () => {
    const report = buildLuDiagnostics(
      { catalogAvailable: true, admittedCount: 3, loaded: true, busy: true, lastNativeToolCalls: 1 },
      { phase: 'Ready', pid: 1234, sessionId: 'session-secret', generationId: 'generation-secret',
        prompt: 'PROMPT_SECRET', path: 'C:\\Users\\secret\\models' },
      [
        { code: 'model-load-ready', at: '2026-10-29T00:00:00.000Z' },
        { code: 'PROMPT_SECRET' as never, at: '2026-10-29T00:00:00.000Z' },
      ],
    )
    const payload = JSON.stringify(report)
    expect(payload).toContain('model-load-ready')
    for (const secret of ['PROMPT_SECRET','session-secret','generation-secret','Users','1234']) {
      expect(payload).not.toContain(secret)
    }
  })
  it('shows fixed-code host stage sequence without leaking host-provided raw fields', () => {
    const raw = {
      schema: 'lu.native.host-trace.v1',
      secretPrompt: 'SECRET_PROMPT',
      events: [
        { stage: 'native-model-loop-entered', sequence: 4, elapsedMillis: 200,
          path: 'C:\\Users\\private\\notes.txt', answer: 'SECRET_ANSWER' },
        { stage: 'native-model-loop-returned', sequence: 5, elapsedMillis: 235,
          token: 'SECRET_TOKEN' },
        { stage: 'SECRET_STAGE', sequence: 6, elapsedMillis: 240 },
        { stage: 'native-turn-failed', sequence: 7, elapsedMillis: -1 },
      ],
    }
    const safe = sanitizeLuHostTrace(raw)
    expect(safe).toEqual({ status: 'ok', events: [
      { stage: 'native-model-loop-entered', sequence: 4, elapsedMillis: 200 },
      { stage: 'native-model-loop-returned', sequence: 5, elapsedMillis: 235 },
    ] })
    const data = JSON.stringify(safe)
    for (const secret of ['SECRET_PROMPT','SECRET_ANSWER','SECRET_TOKEN','SECRET_STAGE','private']) {
      expect(data).not.toContain(secret)
    }
  })
  it('fails closed on unknown host schema and caps untrusted events at 64', () => {
    expect(sanitizeLuHostTrace({ schema: 'unexpected', events: [] }).status).toBe('unavailable')
    expect(sanitizeLuHostTrace(null).events).toEqual([])
    const raw = {
      schema: 'lu.native.host-trace.v1',
      events: Array.from({ length: 100 }, (_, i) => ({
        stage: 'native-turn-received', sequence: i + 1, elapsedMillis: i,
      })),
    }
    expect(sanitizeLuHostTrace(raw).events).toHaveLength(64)
    const report = buildLuDiagnostics(
      { catalogAvailable: true, admittedCount: 1, loaded: true, busy: false, lastNativeToolCalls: 0 },
      null, [], '2026-10-29T00:00:00.000Z', raw,
    )
    expect(report.hostTrace.status).toBe('ok')
    expect(report.hostTrace.events).toHaveLength(64)
  })

  it('limits events and status enum to known values', () => {
    const status = buildLuDiagnostics(
      { catalogAvailable: false, admittedCount: -4, loaded: false, busy: false, lastNativeToolCalls: -1 },
      { phase: 'SECRET_PHASE', pid: '9999' },
      Array.from({ length: 55 }, () => ({ code: 'native-turn-start' as const, at: '2026-10-29T01:00:00Z' })),
    )
    expect(status.engine.phase).toBe('Unknown')
    expect(status.events).toHaveLength(32)
    expect(status.lastNativeToolCalls).toBeNull()
    expect(status.model.admittedCount).toBe(0)
  })
})
