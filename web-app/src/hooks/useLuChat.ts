import { Chat, type UIMessage, useChat as useChatSDK } from '@ai-sdk/react'
import type { ChatInit } from 'ai'
import { useEffect, useMemo } from 'react'
import { useLuChatSessions } from '@/stores/lu-chat-session-store'

// LCX-02: Independent Lu native chat hook. No Jan providers, service hub,
// MCP, inherited router, Cowork or Jan CustomChatTransport. Experimental;
// the actual thread screen must be separately migrated and GUI-tested.
type LuChatOptions = Omit<ChatInit<UIMessage>, 'transport'> & {
  sessionId: string
  sessionTitle?: string
  experimental_throttle?: number
}
export function useLuChat(options: LuChatOptions) {
  const ensure = useLuChatSessions(s => s.ensure)
  const updateStatus = useLuChatSessions(s => s.updateStatus)
  const { sessionId, sessionTitle, experimental_throttle, ...init } = options
  const session = useMemo(() => ensure(sessionId,
    transport => new Chat({ ...init, transport }), sessionTitle),
    // One host-scoped transport per conversation; callback updates must not
    // silently replace an actively running host turn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, ensure])
  const result = useChatSDK({
    chat: session.chat,
    experimental_throttle,
    resume: false,
  })
  useEffect(() => updateStatus(sessionId, result.status),
    [sessionId, result.status, updateStatus])
  return result
}
