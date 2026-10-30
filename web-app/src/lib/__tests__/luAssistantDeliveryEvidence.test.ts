import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginLuAssistantWrite, expectLuAssistantDelivery, matchesLuAssistantReadback,
  observeLuAssistantReactCommit,
  readLuAssistantDelivery, resetLuAssistantDelivery, resolveLuAssistantReadback,
} from '../luAssistantDeliveryEvidence'

beforeEach(() => resetLuAssistantDelivery())

describe('Native assistant readback and React commit evidence', () => {
  it('model return and optimistic render cannot certify persistent storage', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    observeLuAssistantReactCommit('thread-a', 'assistant-a')
    expect(readLuAssistantDelivery().readback).toBe('unobserved')
    expect(beginLuAssistantWrite('thread-a', 'user-a', 'assistant-a', true)).toBe(true)
    expect(readLuAssistantDelivery()).toEqual({
      scope: 'webview_only', readback: 'pending', reactCommit: 'observed',
    })
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    expect(readLuAssistantDelivery().readback).toBe('confirmed')
  })

  it('rejects wrong conversation/parent and late callbacks', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    expect(beginLuAssistantWrite('thread-b', 'user-a', 'assistant-a', true)).toBe(false)
    expect(beginLuAssistantWrite('thread-a', 'user-b', 'assistant-a', true)).toBe(false)
    expect(beginLuAssistantWrite('thread-a', 'user-a', 'assistant-a', true)).toBe(true)
    resolveLuAssistantReadback('thread-b', 'assistant-a', true)
    resolveLuAssistantReadback('thread-a', 'assistant-b', true)
    expect(readLuAssistantDelivery().readback).toBe('pending')
    resolveLuAssistantReadback('thread-a', 'assistant-a', false)
    expect(readLuAssistantDelivery().readback).toBe('missing')
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    expect(readLuAssistantDelivery().readback).toBe('missing')
    expect(beginLuAssistantWrite('thread-a', 'user-a', 'assistant-b', true)).toBe(false)
  })

  it('a write promise or a wrong-role/content record never proves storage readback', () => {
    const expected = {
      id: 'assistant-a', thread_id: 'thread-a', content: [{ type: 'text', text: 'private' }],
    }
    expect(matchesLuAssistantReadback([], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{ ...expected, role: 'user' }], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{ ...expected, role: 'assistant', id: 'stale' }], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{ ...expected, role: 'assistant', thread_id: 'thread-b' }], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{ ...expected, role: 'assistant', content: [] }], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{ ...expected, role: 'assistant' }], expected)).toBe(true)
  })

  it('never counts fire-and-forget updates as confirmed readback', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    expect(beginLuAssistantWrite('thread-a', 'user-a', 'assistant-a', false)).toBe(false)
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    expect(readLuAssistantDelivery().readback).toBe('update_unverified')
  })

  it('resets stale evidence when a new turn begins', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    beginLuAssistantWrite('thread-a', 'user-a', 'assistant-a', true)
    expectLuAssistantDelivery('thread-b', 'user-b')
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    observeLuAssistantReactCommit('thread-a', 'assistant-a')
    expect(readLuAssistantDelivery().readback).toBe('unobserved')
    expect(readLuAssistantDelivery().reactCommit).toBe('unobserved')
    resetLuAssistantDelivery()
    expect(readLuAssistantDelivery().readback).toBe('unobserved')
  })
})
