import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

import { syncLuMemory } from '../luMemorySync'

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.isTauri.mockReset()
  mocks.isTauri.mockReturnValue(true)
})

describe('Lu explicit memory synchronization client', () => {
  it('invokes the fixed host command with only a thread id', async () => {
    mocks.invoke.mockResolvedValue({
      source_lines: 4, added: 2, unchanged: 2, revised: 0, blank_lines: 0,
    })
    const result = await syncLuMemory('trusted-thread')
    expect(result.added).toBe(2)
    expect(mocks.invoke).toHaveBeenCalledWith('lu_memory_sync', {
      threadId: 'trusted-thread',
    })
  })

  it('refuses browser and missing conversation contexts', async () => {
    mocks.isTauri.mockReturnValue(false)
    await expect(syncLuMemory('thread')).rejects.toThrow('desktop')
    mocks.isTauri.mockReturnValue(true)
    await expect(syncLuMemory('')).rejects.toThrow('desktop')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('surfaces Rust refusal without retrying or changing source', async () => {
    mocks.invoke.mockRejectedValue(new Error('ChangedSource'))
    await expect(syncLuMemory('thread')).rejects.toThrow('ChangedSource')
    expect(mocks.invoke).toHaveBeenCalledTimes(1)
  })

  it('rejects malformed host statistics', async () => {
    mocks.invoke.mockResolvedValue({ source_lines: 2, added: 'two' })
    await expect(syncLuMemory('thread')).rejects.toThrow('invalid statistics')
  })
})
