import { describe, it, expect } from 'vitest'
import { buildLuDiagnostics, describeLuHostFinding, sanitizeLuHostTrace } from '../luDiagnostics'
import {
  activeLuNativeDiagnosticTurn, beginLuNativeTrace, failLuNativeTrace,
  finishLuNativeTrace, readLuNativeTraceReceipt,
} from '../luDiagnosticEvents'

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
  it('exports only fixed WebView delivery evidence, not private ticket fields', () => {
    const report = buildLuDiagnostics(
      { catalogAvailable: true, admittedCount: 1, loaded: true,
        busy: false, lastNativeToolCalls: 0 },
      null, [], '2026-10-29T00:00:00Z', null,
      { status: 'none', traceRef: null }, false,
      {
        scope: 'webview_only', readback: 'confirmed', reactCommit: 'observed',
        threadId: 'THREAD_SECRET', messageId: 'MESSAGE_SECRET',
        response: 'MODEL_SECRET',
      } as never,
    )
    expect(report.assistantDelivery).toEqual({
      scope: 'webview_only', readback: 'confirmed', reactCommit: 'observed',
    })
    expect(JSON.stringify(report)).not.toContain('SECRET')
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
    expect(safe).toEqual({
      status: 'legacy', traceRef: null, recordingState: null,
      clockDomain: null, droppedEvents: null,
      events: [
        { stage: 'native-model-loop-entered', sequence: 4, elapsedMillis: 200 },
        { stage: 'native-model-loop-returned', sequence: 5, elapsedMillis: 235 },
      ],
    })
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
    expect(report.hostTrace.status).toBe('legacy')
    expect(report.hostTrace.events).toHaveLength(64)
  })

  it('accepts only host-minted v2 refs, bounds dropped evidence and strips raw fields', () => {
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: '0123456789abcdef0123456789abcdef',
      clockDomain: 'host',
      recordingState: 'accepted_turn',
      droppedEvents: 3,
      prompt: 'SECRET_PROMPT',
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 0, path: 'SECRET_PATH' },
        { stage: 'native-model-loop-entered', sequence: 2, elapsedMillis: 18, output: 'SECRET_OUTPUT' },
        { stage: 'NOT_ALLOWED', sequence: 3, elapsedMillis: 20, token: 'SECRET_TOKEN' },
      ],
    }
    const clean = sanitizeLuHostTrace(raw)
    expect(clean).toEqual({
      status: 'ok', traceRef: '0123456789abcdef0123456789abcdef',
      recordingState: 'accepted_turn',
      clockDomain: 'host', droppedEvents: 4,
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 0 },
        { stage: 'native-model-loop-entered', sequence: 2, elapsedMillis: 18 },
      ],
    })
    const json = JSON.stringify(clean)
    for (const secret of ['SECRET_PROMPT', 'SECRET_PATH', 'SECRET_OUTPUT', 'SECRET_TOKEN', 'NOT_ALLOWED']) {
      expect(json).not.toContain(secret)
    }
    for (const traceRef of ['USER-MODEL-DEFINED-REF', 'C:\\\\Users\\\\secret', 'A'.repeat(32), 'x'.repeat(32)]) {
      expect(sanitizeLuHostTrace({ ...raw, traceRef }).status).toBe('unavailable')
    }
  })

  it('never mistakes an absent trace or legacy uncounted losses for complete evidence', () => {
    const missing = sanitizeLuHostTrace(null)
    expect(missing).toEqual({
      status: 'unavailable', traceRef: null, recordingState: null,
      clockDomain: null, droppedEvents: null, events: [],
    })
    const legacy = sanitizeLuHostTrace({
      schema: 'lu.native.host-trace.v1', events: [
        { stage: 'native-model-loop-returned', sequence: 1, elapsedMillis: 1 },
      ],
    })
    expect(legacy.status).toBe('legacy')
    expect(legacy.droppedEvents).toBeNull()
    const invalid = sanitizeLuHostTrace({
      schema: 'lu.native.host-trace.v2',
      traceRef: '0123456789abcdef0123456789abcdef', clockDomain: 'worker',
      droppedEvents: 0, events: [],
    })
    expect(invalid.status).toBe('unavailable')
  })

  it('rejects stale previous-turn evidence after an unobserved trace admission', () => {
    const validGap = {
      schema: 'lu.native.host-trace.v2',
      recordingState: 'admission_unobserved',
      traceRef: null,
      clockDomain: 'host',
      droppedEvents: 1,
      events: [],
    }
    expect(sanitizeLuHostTrace(validGap)).toEqual({
      status: 'unavailable',
      recordingState: 'admission_unobserved',
      traceRef: null, clockDomain: 'host', droppedEvents: 1, events: [],
    })
    const stale = {
      ...validGap, events: [
        { stage: 'native-turn-succeeded', sequence: 999, elapsedMillis: 1 },
      ],
    }
    expect(sanitizeLuHostTrace(stale).status).toBe('unavailable')
    expect(sanitizeLuHostTrace(stale).events).toHaveLength(0)
    expect(sanitizeLuHostTrace({ ...validGap, droppedEvents: 0 }).status).toBe('unavailable')
    expect(sanitizeLuHostTrace({ ...validGap, recordingState: 'accepted_turn' }).status).toBe('unavailable')
  })


  it('rejects checkpoints that claim no accepted host turn', () => {
    const empty = {
      schema: 'lu.native.host-trace.v2', recordingState: 'no_accepted_turn',
      traceRef: null, clockDomain: 'host', droppedEvents: 0, events: [],
    }
    expect(sanitizeLuHostTrace(empty).status).toBe('ok')
    expect(sanitizeLuHostTrace({ ...empty, events: [
      { stage: 'native-turn-succeeded', sequence: 1, elapsedMillis: 1 },
    ] }).status).toBe('unavailable')
    expect(sanitizeLuHostTrace({ ...empty, traceRef: '0123456789abcdef0123456789abcdef' }).status)
      .toBe('unavailable')
  })

  it('joins a completed native response only to the exact accepted host trace', () => {
    const host = {
      schema: 'lu.native.host-trace.v2',
      recordingState: 'accepted_turn',
      traceRef: '0123456789abcdef0123456789abcdef',
      clockDomain: 'host',
      droppedEvents: 0,
      events: [{ stage: 'native-model-loop-returned', sequence: 7, elapsedMillis: 31 }],
      prompt: 'PRIVATE_PROMPT',
    }
    const state = {
      catalogAvailable: true, admittedCount: 1, loaded: true,
      busy: false, lastNativeToolCalls: 0,
    }
    const receipt = { status: 'returned' as const, traceRef: host.traceRef }
    const report = buildLuDiagnostics(state, null, [], undefined, host, receipt)
    expect(report.correlation).toEqual({ status: 'matched_returned', scope: 'host_only' })
    expect(JSON.stringify(report)).not.toContain('PRIVATE_PROMPT')
    expect(JSON.stringify(report)).not.toContain('thread-1')

    const mismatched = buildLuDiagnostics(state, null, [], undefined,
      { ...host, traceRef: 'fedcba9876543210fedcba9876543210' }, receipt)
    expect(mismatched.correlation.status).toBe('mismatch')
    const lost = buildLuDiagnostics(state, null, [], undefined, null, receipt)
    expect(lost.correlation.status).toBe('unavailable')
    const forged = buildLuDiagnostics(state, null, [], undefined, host,
      { status: 'returned', traceRef: null })
    expect(forged.correlation.status).toBe('unavailable')
  })

  it('correlates an in-flight scoped host query without exporting the turn ID', () => {
    const turnId = '123e4567-e89b-42d3-a456-426614174000'
    beginLuNativeTrace(turnId)
    expect(activeLuNativeDiagnosticTurn()).toBe(turnId)
    const receipt = readLuNativeTraceReceipt()
    const state = {
      catalogAvailable: true, admittedCount: 1, loaded: true,
      busy: true, lastNativeToolCalls: null,
    }
    const host = {
      schema: 'lu.native.host-trace.v2',
      recordingState: 'accepted_turn',
      traceRef: '0123456789abcdef0123456789abcdef',
      clockDomain: 'host', droppedEvents: 1, events: [],
    }
    const linked = buildLuDiagnostics(state, null, [], undefined, host, receipt, true)
    expect(linked.correlation.status).toBe('matched_active')
    expect(linked.hostTrace.droppedEvents).toBe(1)
    const unscoped = buildLuDiagnostics(state, null, [], undefined, host, receipt)
    expect(unscoped.correlation.status).toBe('unavailable')
    expect(JSON.stringify(linked)).not.toContain(turnId)

    // Late completion for a previous operation never rewrites new evidence.
    beginLuNativeTrace('123e4567-e89b-42d3-a456-426614174001')
    finishLuNativeTrace(turnId, host.traceRef)
    failLuNativeTrace(turnId)
    expect(readLuNativeTraceReceipt().status).toBe('pending')
    failLuNativeTrace('123e4567-e89b-42d3-a456-426614174001')
    expect(readLuNativeTraceReceipt()).toEqual({ status: 'failed', traceRef: null })
    expect(activeLuNativeDiagnosticTurn()).toBeNull()
  })

  it('exports only trusted host-only diagnostic findings and never raw failure details', () => {
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: '0123456789abcdef0123456789abcdef',
      recordingState: 'accepted_turn', clockDomain: 'host',
      droppedEvents: 0,
      failureClass: 'model_reply_rejected',
      events: [
        { stage: 'native-model-loop-entered', sequence: 1, elapsedMillis: 100 },
        { stage: 'native-turn-failed', sequence: 2, elapsedMillis: 200 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'bounded_host_boundary',
        lastObserved: 'native-model-loop-entered',
        firstUnobserved: 'native-model-loop-returned',
        faultRegion: 'model_or_tool_continuation',
        nextProbe: 'inspect_engine_and_native_tool_journal',
        droppedEvents: 0, exception: 'PRIVATE_PATH_C:\\\\Users\\\\someone',
      },
    }
    const state = { catalogAvailable: true, admittedCount: 1, loaded: true,
      busy: false, lastNativeToolCalls: 0 }
    const report = buildLuDiagnostics(state, null, [], undefined, raw)
    expect(report.hostFinding).toEqual({
      schema: 'lu.native.host-finding.v1', scope: 'host_only',
      status: 'bounded_host_boundary',
      lastObserved: 'native-model-loop-entered',
      firstUnobserved: 'native-model-loop-returned',
      faultRegion: 'model_or_tool_continuation',
      nextProbe: 'inspect_engine_and_native_tool_journal',
      droppedEvents: 0,
    })
    expect(report.hostFailureClass).toBe('model_reply_rejected')
    expect(JSON.stringify(report)).not.toContain('PRIVATE_PATH')

    for (const failureClass of ['model_kind_missing', 'model_kind_nonstring', 'model_kind_unknown']) {
      const classified = buildLuDiagnostics(state, null, [], undefined, { ...raw, failureClass })
      expect(classified.hostFailureClass).toBe(failureClass)
      expect(JSON.stringify(classified)).not.toContain('PRIVATE_PATH')
    }

    const leaked = buildLuDiagnostics(state, null, [], undefined, {
      ...raw, failureClass: 'PRIVATE_PATH_C:\\Users\\someone',
    })
    expect(leaked.hostFailureClass).toBeNull()
    expect(JSON.stringify(leaked)).not.toContain('PRIVATE_PATH')

    const forged = buildLuDiagnostics(state, null, [], undefined, {
      ...raw, finding: { ...raw.finding, nextProbe: 'READ_PRIVATE_FILE' },
    })
    expect(forged.hostFinding).toBeNull()
    const mismatched = buildLuDiagnostics(state, null, [], undefined, {
      ...raw, finding: { ...raw.finding, droppedEvents: 42 },
    })
    expect(mismatched.hostFinding).toBeNull()
    const missing = buildLuDiagnostics(state, null, [], undefined, {
      ...raw, droppedEvents: 1,
    })
    expect(missing.hostFinding).toBeNull()
    expect(missing.hostFailureClass).toBeNull()
    const legacy = buildLuDiagnostics(state, null, [], undefined, {
      ...raw, schema: 'lu.native.host-trace.v1',
    })
    expect(legacy.hostFinding).toBeNull()
  })

  it('describes only host checkpoint findings with content-free operator guidance', () => {
    const baseline = {
      schema: 'lu.native.host-finding.v1' as const, scope: 'host_only' as const,
      status: 'bounded_host_boundary' as const,
      lastObserved: 'native-model-loop-entered',
      firstUnobserved: 'native-model-loop-returned',
      faultRegion: 'model_or_tool_continuation',
      nextProbe: 'inspect_engine_and_native_tool_journal',
      droppedEvents: 0,
    }
    const bounded = describeLuHostFinding(baseline)
    expect(bounded).toContain('engine and native-tool journal')
    expect(bounded).toContain('root cause is unconfirmed')
    const returned = describeLuHostFinding({
      ...baseline, status: 'host_turn_returned',
      lastObserved: 'native-turn-succeeded',
      firstUnobserved: 'assistant_persistence_unobserved',
      faultRegion: 'host_boundary',
      nextProbe: 'verify_assistant_persistence_and_render',
    })
    expect(returned).toContain('saving and display have not been verified')
    const lost = describeLuHostFinding({
      ...baseline, status: 'insufficient_evidence', droppedEvents: 2,
    })
    expect(lost).toContain('insufficient evidence')
    expect(describeLuHostFinding(null)).toContain('No validated host finding')
    const cancelled = describeLuHostFinding({
      ...baseline, status: 'in_progress',
      firstUnobserved: 'worker_terminated_unobserved',
      faultRegion: 'worker_recovery',
      nextProbe: 'check_worker_exit_and_journal',
    })
    expect(cancelled).toContain('worker exit was not observed')
    const output = [bounded, returned, lost, cancelled].join(' ')
    for (const secret of ['PRIVATE_PATH', 'sessionId', 'generationId', 'C:\\\\Users']) {
      expect(output).not.toContain(secret)
    }
  })

  it('reports real in-loop cancellation as unverified worker exit, not routine inference', () => {
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: '0123456789abcdef0123456789abcdef',
      recordingState: 'accepted_turn', clockDomain: 'host', droppedEvents: 0,
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 0 },
        { stage: 'native-worker-entered', sequence: 2, elapsedMillis: 10 },
        { stage: 'native-model-loop-entered', sequence: 3, elapsedMillis: 20 },
        { stage: 'native-cancel-signalled', sequence: 4, elapsedMillis: 25 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'in_progress', lastObserved: 'native-cancel-signalled',
        firstUnobserved: 'worker_terminated_unobserved',
        faultRegion: 'worker_recovery',
        nextProbe: 'check_worker_exit_and_journal',
        droppedEvents: 0,
      },
    }
    const state = { catalogAvailable: true, admittedCount: 1, loaded: true,
      busy: true, lastNativeToolCalls: null }
    const report = buildLuDiagnostics(state, null, [], undefined, raw)
    expect(report.hostFinding?.status).toBe('in_progress')
    expect(report.hostFinding?.faultRegion).toBe('worker_recovery')
    expect(describeLuHostFinding(report.hostFinding)).toContain('worker exit was not observed')
    expect(buildLuDiagnostics(state, null, [], undefined, {
      ...raw, finding: {
        ...raw.finding, lastObserved: 'native-model-loop-entered',
        firstUnobserved: 'native-model-loop-returned',
        faultRegion: 'model_or_tool_continuation',
        nextProbe: 'await_host_terminal_checkpoint',
      },
    }).hostFinding).toBeNull()
  })

  it('preserves only correctly ordered native dispatch observations in a host success', () => {
    const state = { catalogAvailable: true, admittedCount: 1,
      loaded: true, busy: false, lastNativeToolCalls: 1 }
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: 'abcdef0123456789abcdef0123456789',
      recordingState: 'accepted_turn', clockDomain: 'host', droppedEvents: 0,
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 1 },
        { stage: 'native-model-loop-entered', sequence: 2, elapsedMillis: 2 },
        { stage: 'native-tool-dispatch-entered', sequence: 3, elapsedMillis: 3 },
        { stage: 'native-tool-dispatch-returned', sequence: 4, elapsedMillis: 4 },
        { stage: 'native-model-loop-returned', sequence: 5, elapsedMillis: 5 },
        { stage: 'native-turn-succeeded', sequence: 6, elapsedMillis: 6 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'host_turn_returned', lastObserved: 'native-turn-succeeded',
        firstUnobserved: 'assistant_persistence_unobserved',
        faultRegion: 'host_boundary',
        nextProbe: 'verify_assistant_persistence_and_render',
        droppedEvents: 0,
      },
    }
    const finding = (source: unknown) =>
      buildLuDiagnostics(state, null, [], undefined, source).hostFinding
    expect(finding(raw)?.status).toBe('host_turn_returned')
    expect(finding({ ...raw, events: raw.events.map((item, i) =>
      i === 2 ? { ...item, stage: 'native-tool-dispatch-returned' } : item,
    ) })).toBeNull()
    expect(finding({ ...raw, events: raw.events.map((item, i) =>
      i === 3 ? { ...item, stage: 'native-tool-dispatch-entered' } : item,
    ) })).toBeNull()
    expect(finding({ ...raw, events: raw.events.map((item, i) =>
      i === 4 ? { ...item, stage: 'native-tool-dispatch-returned' } : item,
    ) })).toBeNull()
  })

  it('localizes only truly unreturned native tool dispatches, without claiming root cause', () => {
    const state = { catalogAvailable: true, admittedCount: 1,
      loaded: true, busy: true, lastNativeToolCalls: null }
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: 'abcdef0123456789abcdef0123456789',
      recordingState: 'accepted_turn', clockDomain: 'host', droppedEvents: 0,
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 1 },
        { stage: 'native-model-loop-entered', sequence: 2, elapsedMillis: 2 },
        { stage: 'native-tool-dispatch-entered', sequence: 3, elapsedMillis: 3 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'in_progress', lastObserved: 'native-tool-dispatch-entered',
        firstUnobserved: 'native-tool-dispatch-returned',
        faultRegion: 'native_tool_dispatch',
        nextProbe: 'await_native_tool_dispatch_return', droppedEvents: 0,
      },
    }
    const report = (source: unknown) =>
      buildLuDiagnostics(state, null, [], undefined, source).hostFinding
    expect(report(raw)?.status).toBe('in_progress')
    expect(describeLuHostFinding(report(raw))).toContain('returned response is not yet observed')
    const failure = {
      ...raw,
      events: [...raw.events,
        { stage: 'native-turn-failed', sequence: 4, elapsedMillis: 4 }],
      finding: { ...raw.finding, status: 'bounded_host_boundary',
        nextProbe: 'inspect_native_tool_dispatch_journal' },
    }
    expect(report(failure)?.faultRegion).toBe('native_tool_dispatch')
    expect(describeLuHostFinding(report(failure))).toContain('root cause is unconfirmed')
    expect(report({ ...raw, events: [...raw.events,
      { stage: 'native-tool-dispatch-returned', sequence: 4, elapsedMillis: 4 }] })).toBeNull()
    expect(report({ ...failure, finding: {
      ...failure.finding, firstUnobserved: 'native-model-loop-returned',
    } })).toBeNull()
  })

  it('never exports a success finding from failed or contradictory host evidence', () => {
    const state = { catalogAvailable: true, admittedCount: 1,
      loaded: true, busy: false, lastNativeToolCalls: 0 }
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: '0123456789abcdef0123456789abcdef',
      recordingState: 'accepted_turn', clockDomain: 'host', droppedEvents: 0,
      events: [
        { stage: 'native-model-loop-entered', sequence: 1, elapsedMillis: 2 },
        { stage: 'native-turn-failed', sequence: 2, elapsedMillis: 3 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'host_turn_returned', lastObserved: 'native-turn-succeeded',
        firstUnobserved: 'assistant_persistence_unobserved',
        faultRegion: 'host_boundary',
        nextProbe: 'verify_assistant_persistence_and_render',
        droppedEvents: 0,
      },
    }
    const report = (source: unknown) =>
      buildLuDiagnostics(state, null, [], undefined, source).hostFinding
    expect(report(raw)).toBeNull()
    const success = {
      ...raw,
      events: [
        { stage: 'native-model-loop-entered', sequence: 1, elapsedMillis: 2 },
        { stage: 'native-model-loop-returned', sequence: 2, elapsedMillis: 3 },
        { stage: 'native-turn-succeeded', sequence: 3, elapsedMillis: 4 },
      ],
    }
    expect(report(success)?.status).toBe('host_turn_returned')
    // A host success cannot be certified from a trace that conceals an
    // earlier or middle checkpoint despite reporting zero dropped events.
    const complete = {
      ...success,
      events: [
        { stage: 'native-turn-received', sequence: 1, elapsedMillis: 1 },
        { stage: 'native-worker-entered', sequence: 2, elapsedMillis: 2 },
        { stage: 'native-model-loop-entered', sequence: 3, elapsedMillis: 3 },
        { stage: 'native-model-loop-returned', sequence: 4, elapsedMillis: 4 },
        { stage: 'native-turn-succeeded', sequence: 5, elapsedMillis: 5 },
      ],
    }
    expect(report(complete)?.status).toBe('host_turn_returned')
    expect(report({ ...complete, events: complete.events.slice(1) })).toBeNull()
    expect(report({ ...complete, events: [
      complete.events[0], ...complete.events.slice(2),
    ] })).toBeNull()
    expect(report({ ...complete, events: complete.events.map((event, index) =>
      index >= 2 ? { ...event, sequence: event.sequence + 1 } : event,
    ) })).toBeNull()
    expect(report({ ...success, events: [
      ...success.events,
      { stage: 'native-turn-failed', sequence: 4, elapsedMillis: 5 },
    ] })).toBeNull()
    expect(report({ ...success, events: [
      success.events[0], success.events[2],
    ] })).toBeNull()
    expect(report({ ...success, events: [
      success.events[1], success.events[0], success.events[2],
    ] })).toBeNull()
  })

  it('cannot forge a model-loop failure location or hide missing terminal evidence', () => {
    const state = { catalogAvailable: true, admittedCount: 1,
      loaded: true, busy: false, lastNativeToolCalls: 0 }
    const raw = {
      schema: 'lu.native.host-trace.v2',
      traceRef: 'fedcba9876543210fedcba9876543210',
      recordingState: 'accepted_turn', clockDomain: 'host', droppedEvents: 0,
      events: [
        { stage: 'native-model-loop-entered', sequence: 1, elapsedMillis: 2 },
        { stage: 'native-turn-failed', sequence: 2, elapsedMillis: 3 },
      ],
      finding: {
        schema: 'lu.native.host-finding.v1', scope: 'host_only',
        status: 'bounded_host_boundary', lastObserved: 'native-model-loop-entered',
        firstUnobserved: 'native-model-loop-returned',
        faultRegion: 'model_or_tool_continuation',
        nextProbe: 'inspect_engine_and_native_tool_journal',
        droppedEvents: 0,
      },
    }
    const report = (source: unknown) =>
      buildLuDiagnostics(state, null, [], undefined, source).hostFinding
    expect(report(raw)?.status).toBe('bounded_host_boundary')
    expect(report({ ...raw, events: [
      raw.events[0],
      { stage: 'native-model-loop-returned', sequence: 2, elapsedMillis: 3 },
      { stage: 'native-turn-failed', sequence: 3, elapsedMillis: 4 },
    ] })).toBeNull()
    expect(report({ ...raw, events: [raw.events[0]] })).toBeNull()
    expect(report({ ...raw, events: [
      raw.events[0],
      { stage: 'native-turn-failed', sequence: 2, elapsedMillis: 1 },
    ] })).toBeNull()
    expect(report({ ...raw, events: [raw.events[1], raw.events[0]] })).toBeNull()
    expect(report({ ...raw, events: [
      raw.events[0], raw.events[1],
      { stage: 'native-cancel-signalled', sequence: 3, elapsedMillis: 4 },
    ] })).toBeNull()
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
