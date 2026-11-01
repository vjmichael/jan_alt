import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'

const model = vi.hoisted(() => {
  const state = {
    catalog: {
      available: true,
      models: [{ id: 'm-qwen', name: 'Qwen3.8-27B-Q4_K_M.gguf' }],
      backendId: 'llama-vulkan',
      contextTokens: 4096,
    },
    enabledThreads: {} as Record<string, boolean>,
    busy: false,
    error: null,
    loadedModel: null as string | null,
    sessionId: null as string | null,
    lastTurnToolCalls: null,
    lastHostRoutedCalls: null,
    refresh: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    unload: vi.fn(async () => undefined),
    setThreadEnabled: vi.fn(),
  }
  return {
    state,
    isTauri: vi.fn(() => true),
    invoke: vi.fn(),
    checkHealth: vi.fn(),
    exportDiagnostics: vi.fn(),
  }
})
vi.mock('@tauri-apps/api/core', () => ({
  isTauri: model.isTauri,
  invoke: model.invoke,
}))
vi.mock('@/lib/luInference', () => ({
  useLuInference: (select: (state: typeof model.state) => unknown) =>
    select(model.state),
}))
vi.mock('@/hooks/useThreads', () => ({
  useThreads: (select: (state: { threads: Record<string, unknown> }) => unknown) =>
    select({ threads: {} }),
}))
vi.mock('@/lib/luDiagnostics', () => ({
  checkLuNativeHealth: model.checkHealth,
  exportLuNativeDiagnostics: model.exportDiagnostics,
}))

import { LuNativeModelPicker } from '../LuNativeModelPicker'

beforeEach(() => {
  vi.clearAllMocks()
  model.isTauri.mockReturnValue(true)
  model.state.busy = false
  model.state.loadedModel = null
  model.state.sessionId = null
  model.state.load.mockResolvedValue(undefined)
})

describe('Lu native model Load & Chat activation', () => {
  it('activates this thread only after the host successfully loads a GGUF', async () => {
    expect(LU_BRAND).toBe(true)
    render(<LuNativeModelPicker threadId="thread-1" />)
    fireEvent.click(screen.getByTestId('lu-native-load'))
    expect(model.state.load).toHaveBeenCalledWith('m-qwen')
    await waitFor(() =>
      expect(model.state.setThreadEnabled).toHaveBeenCalledWith('thread-1', true)
    )
    expect(screen.getByText(/Lu model loaded/)).toBeInTheDocument()
  })

  it('does not activate a conversation if the verified host load fails', async () => {
    model.state.load.mockRejectedValueOnce('model failed backend GPU initialization')
    render(<LuNativeModelPicker threadId="thread-2" />)
    fireEvent.click(screen.getByTestId('lu-native-load'))
    await waitFor(() =>
      expect(model.state.setThreadEnabled).toHaveBeenCalledWith('thread-2', false)
    )
    expect(model.state.setThreadEnabled).not.toHaveBeenCalledWith('thread-2', true)
    expect(screen.getByText(/Model load failed/)).toBeInTheDocument()
  })
})
