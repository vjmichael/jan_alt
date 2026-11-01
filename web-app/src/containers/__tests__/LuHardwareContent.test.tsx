import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: host.invoke,
  isTauri: host.isTauri,
}))

import { LuHardwareContent } from '../LuHardwareContent'

beforeEach(() => {
  vi.clearAllMocks()
  host.isTauri.mockReturnValue(true)
})

describe('Lu-owned Vulkan Hardware diagnostics', () => {
  it('displays reported Vulkan GPUs without claiming physical inference offload', async () => {
    host.invoke.mockResolvedValue({
      backendId: 'llama-vulkan',
      enginePackageReady: true,
      gpuOffloadVerified: false,
      vulkanDevices: [{ name: 'AMD Radeon Example', driverVersion: '1.2.3' }],
      diagnostic: 'GPU inference still requires a real GGUF test.',
    })
    render(<LuHardwareContent />)
    await waitFor(() => expect(screen.getByText(/AMD Radeon Example/)).toBeInTheDocument())
    expect(screen.getByText('GPU inference verified: Not yet')).toBeInTheDocument()
    expect(host.invoke).toHaveBeenCalledWith('lu_inference_devices')
    fireEvent.click(screen.getByRole('button', { name: 'Refresh GPU detection' }))
    await waitFor(() => expect(host.invoke).toHaveBeenCalledTimes(2))
  })

  it('reports driver probe failures honestly rather than hiding the GPU', async () => {
    host.invoke.mockRejectedValue('private path in machine-local diagnostic')
    render(<LuHardwareContent />)
    await waitFor(() => expect(screen.getByText(/Lu GPU inventory failed/)).toBeInTheDocument())
    expect(screen.queryByText(/private path/)).not.toBeInTheDocument()
  })

  it('does not invoke host commands in browser-only rendering', async () => {
    host.isTauri.mockReturnValue(false)
    render(<LuHardwareContent />)
    await waitFor(() => expect(screen.getByText(/requires the desktop application/)).toBeInTheDocument())
    expect(host.invoke).not.toHaveBeenCalled()
  })
})
