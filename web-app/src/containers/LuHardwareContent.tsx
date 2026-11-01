import { useCallback, useEffect, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'

type VulkanDevice = { name: string; driverVersion: string }
type LuDeviceReport = {
  backendId: string
  enginePackageReady: boolean
  vulkanDevices: VulkanDevice[]
  gpuOffloadVerified: boolean
  diagnostic: string
}

/**
 * First-party Lu device status. The inherited Jan 'llamacpp' plugin is not
 * registered for the Lu distribution, so never query it from Hardware.
 * A driver device is not proof that inference actually used the GPU.
 */
export function LuHardwareContent() {
  const [report, setReport] = useState<LuDeviceReport | null>(null)
  const [failure, setFailure] = useState('')
  const [checking, setChecking] = useState(false)
  const refresh = useCallback(async () => {
    if (!isTauri()) {
      setFailure('Lu hardware detection requires the desktop application.')
      return
    }
    setChecking(true)
    setFailure('')
    try {
      const value = await invoke<LuDeviceReport>('lu_inference_devices')
      if (!Array.isArray(value.vulkanDevices)) throw new Error('invalid device inventory')
      setReport(value)
    } catch {
      setReport(null)
      setFailure('Lu GPU inventory failed; this is not proof that no GPU is installed.')
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <div className="flex w-full flex-col gap-4 p-6" data-testid="lu-hardware">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lu Hardware</h1>
        <button className="rounded border px-3 py-1 disabled:opacity-50" type="button"
          disabled={checking} onClick={() => void refresh()}>
          {checking ? 'Checking…' : 'Refresh GPU detection'}
        </button>
      </div>
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Local inference engine</h2>
        <p className="mt-2 text-sm">Backend: {report?.backendId ?? 'Not checked'}</p>
        <p className="text-sm">Verified native package: {report?.enginePackageReady ? 'Available' : 'Not available'}</p>
        <p className="text-sm">GPU inference verified: {report?.gpuOffloadVerified ? 'Yes' : 'Not yet'}</p>
      </section>
      <section className="rounded-lg border p-4">
        <h2 className="font-semibold">Vulkan devices reported by Windows</h2>
        {report?.vulkanDevices.length ? (
          <ul className="mt-2 list-disc pl-5">
            {report.vulkanDevices.map((device, i) => (
              <li key={i}>{device.name} — driver {device.driverVersion || 'unknown'}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm">No Vulkan device has been confirmed by Lu.</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground" role="status">
          {failure || report?.diagnostic || (checking ? 'Checking hardware…' : '')}
        </p>
      </section>
      <p className="text-sm text-muted-foreground">
        A detected GPU does not establish that the loaded GGUF used it.
        The alpha GPU gate requires loading a real model and confirming GPU
        execution on the target Windows PC. No Jan llama.cpp plugin is used.
      </p>
    </div>
  )
}
