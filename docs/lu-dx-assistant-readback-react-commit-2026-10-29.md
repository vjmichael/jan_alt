# DX-15D — Native assistant storage readback and React commit

## Problem

A successful native host turn is not a saved or displayed answer. The
shared Lu/Jan `useMessages.addMessage` performs an optimistic UI update.
Furthermore, the default message service can catch a failed underlying
`createMessage` call and return the input message anyway. Awaiting its
promise is therefore **not** a reliable persistence attestation.

## Implemented evidence

- An in-memory one-use native delivery ticket is created only after a
  successful native host response, scoped privately to the originating
  conversation and saved USER message. The next native turn resets it.
- The thread's `onFinish` can consume the ticket only for a meaningful
  non-aborted assistant reply with the exact parent USER turn. An
  `updateMessage` path is deliberately marked `update_unverified`
  because the existing update call is fire-and-forget.
- For a newly created assistant record, the route waits for the shared
  add call and then independently invokes the message service's
  `fetchMessages(threadId)`. It confirms only when a returned record has
  the exact expected assistant ID, thread ID, assistant role and serialized
  content. Missing/error readback cannot be called a success.
- Only the last mounted assistant `MessageItem` can report a React
  commit through its post-commit `useEffect`. This observation is
  separate from a storage readback. Stream completion alone is not
  a render observation.
- The diagnostics export adds only an allowlisted
  `assistantDelivery` object with `scope=webview_only`, a fixed
  `readback` status and fixed `reactCommit` status. The original
  conversation, message and model identifiers never appear in exports.
- Unit tests cover a pending write, successful/missing readback,
  optimistic render before save, wrong conversation or parent, late
  callbacks, fresh-turn replacement and non-awaited updates.

## Explicit limits

A successful readback means the existing conversation service returned
the specific record. This is **not** an fsync guarantee, proof of
surviving a cold application restart, physical pixel paint, or evidence
that a user saw the reply. React commit proves a component effect ran
after React committed that assistant component; it may be scrolled out
of view. Neither event is converted into a Protobuf worker-clock
checkpoint or a fabricated parent edge. The host-only and WebView-only
observations are exported separately.

DX-15E should test recovery after a true installed Windows restart and
re-read persisted conversation files, plus separate DOM visibility
testing. No physical user's Windows profile, AX/Cowork extraction,
Cognitum or protected main is modified.

Stacks on DX-15C PR #81.
