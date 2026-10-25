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
