import { beforeEach, describe, expect, it } from 'vitest'
import {
  beginLuAssistantWrite, expectLuAssistantDelivery, matchesLuAssistantReadback,
  observeLuAssistantReactCommit,
  readLuAssistantDelivery, resetLuAssistantDelivery, resolveLuAssistantReadback,
  resolveLuAssistantEvidenceParent,
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

  it('preserves exact JSON values across Rust JSONL object key reordering', () => {
    const expected = {
      id: 'assistant-a', thread_id: 'thread-a',
      content: [{ type: 'text', text: { value: 'hi', annotations: [{ key: 'x', values: [1, 2] }] } }],
    }
    const reordered = {
      id: 'assistant-a', thread_id: 'thread-a', role: 'assistant',
      content: [{ text: { annotations: [{ values: [1, 2], key: 'x' }], value: 'hi' }, type: 'text' }],
    }
    expect(matchesLuAssistantReadback([reordered], expected)).toBe(true)
    expect(matchesLuAssistantReadback([{
      ...reordered, content: [{ ...reordered.content[0], type: 'file' }],
    }], expected)).toBe(false)
    expect(matchesLuAssistantReadback([{
      ...reordered, content: [{ ...reordered.content[0], text: { ...reordered.content[0].text, annotations: [{ values: [2, 1], key: 'x' }] } }],
    }], expected)).toBe(false)
  })

  it('never counts fire-and-forget updates as confirmed readback', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    expect(beginLuAssistantWrite('thread-a', 'user-a', 'assistant-a', false)).toBe(false)
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    expect(readLuAssistantDelivery().readback).toBe('update_unverified')
  })

  it('certifies a first native reply in a legacy linear conversation without branch metadata', () => {
    expectLuAssistantDelivery('thread-a', 'user-a')
    const existing = [{ id: 'user-a', role: 'user', thread_id: 'thread-a' }]
    const receiptParent = resolveLuAssistantEvidenceParent(
      'thread-a', null, existing, false,
    )
    expect(receiptParent).toBe('user-a')
    observeLuAssistantReactCommit('thread-a', 'assistant-a')
    expect(beginLuAssistantWrite('thread-a', receiptParent, 'assistant-a', true)).toBe(true)
    const assistant = {
      id: 'assistant-a', thread_id: 'thread-a', content: [{ type: 'text', text: { value: 'hello' } }],
    }
    expect(matchesLuAssistantReadback([{ ...assistant, role: 'assistant' }], assistant)).toBe(true)
    resolveLuAssistantReadback('thread-a', 'assistant-a', true)
    expect(readLuAssistantDelivery()).toEqual({
      scope: 'webview_only', readback: 'confirmed', reactCommit: 'observed',
    })
  })

  it('cannot invent a receipt parent for a branched, stale or wrong-thread path', () => {
    const user = { id: 'user-a', role: 'user', thread_id: 'thread-a' }
    const assistant = { id: 'assistant-old', role: 'assistant', thread_id: 'thread-a' }
    expect(resolveLuAssistantEvidenceParent('thread-a', null, [user], true)).toBe(null)
    expect(resolveLuAssistantEvidenceParent('thread-a', null, [user, assistant], false)).toBe(null)
    expect(resolveLuAssistantEvidenceParent('thread-b', null, [user], false)).toBe(null)
    expect(resolveLuAssistantEvidenceParent('thread-a', 'user-b', [user], true)).toBe('user-b')
    expectLuAssistantDelivery('thread-a', 'user-a')
    expect(beginLuAssistantWrite('thread-a', 'user-b', 'assistant-a', true)).toBe(false)
    expect(beginLuAssistantWrite('thread-a', null, 'assistant-a', true)).toBe(false)
    expect(readLuAssistantDelivery().readback).toBe('unobserved')
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
