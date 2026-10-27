import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mocks.invoke,
  isTauri: mocks.isTauri,
}))

import { inspectLuMemory, isLuMemoryAvailable, listLuCheckpoints, saveLuCheckpoint, syncLuMemory } from '../luMemorySync'

beforeEach(() => {
  mocks.invoke.mockReset()
  mocks.isTauri.mockReset()
  mocks.isTauri.mockReturnValue(true)
})

describe('Lu explicit memory synchronization client', () => {

  it('reads only bounded memory metadata through a fixed desktop command', async () => {
    mocks.invoke.mockResolvedValue({
      chapters: [{ id: 1, title: 'Imported', summary: '', start_entry_id: 1, end_entry_id: 2, closed: false }],
      entries: [{ id: 1, chapter_id: 1, message_id: 'm1', role: 'user', summary: 'Summary' }],
    })
    const result = await inspectLuMemory('thread', 'topic', 4)
    expect(result.entries[0].summary).toBe('Summary')
    expect(mocks.invoke).toHaveBeenCalledWith('lu_memory_inspect', {
      threadId: 'thread', query: 'topic', afterId: 4, entryId: null,
    })
  })

  it('rejects malformed memory inspection responses', async () => {
    mocks.invoke.mockResolvedValue({ entries: null })
    await expect(inspectLuMemory('thread')).rejects.toThrow('Invalid Lu memory response')
  })

  it('submits a user-approved checkpoint with a fixed citation and no file path', async () => {
    mocks.invoke.mockResolvedValue({ checkpoint_id: 'cp-001' })
    await expect(saveLuCheckpoint('thread', 7, 'Completed', 'Next')).resolves.toBe('cp-001')
    expect(mocks.invoke).toHaveBeenCalledWith('lu_memory_checkpoint', {
      threadId: 'thread', sourceEntryId: 7, completedWork: 'Completed', nextAction: 'Next',
    })
  })

  it('rejects invalid checkpoint citations before IPC', async () => {
    await expect(saveLuCheckpoint('thread', 0, 'Done', 'Next')).rejects.toThrow('Invalid')
    expect(mocks.invoke).not.toHaveBeenCalled()
  })

  it('lists only conversation-scoped checkpoints via the fixed IPC command', async () => {
    mocks.invoke.mockResolvedValue({ checkpoints: [{
      checkpoint_id: 'cp-001', source_entry_ids: [7], completed_work: 'Done', next_action: 'Next',
    }] })
    const items = await listLuCheckpoints('thread')
    expect(items).toHaveLength(1)
    expect(mocks.invoke).toHaveBeenCalledWith('lu_memory_checkpoints', { threadId: 'thread' })
  })

  it('hides the control in ordinary or unsupported Jan hosts', async () => {
    mocks.invoke.mockResolvedValue(false)
    expect(await isLuMemoryAvailable()).toBe(false)
    mocks.invoke.mockResolvedValue(true)
    expect(await isLuMemoryAvailable()).toBe(true)
    mocks.isTauri.mockReturnValue(false)
    expect(await isLuMemoryAvailable()).toBe(false)
    mocks.isTauri.mockReturnValue(true)
    mocks.invoke.mockRejectedValue(new Error('host command missing'))
    expect(await isLuMemoryAvailable()).toBe(false)
  })

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
