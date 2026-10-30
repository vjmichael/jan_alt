/** Human-readable, deliberately redacted first-run Lu error messages.
 * Model/host errors can contain absolute paths or local configuration:
 * never render their raw text in the user interface. */
export function explainLuNativeFailure(value: unknown): string {
  const raw = String(value ?? '')
  if (raw.includes('Invalid Lu native turn result')) {
    return 'Invalid Lu native turn result.'
  }
  if (/manifest|checksum|hash mismatch|signature|untrusted|not admitted/i.test(raw)) {
    return 'Lu cannot verify the packaged model or engine. Refresh the catalog; if the problem persists, repair or reinstall this Lu build.'
  }
  if (/gguf|model not found|missing model|model unavailable|no model|model file/i.test(raw)) {
    return 'The selected GGUF is missing or unavailable. Check the model location, then refresh the catalog and load it again.'
  }
  if (/vulkan|cuda|rocm|gpu|device unsupported|backend unavailable/i.test(raw)) {
    return 'The selected compute backend is unavailable. Check GPU drivers or select a supported CPU backend before retrying.'
  }
  if (/out of memory|memory allocation|not enough memory|oom|alloc failed/i.test(raw)) {
    return 'Lu could not allocate enough memory to load this model. Unload other models or select a smaller GGUF.'
  }
  if (/permission|denied|unauthori[sz]ed|scope rejected/i.test(raw)) {
    return 'Lu denied this native operation. Check the conversation permission and retry only after granting the required scope.'
  }
  if (/cancel|abort|interrupt/i.test(raw)) {
    return 'The model operation was cancelled. You can retry when the engine is idle.'
  }
  if (/process|spawn|engine|startup|launch|connection refused|timed out|timeout/i.test(raw)) {
    return 'Lu could not start or contact its native inference engine. Check the packaged runtime and retry.'
  }
  return 'Lu native inference failed. Refresh the model catalog and retry; see local diagnostics for details.'
}
