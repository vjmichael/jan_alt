import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  legacyMetadataRead: vi.fn(),
  legacyServiceHub: vi.fn(),
  isTauri: vi.fn(() => true),
  refresh: vi.fn(async () => undefined),
  toast: { success: vi.fn(), error: vi.fn() },
  state: {
    catalog: {
      available: true,
      backendId: 'llama-cpu',
      contextTokens: 4096,
      models: [],
    },
    sessionId: null as string | null,
    busy: false,
    refresh: vi.fn(async () => undefined),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))
vi.mock('@janhq/tauri-plugin-llamacpp-api', () => ({
  readGgufMetadata: mocks.legacyMetadataRead,
}))
vi.mock('@/hooks/useServiceHub', () => ({
  useServiceHub: mocks.legacyServiceHub,
}))
vi.mock('@/lib/luInference', () => ({
  useLuInference: (selector: (state: typeof mocks.state) => unknown) =>
    selector(mocks.state),
}))
vi.mock('sonner', () => ({ toast: mocks.toast }))

import { ImportLlamacppModelDialog } from '../ImportLlamacppModelDialog'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.isTauri.mockReturnValue(true)
  mocks.state.busy = false
  mocks.state.sessionId = null
  mocks.state.catalog.available = true
  mocks.state.refresh.mockResolvedValue(undefined)
  mocks.legacyServiceHub.mockImplementation(() => {
    throw new Error('Jan service hub must not be used from Lu branded importer')
  })
})

describe('Lu-branded legacy Import Model entry point', () => {
  it('never invokes Jan GGUF/MMProj validator and uses Lu host picker instead', async () => {
    expect(LU_BRAND).toBe(true)
    mocks.invoke.mockResolvedValue({
      cancelled: false, modelRef: 'm-lu', name: 'Qwen3.8-27B-Q4_K_M.gguf',
    })
    render(
      <ImportLlamacppModelDialog
        provider={{ models: [] } as unknown as ModelProvider}
        trigger={<button>Import Model</button>}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Import Model' }))
    expect(screen.getByText('Import GGUF into Lu')).toBeInTheDocument()
    expect(screen.getByText(/MMProj, image\/audio models and/)).toBeInTheDocument()
    expect(screen.queryByText('Select MMPROJ File')).not.toBeInTheDocument()
    fireEvent.click(screen.getByTestId('lu-native-import-dialog-action'))
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith('lu_inference_import_model'))
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
    expect(mocks.legacyMetadataRead).not.toHaveBeenCalled()
    expect(mocks.legacyServiceHub).not.toHaveBeenCalled()
  })
})
