import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Chat, UIMessage } from '@ai-sdk/react'
import type { ChatStatus } from 'ai'
import { useLuChatSessions } from '@/stores/lu-chat-session-store'
const fixture=()=>{
  const state = { status: 'ready' as ChatStatus }
  const stop=vi.fn(),unsubscribe=vi.fn(),callbacks: Array<()=>void>=[]
  const chat={
    get status() { return state.status },
    stop,
    ['~registerStatusCallback']: (cb:()=>void) => {
      callbacks.push(cb);return unsubscribe
    },
  } as unknown as Chat<UIMessage>
  return { chat, state, stop, unsubscribe, callbacks }
}
beforeEach(()=>useLuChatSessions.getState().clear())
describe('LCX-02 native Lu-owned chat session isolation',()=>{
  it('reuses same native session and transport for same thread',()=>{
    const f=fixture(),create=vi.fn(()=>f.chat)
    const a=useLuChatSessions.getState().ensure('a',create)
    const b=useLuChatSessions.getState().ensure('a',create)
    expect(a.transport).toBe(b.transport)
    expect(create).toHaveBeenCalledTimes(1)
  })
  it('separates two live conversation identities',()=>{
    const a=useLuChatSessions.getState().ensure('a',()=>fixture().chat)
    const b=useLuChatSessions.getState().ensure('b',()=>fixture().chat)
    expect(a.transport).not.toBe(b.transport)
  })
  it('does not create an unnamed session',()=>{
    expect(()=>useLuChatSessions.getState().ensure('',()=>fixture().chat)).toThrow()
  })
  it('propagates status to only matching Lu conversation',()=>{
    const a=fixture(),b=fixture()
    useLuChatSessions.getState().ensure('a',()=>a.chat)
    useLuChatSessions.getState().ensure('b',()=>b.chat)
    a.state.status='streaming';a.callbacks[0]()
    expect(useLuChatSessions.getState().sessions.a.status).toBe('streaming')
    expect(useLuChatSessions.getState().sessions.b.status).toBe('ready')
  })
  it('stops only deleted chat and unsubscribes',()=>{
    const a=fixture(),b=fixture()
    useLuChatSessions.getState().ensure('a',()=>a.chat)
    useLuChatSessions.getState().ensure('b',()=>b.chat)
    useLuChatSessions.getState().remove('a')
    expect(a.stop).toHaveBeenCalledOnce()
    expect(a.unsubscribe).toHaveBeenCalledOnce()
    expect(b.stop).not.toHaveBeenCalled()
  })
  it('clears all native chat sessions and invokes stop',()=>{
    const a=fixture(),b=fixture()
    useLuChatSessions.getState().ensure('a',()=>a.chat)
    useLuChatSessions.getState().ensure('b',()=>b.chat)
    useLuChatSessions.getState().clear()
    expect(a.stop).toHaveBeenCalledOnce()
    expect(b.stop).toHaveBeenCalledOnce()
    expect(useLuChatSessions.getState().sessions).toEqual({})
  })
})
