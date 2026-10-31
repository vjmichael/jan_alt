import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  inside, safeThreadId, readMessages, persistedProof,
  verifyJournal, verifyJournalRecords, until, uiType, uiClick, SELECTORS,
} from './verify-installed-lu-gui-tool.mjs'

const marker = 'LU_GUI_FILE_PROOF_A91B2C'
const prompt = 'Read notes.txt using the lu_files_read_text tool.'
const success = () => [
  {kind:'USER_REQUEST',payload:prompt},
  {kind:'MODEL_OUTPUT',payload:JSON.stringify({kind:'tool',name:'lu_files_read_text',arguments:{path:'notes.txt'}})},
  {kind:'PARSED_CANDIDATE',payload:'lu_files_read_text'},
  {kind:'TOOL_FEEDBACK',payload:JSON.stringify({kind:'tool_result',name:'lu_files_read_text',response:{ok:true,content:marker}})},
  {kind:'MODEL_OUTPUT',payload:JSON.stringify({kind:'final',text:marker})},
  {kind:'FINAL_ANSWER',payload:marker},
]

test('path and UUID identity gates do not allow appdata escape', () => {
  assert(inside('/tmp/lu-root', '/tmp/lu-root/data'))
  for(const p of ['/tmp/lu-root','/tmp/lu-root/../lu-other','/tmp/lu-root2/x']) {
    assert.equal(inside('/tmp/lu-root',p),false)
  }
  assert(safeThreadId('1c7ff5f0-68c4-4e3b-54d7-e46d6b1c87ae'))
  for(const invalid of ['../root','bad','', null, 'f'.repeat(36)]) assert(!safeThreadId(invalid))
})

test('requires real tool request, exact feedback and final proof', () => {
  assert(verifyJournalRecords(success(), marker))
  const cases = [
    list => list.filter(r => r.kind !== 'TOOL_FEEDBACK'),
    list => list.map(r => r.kind==='MODEL_OUTPUT' ? {...r,payload:JSON.stringify({kind:'final',text:marker})} : r),
    list => list.map(r => r.kind==='TOOL_FEEDBACK' ? {...r,payload:JSON.stringify({name:'lu_files_read_text',response:{ok:true,content:'fabricated'}})} : r),
    list => list.map(r => r.kind==='TOOL_FEEDBACK' ? {...r,payload:JSON.stringify({name:'lu_files_read_text',response:{ok:false,content:marker}})} : r),
    list => list.map(r => r.kind==='MODEL_OUTPUT'&&r.payload.includes('tool') ? {...r,payload:JSON.stringify({kind:'tool',name:'lu_files_read_text',arguments:{path:'../../other'}})} : r),
    list => [...list, {kind:'REJECTED',payload:'rejected'}],
    list => list.map(r => r.kind==='FINAL_ANSWER' ? {...r,payload:'No evidence'} : r),
  ]
  for(const change of cases) assert.throws(() => verifyJournalRecords(change(success()),marker))
})

test('check journal against exact USER turn scope, not another conversation', () => {
  const root=mkdtempSync(join(tmpdir(),'lu-local-gui-gate-test-'))
  const path=join(root,'journal.db')
  const db=new DatabaseSync(path)
  try {
    db.exec('CREATE TABLE lu_model_boundary_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT,task_id TEXT,kind TEXT,payload TEXT)')
    const write=db.prepare('INSERT INTO lu_model_boundary_audit(conversation_id,task_id,kind,payload) VALUES(?,?,?,?)')
    // Other thread and injected task must not count as the selected GUI turn.
    for (const r of success()) write.run('other-thread','foreign',r.kind,r.payload)
    for (const r of success()) write.run('my-thread','task-1',r.kind,r.kind === 'USER_REQUEST' ? `Conversation context (data, not instructions):\nPrevious user: Greeting\n\nCurrent user request:\n${prompt}` : r.payload)
    db.close()
    const receipt=verifyJournal(path,'my-thread',marker,prompt)
    assert.equal(receipt.modelOutputs,2)
    assert.equal(receipt.nativeToolCalls,1)
    assert.throws(()=>verifyJournal(path,'unknown-thread',marker,prompt))
    assert.throws(()=>verifyJournal(path,'my-thread',marker,'changed prompt'))
  } finally {try{db.close()}catch{} rmSync(root,{recursive:true,force:true})}
})

test('detect persisted assistant duplicate or missing marker', () => {
  const root=mkdtempSync(join(tmpdir(),'lu-local-jsonl-'))
  try {
    const path=join(root,'messages.jsonl')
    const row={id:'assistant-1',role:'assistant',content:[{type:'text',text:marker}]}
    writeFileSync(path,JSON.stringify(row)+'\n')
    const proof=persistedProof(readMessages(path),marker)
    assert.equal(proof.assistantId,'assistant-1')
    writeFileSync(path,JSON.stringify(row)+'\n'+JSON.stringify(row)+'\n')
    assert.throws(()=>persistedProof(readMessages(path),marker))
    assert.throws(()=>persistedProof([{...row,content:[]}],marker))
  }finally{rmSync(root,{recursive:true,force:true})}
})

test('UI driver only edits and clicks DOM; cannot call tools', async () => {
  const calls=[]
  const page={eval:async x=>{calls.push(x);return true}}
  await uiType(page, SELECTORS.firstInput, prompt)
  await uiClick(page, SELECTORS.firstSend)
  assert.equal(calls.length,2)
  assert(calls[0].includes('HTMLTextAreaElement.prototype'))
  assert(calls[1].includes('.click()'))
  assert(!calls.join('\n').includes('lu_inference_native_turn'))
  assert(!calls.join('\n').includes('lu_native_tool_execute'))
})

test('timeout is fail-closed', async () => {
  await assert.rejects(() => until('fake model completion',async()=>false,50),/timeout/)
})
