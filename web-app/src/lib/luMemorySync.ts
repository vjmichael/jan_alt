/**
 * Explicit, user-triggered Jan -> ANSF import for the Lu desktop.
 *
 * This is a UI-only maintenance operation, NEVER a model-callable tool.
 * Rust independently validates thread ownership and source paths.
 * No caller-provided file path or revision override is accepted.
 */
import { invoke, isTauri } from '@tauri-apps/api/core'

export type LuMemorySyncResult = {
  source_lines: number
  added: number
  unchanged: number
  revised: number
  blank_lines: number
}

export async function syncLuMemory(
  threadId: string
): Promise<LuMemorySyncResult> {
  if (!threadId || !isTauri()) {
    throw new Error('Lu memory sync requires a desktop conversation')
  }
  const result = await invoke<LuMemorySyncResult>('lu_memory_sync', {
    threadId,
  })
  if (
    !result ||
    !Number.isSafeInteger(result.source_lines) ||
    !Number.isSafeInteger(result.added) ||
    !Number.isSafeInteger(result.unchanged) ||
    !Number.isSafeInteger(result.revised) ||
    !Number.isSafeInteger(result.blank_lines)
  ) {
    throw new Error('Lu memory sync returned invalid statistics')
  }
  return result
}

/** Only show manual sync in an explicitly Lu-enabled desktop runtime. */
export async function isLuMemoryAvailable(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    return (await invoke<boolean>('lu_memory_available')) === true
  } catch {
    return false
  }
}

export type LuMemoryInspection = {
  detail?: null | { selected_entry_id: number; versions: Array<{ id: number; role: string; content: string; summary: string }>; revisions: Array<{ revision_number: number; origin: string; observed_at_utc: string; note: string }> }
  chapters: Array<{ id: number; title: string; summary: string; start_entry_id: number | null; end_entry_id: number | null; closed: boolean }>
  entries: Array<{ id: number; chapter_id: number; message_id: string; role: string; summary: string }>
}

/** Read-only local metadata; never a model-callable tool. */
export async function inspectLuMemory(threadId: string, query = '', afterId = 0, entryId?: number): Promise<LuMemoryInspection> {
  if (!threadId || !isTauri()) throw new Error('Lu memory requires desktop access')
  const result = await invoke<LuMemoryInspection>('lu_memory_inspect', {
    threadId, query: query.slice(0, 256), afterId, entryId: entryId ?? null,
  })
  if (!result || !Array.isArray(result.chapters) || !Array.isArray(result.entries)) {
    throw new Error('Invalid Lu memory response')
  }
  return result
}

/** Only invoked by an explicit human action in the Memory Worker. */
export async function saveLuCheckpoint(
  threadId: string,
  sourceEntryId: number,
  completedWork: string,
  nextAction: string
): Promise<string> {
  if (!isTauri() || !threadId || !Number.isSafeInteger(sourceEntryId) || sourceEntryId < 1) {
    throw new Error('Invalid checkpoint source')
  }
  if (completedWork.length > 4096 || nextAction.length > 4096) {
    throw new Error('Checkpoint text too long')
  }
  const result = await invoke<{ checkpoint_id: string }>('lu_memory_checkpoint', {
    threadId, sourceEntryId, completedWork, nextAction,
  })
  if (typeof result?.checkpoint_id !== 'string' || !result.checkpoint_id) {
    throw new Error('Invalid checkpoint receipt')
  }
  return result.checkpoint_id
}

export type LuCheckpoint = {
  checkpoint_id: string
  source_entry_ids: number[]
  completed_work: string
  next_action: string
}

/** Only returns records for the Jan conversation authenticated by the host. */
export async function listLuCheckpoints(threadId: string): Promise<LuCheckpoint[]> {
  if (!threadId || !isTauri()) throw new Error('Lu checkpoints require desktop access')
  const result = await invoke<{ checkpoints: LuCheckpoint[] }>('lu_memory_checkpoints', { threadId })
  if (!result || !Array.isArray(result.checkpoints)) {
    throw new Error('Invalid checkpoint listing')
  }
  return result.checkpoints
}
