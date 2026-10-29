import { describe, it, expect } from 'vitest'
import { buildLuDiagnostics } from '../luDiagnostics'

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
