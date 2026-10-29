#!/usr/bin/env node
// Read-only, branch-local dependency scan. No copying, deletion or inference
// of copyright ownership from a filename; release provenance is reviewed
// separately in docs/lu/jan-origin-inventory.json.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export const AUDITED_FILES = Object.freeze({
  ordinaryChat: 'web-app/src/lib/custom-chat-transport.ts',
  coworkRunner: 'web-app/src/lib/coworkRunner.ts',
  coworkDispatch: 'web-app/src/lib/coworkDispatch.ts',
  coworkTransport: 'web-app/src/lib/coworkTransport.ts',
  chatTools: 'web-app/src/lib/agentTools.ts',
  agentServer: 'src-tauri/src/core/agent/loop.rs',
  legacyCommands: 'src-tauri/plugins/tauri-plugin-agent-tools/src/commands.rs',
  legacyHandlers: 'src-tauri/plugins/tauri-plugin-agent-tools/src/tools/handlers.rs',
  legacyBridge: 'src-tauri/plugins/tauri-plugin-agent-tools/src/lu_bridge.rs',
  luHost: 'src-tauri/src/core/lu.rs',
  luInference: 'src-tauri/src/core/lu_inference.rs',
  inventory: 'docs/lu/jan-origin-inventory.json',
  notice: 'NOTICE',
  license: 'LICENSE',
})

export function dependencyAudit(input) {
  const errors = []
  for (const [key, path] of Object.entries(AUDITED_FILES)) {
    if (typeof input[key] !== 'string') errors.push(`Missing source: ${path}`)
  }
  if (errors.length) return { errors, files: [], janWorkspaceCalls: [] }
  const locate = (text, term) => text.split('\n').flatMap((line, index) =>
    line.includes(term) ? [{ line: index + 1, excerpt: line.trim().slice(0, 160) }] : [])
  const workspaceNames = [
    'thread_workspace', 'threads_dir', 'session_workspace', 'sessions_dir', 'permanent_store',
  ]
  const workspace = workspaceNames.map(name => ({
    helper: name,
    locations: locate(input.luHost, 'tauri_plugin_agent_tools::workspace::' + name),
  }))
  for (const row of workspace) {
    if (!row.locations.length) errors.push(`Expected Jan workspace dependency not found: ${row.helper}; revise audit before removing it`)
  }
  const required = [
    [input.ordinaryChat, 'sendLuNativeConversation', 'Lu native chat bypass'],
    [input.coworkRunner, 'abortRun', 'Jan Cowork abort loop'],
    [input.coworkDispatch, 'executeLuNativeTool', 'Cowork Lu native bridge'],
    [input.coworkTransport, 'CustomChatTransport', 'Cowork transport inheritance'],
    [input.chatTools, 'CHAT_AGENT_TOOL_NAMES', 'Jan main-chat shell catalog'],
    [input.agentServer, 'execute_builtin_with_diff', 'server-side legacy dispatch'],
    [input.legacyHandlers, 'execute_builtin_with_diff', 'legacy Rust tool handler'],
    [input.legacyCommands, 'execute_tool_streaming', 'legacy Tauri IPC'],
    [input.legacyBridge, 'register_legacy_builtins', 'optional native legacy adapter'],
    [input.luInference, 'run_supervised_native_turn_with_effects', 'Lu cancellable durable desktop turn'],
  ]
  for (const [source, fragment, label] of required) {
    if (!source.includes(fragment)) errors.push(`Missing architecture seam: ${label}`)
  }
  let inventory = null
  try {
    inventory = JSON.parse(input.inventory)
  } catch {
    errors.push('Jan origin inventory is not valid JSON')
  }
  if (inventory && (inventory.license !== 'Apache-2.0' ||
      !Array.isArray(inventory.verifiedFiles) ||
      !inventory.verifiedFiles.some(x => x.path === AUDITED_FILES.legacyHandlers))) {
    errors.push('Jan origin inventory does not preserve legacy handler provenance')
  }
  if (!input.license.includes('Menlo Research') ||
      !input.notice.includes('Apache 2.0') ||
      !input.notice.includes('Jan')) {
    errors.push('Jan Menlo Research / Apache attribution not preserved in NOTICE or LICENSE')
  }
  const files = Object.entries(AUDITED_FILES).map(([key, path]) => ({
    key, path, lines: input[key].split('\n').length,
  }))
  return { schema: 1, errors, files, janWorkspaceCalls: workspace }
}

export function scanRepository(root) {
  const input = Object.fromEntries(Object.entries(AUDITED_FILES).map(([key, path]) =>
    [key, readFileSync(join(root, path), 'utf8')]))
  return dependencyAudit(input)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = scanRepository(process.cwd())
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  if (result.errors.length) process.exitCode = 1
}
