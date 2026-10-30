/** Strict per-line parser used only for read-only W02 saved-turn assertions.
 * Authorization remains exclusively in Lu's Rust host. */
export function parseLuSavedTurnRows(input: string): Array<{ id?: string; role?: string }> {
  return input.split(/\r?\n/).flatMap((raw, index) => {
    const line = raw.trim()
    if (!line) return []
    let record: unknown
    try { record = JSON.parse(line) } catch {
      throw new Error(`Invalid saved-turn JSONL record on line ${index + 1}`)
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(`Saved-turn JSONL record must be an object on line ${index + 1}`)
    }
    const row = record as Record<string, unknown>
    if ((row.id !== undefined && typeof row.id !== 'string') ||
        (row.role !== undefined && typeof row.role !== 'string')) {
      throw new Error(`Invalid saved-turn message fields on line ${index + 1}`)
    }
    return [{ id: row.id as string | undefined, role: row.role as string | undefined }]
  })
}
