import test from 'node:test'
import assert from 'node:assert/strict'
import { auditNativeChatBoundary } from './check-lu-native-chat-boundary.mjs'

const sources = () => ({
  host: '#[tauri::command]\npub async fn lu_inference_native_turn() {}\n#[tauri::command]\npub async fn lu_inference_native_turn_cancel() {}\npub async fn native_turn(thread_id: String, user_turn_id: String) { tools.read_only_turn_context(&thread_id, &user_turn_id)?; run_supervised_native_turn_journaled(&context.trusted_prompt, ()) }',
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
