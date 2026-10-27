import { useCallback, useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { AlertTriangle, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Display-only fields from a trusted Rust pending request. They cannot be
 * submitted as grant claims; all approval inputs stay with the Rust host. */
type ConsentView = {
  requestId: string
  conversationId: string
  userTurnId: string
  profileId: string
  scopeId: string
  packageId: string
  publisher: string
  signingKeyId: string
  artifactDigest: string
  toolId: string
  effect: string
  expiresAt: number
}

const REQUEST_EVENT = 'lu-ce-consent-pending'

export default function LuCeConsentDialog() {
  const [pending, setPending] = useState<ConsentView[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    if (!isTauri()) return
    try {
      const current = await invoke<ConsentView[]>('lu_ce_consent_pending')
      setPending(Array.isArray(current) ? current : [])
    } catch {
      // A non-Lu desktop or untrusted window has no CE consent surface.
      setPending([])
    }
  }, [])

  useEffect(() => {
    if (!isTauri()) return
    let active = true
    void refresh()
    const listener = listen<ConsentView>(REQUEST_EVENT, () => {
      if (active) void refresh()
    })
    return () => {
      active = false
      void listener.then((unlisten) => unlisten())
    }
  }, [refresh])

  const request = pending[0]
  const deny = async () => {
    if (!request || busy) return
    setBusy(true)
    setError('')
    try {
      await invoke('lu_ce_consent_deny', { requestId: request.requestId })
      await refresh()
    } catch {
      setError('Unable to dismiss this request. Reopen Lu if this persists.')
    } finally {
      setBusy(false)
    }
  }

  const review = async () => {
    if (!request || busy) return
    setBusy(true)
    setError('')
    try {
      // The OS-native confirmation dialog performs the actual consent action.
      // This call sends only an opaque pending ID, never approval=true,
      // signer bytes, a root path, or a model-provided user-role claim.
      const approved = await invoke<boolean>('lu_ce_consent_review', {
        requestId: request.requestId,
      })
      if (!approved) setError('Permission denied. No grant was created.')
      await refresh()
    } catch {
      setError('The host rejected or could not verify this approval.')
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  if (!request) return null

  return (
    <Dialog open onOpenChange={(open) => { if (!open) void deny() }}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => { if (busy) event.preventDefault() }}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LockKeyhole className="size-5" />
            Core Extension permission
          </DialogTitle>
          <DialogDescription>
            Lu is asking for a specific capability on behalf of a signed
            extension. This permission will not be granted unless you confirm
            again in the native system dialog.
          </DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 rounded-lg border p-3 text-sm">
          <dt className="text-muted-foreground">Publisher</dt>
          <dd className="break-all">{request.publisher}</dd>
          <dt className="text-muted-foreground">Extension</dt>
          <dd className="break-all">{request.packageId}</dd>
          <dt className="text-muted-foreground">Tool</dt>
          <dd className="break-all">{request.toolId}</dd>
          <dt className="text-muted-foreground">Access</dt>
          <dd>{request.effect}</dd>
          <dt className="text-muted-foreground">Workspace scope</dt>
          <dd className="break-all">{request.scopeId}</dd>
          <dt className="text-muted-foreground">Profile</dt>
          <dd className="break-all">{request.profileId}</dd>
          <dt className="text-muted-foreground">Signer key</dt>
          <dd className="break-all">{request.signingKeyId}</dd>
          <dt className="text-muted-foreground">Package SHA-256</dt>
          <dd className="break-all font-mono text-xs">{request.artifactDigest}</dd>
          <dt className="text-muted-foreground">Expires</dt>
          <dd>{new Date(request.expiresAt * 1000).toLocaleString()}</dd>
        </dl>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="size-4 shrink-0" />
          A model response or extension cannot approve this request. The desktop
          host checks the original user turn and the exact signed package again.
        </p>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {pending.length > 1 && (
          <p className="text-xs text-muted-foreground">
            {pending.length - 1} more permission requests are pending.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => void deny()}>
            Deny
          </Button>
          <Button disabled={busy} onClick={() => void review()}>
            {busy ? 'Checking…' : 'Review in system dialog'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
