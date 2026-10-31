/**
 * Independent, read-only evidence verifier for native-only Lu GUI/UIA.
 * The Windows UI driver may not call any Lu tool IPC. All required proof
 * comes from the host-owned SQLite and stored assistant JSONL.
 */
import assert from 'node:assert/strict'
import { resolve, join } from 'node:path'
import { readMessages, persistedProof, verifyJournal, inside, safeThreadId } from './verify-installed-lu-gui-tool.mjs'

export function verifyUiaEvidence(profile, threadId, marker, prompt) {
  assert(safeThreadId(threadId), 'invalid persisted thread identity')
  assert(/^LU_GUI_NATIVE_PROOF_[a-f0-9]{32}$/i.test(marker), 'invalid source file proof marker')
  assert(typeof prompt === 'string' && prompt.startsWith('Read notes.txt using the advertised lu_files_read_text tool.'))
  const base = resolve(profile, 'AppData', 'Roaming', 'Lu', 'data')
  const messagesPath = join(base, 'threads', threadId, 'messages.jsonl')
  const journalPath = join(base, 'lu-native-model-audit.sqlite3')
  assert(inside(base, messagesPath) && inside(base, journalPath))
  const msgs = readMessages(messagesPath)
  assert(msgs.some(m => m.role === 'user' && JSON.stringify(m.content).includes(prompt)),
    'the exact UI user request was not persisted')
  const saved = persistedProof(msgs, marker)
  const journal = verifyJournal(journalPath, threadId, marker, prompt)
  assert(journal.nativeToolCalls === 1 && journal.modelOutputs === 2)
  return { assistantId: saved.assistantId, contentHash: saved.contentHash,
    nativeToolCalls: journal.nativeToolCalls, modelOutputs: journal.modelOutputs }
}

if (process.argv[1]?.endsWith('verify-installed-lu-uia-evidence.mjs')) {
  try {
    if (process.argv.length !== 6) throw Error('expected only profile, thread, marker, prompt')
    verifyUiaEvidence(...process.argv.slice(2))
    // Do not print marker, text, private paths, or assistant identifiers.
    console.log('LU_INSTALLED_UIA_NATIVE_PROOF_PASS persisted=true tool_calls=1 generations=2 journal=true')
  } catch {
    console.log('LU_INSTALLED_UIA_NATIVE_PROOF_FAIL evidence=invalid')
    process.exitCode = 1
  }
}
