/**
 * Lu's text-GGUF importer. This is a separate host-owned workflow from the
 * inherited Jan llama.cpp plugin import dialog. The WebView never passes a
 * filesystem path into an authorized tool: the Rust host opens its own picker.
 */
import { useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useLuInference } from '@/lib/luInference'
import { toast } from 'sonner'

type NativeImportResult = {
  cancelled: boolean
  modelRef?: string
  name?: string
  bytes?: number
}

type Props = {
  trigger?: React.ReactNode
}

export function LuNativeImportModelDialog({ trigger }: Props) {
  const [open, setOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')
  const catalog = useLuInference((state) => state.catalog)
  const busy = useLuInference((state) => state.busy)
  const sessionId = useLuInference((state) => state.sessionId)
  const refresh = useLuInference((state) => state.refresh)

  useEffect(() => {
    if (open && isTauri()) {
      void refresh().catch(() => {})
    }
  }, [open, refresh])

  const available = isTauri() && catalog?.available === true
  const disabled = importing || busy || Boolean(sessionId) || !available

  const importModel = async () => {
    if (disabled) return
    setImporting(true)
    setNotice('')
    try {
      // Opens a trusted OS file dialog inside Rust. Never pass a selected
      // WebView path (or model-supplied path) to the Lu native tool API.
      const result = await invoke<NativeImportResult>('lu_inference_import_model')
      if (result.cancelled) return
      if (!result.modelRef || !result.name) {
        throw new Error('Import completed without an admitted model')
      }
      await refresh()
      setNotice(`Imported ${result.name}. Select Load in Lu native GGUF to run it.`)
      toast.success('GGUF imported into Lu')
    } catch {
      setNotice(
        'Lu could not import this GGUF. Verify the file, free disk space, and that no model is currently loaded.'
      )
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!importing) setOpen(next) }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import GGUF into Lu</DialogTitle>
          <DialogDescription>
            Lu Alpha currently supports text-only GGUF models through its
            trusted native file picker. MMProj, image/audio models and
            speculative draft attachments are not yet supported.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!available && (
            <p role="status" className="text-sm text-destructive">
              {catalog?.reason || 'Lu native inference is unavailable in this installed build.'}
            </p>
          )}
          {sessionId && (
            <p role="status" className="text-sm">
              Unload the current model in Lu native GGUF before importing another.
            </p>
          )}
          {notice && <p role="status" aria-live="polite" className="text-sm">{notice}</p>}
          <p className="text-sm text-muted-foreground">
            Your original GGUF stays in its current location. Lu copies and
            validates it in its private model directory.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={importing}>
            Close
          </Button>
          <Button
            type="button"
            data-testid="lu-native-import-dialog-action"
            onClick={() => void importModel()}
            disabled={disabled}
          >
            {importing ? 'Importing…' : 'Choose GGUF file'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
