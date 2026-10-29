import test from 'node:test'
import assert from 'node:assert/strict'
import { auditNativeChatBoundary } from './check-lu-native-chat-boundary.mjs'

const sources = () => ({
  host: [
    '#[tauri::command]',
    "pub async fn lu_inference_native_turn(session_id: String, thread_id: String, user_turn_id: String, turn_id: String, state: State, tools: tauri::State<\'_, crate::core::lu::LuDesktopState>, window: WebviewWindow) -> Ok { }",
    '#[tauri::command]',
    'pub async fn lu_inference_native_turn(session_id: String, thread_id: String, user_turn_id: String, turn_id: String) -> Ok { }',
    '#[tauri::command]',
    'pub async fn lu_inference_native_turn_cancel(session_id: String, turn_id: String, state: State, window: WebviewWindow) -> Ok { }',
    '#[tauri::command]',
    'pub async fn lu_inference_native_turn_cancel(session_id: String, turn_id: String) -> Ok { }',
    'pub async fn native_turn(thread_id: String, user_turn_id: String) { require_primary_window(&window)?; tools.read_only_turn_context(&thread_id, &user_turn_id)?; let effect = ToolEffect::ReadWorkspace; run_supervised_native_turn_journaled(&context.trusted_prompt, ()) }',
    'pub async fn cancel_native_turn() {}',
  ].join('\n'),
  commands: 'core::lu_inference::lu_inference_native_turn,\ncore::lu_inference::lu_inference_native_turn_cancel,',
  tools: 'let trusted_prompt = saved_chat_prompt::prompt_from_saved_messages(file, thread_id, user_turn_id)?;\nReadOnlyTurnContext { trusted_prompt, }',
  frontend: "invoke('lu_inference_native_turn', { sessionId, threadId, userTurnId, turnId })\ninvoke('lu_inference_native_turn_cancel', { sessionId, turnId })",
})

test('accepts identifiers-only, persisted-message, host-owned prompt wiring', () => {
  assert.deepEqual(auditNativeChatBoundary(sources()), [])
})
test('rejects a frontend-supplied model prompt', () => {
  const input = sources()
  input.frontend = input.frontend.replace('userTurnId, turnId', 'userTurnId, turnId, userText')
  assert.ok(auditNativeChatBoundary(input).some(x => /exactly|must not supply/.test(x)))
})
test('rejects a Tauri host prompt parameter', () => {
  const input = sources()
  input.host = input.host.replace('user_turn_id: String)', 'user_turn_id: String, user_text: String)')
  assert.ok(auditNativeChatBoundary(input).some(x => /must not accept/.test(x)))
})
test('rejects a lost Tauri command registration', () => {
  const input = sources()
  input.commands = input.commands.replace('core::lu_inference::lu_inference_native_turn_cancel,', '')
  assert.ok(auditNativeChatBoundary(input).some(x => /Missing Tauri generate_handler registration/.test(x)))
})
test('rejects generation that bypasses host-verified persisted context', () => {
  const input = sources()
  input.host = input.host.replace('&context.trusted_prompt', '&user_text')
  assert.ok(auditNativeChatBoundary(input).some(x => /host-assembled trusted prompt/.test(x)))
})

test('rejects prompt text added only to the feature-disabled Tauri wrapper', () => {
  const input = sources()
  input.host = input.host.replace(
    'turn_id: String) -> Ok',
    'turn_id: String, user_text: String) -> Ok',
  )
  assert.ok(auditNativeChatBoundary(input).some(x => /wrapper must accept identifiers/.test(x)))
})
test('rejects a cancellation IPC payload containing additional model arguments', () => {
  const input = sources()
  input.frontend = input.frontend.replace(
    '{ sessionId, turnId }',
    '{ sessionId, turnId, extra }',
  )
  assert.ok(auditNativeChatBoundary(input).some(x => /exactly sessionId and turnId/.test(x)))
})
test('rejects cancellation arguments added only to one Rust wrapper', () => {
  const input = sources()
  input.host = input.host.replace(
    'lu_inference_native_turn_cancel(session_id: String, turn_id: String) ->',
    'lu_inference_native_turn_cancel(session_id: String, turn_id: String, prompt: String) ->',
  )
  assert.ok(auditNativeChatBoundary(input).some(x => /cancellation wrapper/.test(x)))
})
test('rejects native tool calls without a trusted primary window', () => {
  const input = sources()
  input.host = input.host.replace('require_primary_window(&window)?;', '')
  assert.ok(auditNativeChatBoundary(input).some(x => /primary trusted desktop window/.test(x)))
})
test('rejects writable native tool grant in read-only desktop mode', () => {
  const input = sources()
  input.host = input.host.replace('ToolEffect::ReadWorkspace', 'ToolEffect::WriteWorkspace')
  assert.ok(auditNativeChatBoundary(input).some(x => /read-only/.test(x)))
})
