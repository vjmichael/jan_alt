/** Content-free WebView observations for one returned Lu native assistant.
 * A message-service readback is NOT fsync/restart durability; React commit
 * is NOT proof of actual pixel painting or the user seeing the reply.
 */
export type LuAssistantDeliverySummary = {
  scope: 'webview_only'
  readback: 'unobserved' | 'pending' | 'confirmed' | 'missing' | 'update_unverified'
  reactCommit: 'unobserved' | 'observed'
}
type Ticket = {
  threadId: string
  userTurnId: string
  assistantId: string | null
  candidateId: string | null
  readback: LuAssistantDeliverySummary['readback']
  committed: boolean
}
let ticket: Ticket | null = null

export function resetLuAssistantDelivery(): void {
  ticket = null
}
export function expectLuAssistantDelivery(threadId: string, userTurnId: string): void {
  ticket = threadId && userTurnId ? {
    threadId, userTurnId, assistantId: null, candidateId: null,
    readback: 'unobserved', committed: false,
  } : null
}
/** A one-use receipt tied to the exact saved user parent and conversation. */
export function beginLuAssistantWrite(
  threadId: string, userTurnId: string | null, assistantId: string, created: boolean,
): boolean {
  if (!ticket || ticket.threadId !== threadId ||
      ticket.userTurnId !== userTurnId || !assistantId || ticket.assistantId) return false
  ticket.assistantId = assistantId
  ticket.committed = ticket.candidateId === assistantId
  ticket.readback = created ? 'pending' : 'update_unverified'
  return created
}
/** Legacy linear conversations have no metadata.parentId. Keep their
 * original message topology; bind the one-use native delivery receipt to
 * the final persisted user turn in that same conversation. Explicit branch
 * parents take precedence, and the ticket still verifies the host-saved user
 * ID before any readback or React commit can certify a reply. */
export function resolveLuAssistantEvidenceParent(
  threadId: string,
  explicitParentId: string | null,
  persisted: ReadonlyArray<{ id: string; role: string; thread_id: string }>,
  branched: boolean,
): string | null {
  if (explicitParentId) return explicitParentId
  if (branched) return null
  const last = persisted[persisted.length - 1]
  return last && last.thread_id === threadId && last.role === 'user' && last.id
    ? last.id : null
}
/** Compare against a fresh message-service readback. No content is kept or
 * exported; matching a record does not establish fsync/restart durability. */
export function matchesLuAssistantReadback(
  returned: unknown,
  expected: { id: string; thread_id: string; content: unknown },
): boolean {
  if (!Array.isArray(returned) || !expected.id || !expected.thread_id) return false
  return returned.some((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const candidate = item as Record<string, unknown>
    return candidate.id === expected.id &&
      candidate.thread_id === expected.thread_id &&
      candidate.role === 'assistant' &&
      JSON.stringify(candidate.content) === JSON.stringify(expected.content)
  })
}

export function resolveLuAssistantReadback(
  threadId: string, assistantId: string, found: boolean,
): void {
  if (!ticket || ticket.threadId !== threadId ||
      ticket.assistantId !== assistantId || ticket.readback !== 'pending') return
  ticket.readback = found ? 'confirmed' : 'missing'
}
/** Called by the actual last-assistant MessageItem after React commit. */
export function observeLuAssistantReactCommit(threadId: string, assistantId: string): void {
  if (!ticket || ticket.threadId !== threadId || !assistantId) return
  if (ticket.assistantId === assistantId) ticket.committed = true
  else if (!ticket.assistantId) ticket.candidateId = assistantId
}
export function readLuAssistantDelivery(): LuAssistantDeliverySummary {
  return {
    scope: 'webview_only',
    readback: ticket?.readback ?? 'unobserved',
    reactCommit: ticket?.committed ? 'observed' : 'unobserved',
  }
}
