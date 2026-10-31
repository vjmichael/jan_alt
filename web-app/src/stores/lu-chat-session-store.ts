import type { Chat, UIMessage } from '@ai-sdk/react'
import type { ChatStatus } from 'ai'
import { create } from 'zustand'
import { LuChatTransport } from '@/lib/luChatTransport'

// LCX-02: Lu-owned native chat session registry. Not connected to Jan's
// CustomChatTransport, provider factory, MCP subscriptions or Cowork.
export type LuChatSession = {
  chat: Chat<UIMessage>
  transport: LuChatTransport
  status: ChatStatus
  title?: string
  unsubscribe?: () => void
}
type LuSessions = {
  sessions: Record<string, LuChatSession>
  ensure: (id: string, createChat: (t: LuChatTransport) => Chat<UIMessage>, title?: string) => LuChatSession
  updateStatus: (id: string, status: ChatStatus) => void
  remove: (id: string) => void
  clear: () => void
}
const stop = (s: LuChatSession) => {
  try { s.chat.stop() } finally { s.unsubscribe?.() }
}
export const useLuChatSessions = create<LuSessions>((set, get) => ({
  sessions: {},
  ensure: (id, make, title) => {
    if (!id || id.length > 128) throw new Error('Invalid Lu conversation identity.')
    const prior = get().sessions[id]
    if (prior) return prior
    const transport = new LuChatTransport(id)
    const chat = make(transport)
    const session: LuChatSession = { chat, transport, title, status: chat.status }
    const register = chat['~registerStatusCallback']
    if (register) session.unsubscribe = register.call(chat, () => {
      get().updateStatus(id, chat.status)
    })
    set(state => ({ sessions: { ...state.sessions, [id]: session } }))
    return session
  },
  updateStatus: (id, status) => set(state => {
    const old = state.sessions[id]
    if (!old || old.status === status) return state
    return { sessions: { ...state.sessions, [id]: { ...old, status } } }
  }),
  remove: id => {
    const old = get().sessions[id]
    if (!old) return
    set(state => {
      const sessions = { ...state.sessions }
      delete sessions[id]
      return { sessions }
    })
    stop(old)
  },
  clear: () => {
    const sessions = Object.values(get().sessions)
    set({ sessions: {} })
    for (const session of sessions) stop(session)
  },
}))
