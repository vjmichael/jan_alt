import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const host = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(() => true),
  refresh: vi.fn(async () => undefined),
  toast: { success: vi.fn() },
  state: {
    catalog: { available: true, models: [], backendId: 'llama-cpu', contextTokens: 4096 },
    busy: false,
    sessionId: null as string | null,
    refresh: vi.fn(async () => undefined),
  },
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: host.invoke,
  isTauri: host.isTauri,
}))
vi.mock('sonner', () => ({ toast: host.toast }))
vi.mock('@/lib/luInference', () => ({
  useLuInference: (selector: (state: typeof host.state) => unknown) =>
    selector(host.state),
}))

import { LuNativeImportModelDialog } from '../LuNativeImportModelDialog'

function open() {
  fireEvent.click(screen.getByRole('button', { name: 'Open' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  host.state.catalog.available = true
  host.state.sessionId = null
  host.state.busy = false
  host.isTauri.mockReturnValue(true)
  host.state.refresh.mockResolvedValue(undefined)
})

describe('Lu-owned native GGUF import entry point', () => {
  it('explains text-only scope and never offers an unsupported MMProj selector', () => {
    render(<LuNativeImportModelDialog trigger={<button>Open</button>} />)
    open()
    expect(screen.getByText('Import GGUF into Lu')).toBeInTheDocument()
    expect(screen.getByText(/MMProj, image\/audio models and/)).toBeInTheDocument()
    expect(screen.queryByText('Select MMPROJ File')).not.toBeInTheDocument()
  })

  it('invokes only the pathless trusted host picker, then refreshes the catalog', async () => {
    host.invoke.mockResolvedValue({
      cancelled: false, name: 'Qwen.gguf', modelRef: 'm-verified', bytes: 1000000,
    })
    render(<LuNativeImportModelDialog trigger={<button>Open</button>} />)
    open()
    fireEvent.click(screen.getByTestId('lu-native-import-dialog-action'))
    await waitFor(() => expect(host.invoke).toHaveBeenCalledTimes(1))
    expect(host.invoke.mock.calls[0]).toEqual(['lu_inference_import_model'])
    await waitFor(() => expect(screen.getByText(/Imported Qwen.gguf/)).toBeInTheDocument())
    expect(host.state.refresh).toHaveBeenCalled()
    expect(screen.getByText(/Imported Qwen.gguf/)).toBeInTheDocument()
    expect(host.toast.success).toHaveBeenCalledWith('GGUF imported into Lu')
  })

  it('never calls native import while a Lu inference session is loaded', () => {
    host.state.sessionId = 'active-verified-session'
    render(<LuNativeImportModelDialog trigger={<button>Open</button>} />)
    open()
    expect(screen.getByText(/Unload the current model/)).toBeInTheDocument()
    expect(screen.getByTestId('lu-native-import-dialog-action')).toBeDisabled()
    expect(host.invoke).not.toHaveBeenCalled()
  })

  it('fails closed when the native command is not available in an old build', async () => {
    host.invoke.mockRejectedValue('plugin or command not found: PRIVATE_USER_PATH')
    render(<LuNativeImportModelDialog trigger={<button>Open</button>} />)
    open()
    fireEvent.click(screen.getByTestId('lu-native-import-dialog-action'))
    await waitFor(() => expect(screen.getByText(/Lu could not import this GGUF/)).toBeInTheDocument())
    expect(screen.queryByText(/PRIVATE_USER_PATH/)).not.toBeInTheDocument()
  })

  it('never imports from a browser-only session', () => {
    host.isTauri.mockReturnValue(false)
    render(<LuNativeImportModelDialog trigger={<button>Open</button>} />)
    open()
    expect(screen.getByTestId('lu-native-import-dialog-action')).toBeDisabled()
    expect(host.invoke).not.toHaveBeenCalled()
  })
})
