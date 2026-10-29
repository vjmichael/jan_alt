#!/usr/bin/env node
// Lu native chat IPC contract gate: no external packages or desktop runtime.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

export function auditNativeChatBoundary({ host, commands, tools, frontend }) {
  const failures = []
  const requireMatch = (condition, message) => { if (!condition) failures.push(message) }
  const invokeArguments = frontend.match(/'lu_inference_native_turn'\s*,\s*\{([^}]+)\}/s)?.[1] ?? ''
  const cancellationArguments = frontend.match(/'lu_inference_native_turn_cancel'\s*,\s*\{([^}]+)\}/s)?.[1] ?? ''

  // Check both feature-flagged Tauri wrappers, not just the inner function.
  const commandArgs = command => [...host.matchAll(new RegExp(
    '#\\[tauri::command\\]\\s*pub async fn ' + command + '\\s*\\(([\\s\\S]*?)\\)\\s*->', 'g',
  ))].map(match => match[1])
  // Remove Rust generic type parameters first. Commas and namespaced
  // paths inside tauri::State<'_, crate::core::lu::LuDesktopState> are not
  // additional Tauri command arguments.
  const fieldNames = signature => [...signature.replace(/<[^>]*>/g, '')
    .matchAll(/(?:^|,)\s*(\w+)\s*:/g)].map(match => match[1])
  const nativeArgs = commandArgs('lu_inference_native_turn')
  requireMatch(nativeArgs.length === 2, 'Both enabled and disabled native turn command wrappers are required')
  for (const signature of nativeArgs) {
    const fields = fieldNames(signature)
    const required = ['session_id', 'thread_id', 'user_turn_id', 'turn_id']
    const allowed = [...required, 'state', 'tools', 'window']
    requireMatch(required.every(name => fields.filter(field => field === name).length === 1) &&
      fields.every(name => allowed.includes(name)),
      'Native Tauri wrapper must accept identifiers and host-owned State/window only')
  }
  const cancelArgs = commandArgs('lu_inference_native_turn_cancel')
  requireMatch(cancelArgs.length === 2, 'Both enabled and disabled native cancellation wrappers are required')
  for (const signature of cancelArgs) {
    const fields = fieldNames(signature)
    requireMatch(['session_id', 'turn_id'].every(name =>
      fields.filter(field => field === name).length === 1) &&
      fields.every(name => ['session_id', 'turn_id', 'state', 'window'].includes(name)),
      'Native Tauri cancellation wrapper must accept session/turn and host-owned State/window only')
  }

  requireMatch(/#\[tauri::command\]\s*pub async fn lu_inference_native_turn\s*\(/.test(host),
    'Missing Tauri command: lu_inference_native_turn')
  requireMatch(/#\[tauri::command\]\s*pub async fn lu_inference_native_turn_cancel\s*\(/.test(host),
    'Missing Tauri command: lu_inference_native_turn_cancel')
  for (const command of ['lu_inference_native_turn', 'lu_inference_native_turn_cancel']) {
    requireMatch(new RegExp('core::lu_inference::' + command + '\\s*[,)]').test(commands),
      'Missing Tauri generate_handler registration: ' + command)
  }
  requireMatch(/tools\s*\.\s*read_only_turn_context\(\s*&thread_id,\s*&user_turn_id\s*\)/.test(host),
    'Native turns must obtain a host-verified user-message context')
  requireMatch(/run_supervised_native_turn_journaled\(\s*&context\.trusted_prompt\s*,/s.test(host),
    'Model generation must use the host-assembled trusted prompt')
  requireMatch(/saved_chat_prompt::prompt_from_saved_messages\s*\(/.test(tools),
    'Lu native tool state must reconstruct the prompt from saved messages')
  requireMatch(/trusted_prompt\s*,/.test(tools),
    'Lu native tool state must pass the verified prompt to the model adapter')
  const invocationFields = [...invokeArguments.matchAll(/\b[A-Za-z]\w*\b/g)].map(x => x[0])
  requireMatch(invocationFields.length === 4 &&
    ['sessionId', 'threadId', 'userTurnId', 'turnId'].every(key => invocationFields.includes(key)),
    'Native model IPC must send exactly sessionId, threadId, userTurnId and turnId')
  requireMatch(!/\b(userText|prompt|workspaceRoot|argumentsJson|toolName)\b/.test(invokeArguments),
    'Frontend must not supply model text, tool arguments or privileged roots to the native turn')
  const cancelFields = [...cancellationArguments.matchAll(/\b[A-Za-z]\w*\b/g)].map(x => x[0])
  requireMatch(cancelFields.length === 2 && ['sessionId', 'turnId'].every(key =>
    cancelFields.filter(field => field === key).length === 1),
    'Native cancellation IPC must send exactly sessionId and turnId')
  const enabledSignature = host.match(/pub async fn native_turn\s*\(([^)]*)\)/s)?.[1] ?? ''
  requireMatch(/thread_id:\s*String/.test(enabledSignature) && /user_turn_id:\s*String/.test(enabledSignature),
    'Host native_turn must take thread and saved user-turn identifiers')
  requireMatch(!/user_text:\s*String|prompt:\s*String/.test(enabledSignature),
    'Host native_turn must not accept untrusted prompt text')
  const nativeImplementation = host.split('pub async fn native_turn(')[1]
    ?.split('pub async fn cancel_native_turn(')[0] ?? ''
  requireMatch(/require_primary_window\(&window\)\?;/.test(nativeImplementation),
    'Native model tool turns must require the primary trusted desktop window')
  requireMatch(/ToolEffect::ReadWorkspace/.test(nativeImplementation) &&
    !/ToolEffect::WriteWorkspace|ToolEffect::Execute|ToolEffect::Write/.test(nativeImplementation),
    'Native model tool grants must remain read-only')
  return failures
}

export function checkNativeChatBoundary(root) {
  const files = {
    host: 'src-tauri/src/core/lu_inference.rs',
    commands: 'src-tauri/src/lib.rs',
    tools: 'src-tauri/src/core/lu.rs',
    frontend: 'web-app/src/lib/luInference.ts',
  }
  return auditNativeChatBoundary(Object.fromEntries(
    Object.entries(files).map(([key, path]) => [key, readFileSync(join(root, path), 'utf8')]),
  ))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const failures = checkNativeChatBoundary(process.cwd())
  for (const item of failures) console.error('LU_NATIVE_CHAT_BOUNDARY_FAIL:', item)
  if (failures.length) process.exitCode = 1
  else console.log('LU_NATIVE_CHAT_BOUNDARY_PASS host=verified-persisted-user model=trusted-prompt frontend=identifiers-only')
}
