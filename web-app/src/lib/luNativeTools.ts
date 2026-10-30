/**
 * Lu's first desktop-native tools. No MCP server, shell or webview tool host.
 *
 * The Tauri Rust command registers each model call against a scoped
 * ephemeral thread or Cowork-session workspace and performs strict JSON -> Protobuf conversion plus
 * authorization. Never accept a filesystem root from the model/webview.
 */
import { invoke, isTauri } from '@tauri-apps/api/core'

export const LU_NATIVE_TOOL_NAMES = new Set([
  'lu_files_read_text',
  'lu_files_list_directory',
  'lu_files_stat',
  'lu_files_search_text',
])

export type LuNativeSchema = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type LuNativeScope = 'thread' | 'session'

export async function getLuNativeToolSchemas(
  threadId: string,
  scope: LuNativeScope = 'thread'
): Promise<LuNativeSchema[]> {
  if (!threadId || !isTauri()) return []
  try {
    const raw = await invoke<LuNativeSchema[]>('lu_native_tool_catalog', {
      threadId,
      ...(scope === 'session' ? { scope } : {}),
    })
    if (!Array.isArray(raw)) return []
    // Rust's catalog provides exactly these built-ins. Do not accept a
    // dynamic backend-provided extra tool name in this first integration.
    return raw.filter(
      (schema) =>
        schema?.type === 'function' &&
        LU_NATIVE_TOOL_NAMES.has(schema.function?.name) &&
        typeof schema.function?.description === 'string' &&
        schema.function?.parameters?.type === 'object'
    )
  } catch {
    // Host errors may contain local paths or tool details. Keep logs fixed.
    console.warn('[lu] Native tool catalog unavailable')
    return []
  }
}

export async function executeLuNativeTool(
  toolName: string,
  input: unknown,
  threadId: string,
  callId: string,
  scope: LuNativeScope = 'thread'
): Promise<{ content?: string; error?: string }> {
  if (!LU_NATIVE_TOOL_NAMES.has(toolName) || !threadId || !callId) {
    return { error: 'Lu rejected an unknown native tool call' }
  }
  if (!isTauri()) return { error: 'Lu native tools require the desktop app' }
  // Reject malformed or oversized requests before crossing IPC. The Rust
  // dispatcher remains the authoritative schema/authorization boundary.
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Lu native tool arguments must be a JSON object' }
  }
  let argumentsJson: string
  try {
    argumentsJson = JSON.stringify(input)
  } catch {
    return { error: 'Lu native tool arguments could not be encoded as JSON' }
  }
  if (!argumentsJson || argumentsJson.length > 64 * 1024) {
    return { error: 'Lu native tool arguments exceed the IPC size limit' }
  }
  try {
    const result = await invoke<{
      ok: boolean
      tool: string
      result?: unknown
      error?: { code: string; message: string; retryable: boolean }
    }>('lu_native_tool_execute', {
      threadId,
      toolName,
      callId,
      argumentsJson,
      ...(scope === 'session' ? { scope } : {}),
    })
    if (result?.tool !== toolName) {
      return { error: 'Lu tool response identity mismatch' }
    }
    // Use structured tool results even for nonfatal errors so local models
    // can reason about failure without guessing from arbitrary text.
    return { content: JSON.stringify(result) }
  } catch {
    // Do not return raw host exceptions to a model or WebView transcript.
    return { error: 'Lu native tool call failed. Check local diagnostics.' }
  }
}
