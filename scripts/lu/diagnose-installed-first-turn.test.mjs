import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {classifyFirstTurnJournal,diagnoseJournal} from './diagnose-installed-first-turn.mjs'
const rows=(...kinds)=>kinds.map(kind=>({task_id:'task-a',kind}))
for(const [events,expected] of [
 [[], 'no_rows_for_thread'],[['USER_REQUEST'],'user_attested_model_not_returned'],
 [['MODEL_OUTPUT','USER_REQUEST'],'model_generated_without_final'],
 [['REJECTED','MODEL_OUTPUT','USER_REQUEST'],'model_boundary_rejected'],
 [['GENERATION_FAILURE','USER_REQUEST'],'generation_failed'],
 [['TOOL_FEEDBACK','USER_REQUEST'],'tool_feedback_without_final'],
 [['FINAL_ANSWER','USER_REQUEST'],'host_final_without_saved_assistant']
])test('classifies only '+expected,()=>assert.equal(classifyFirstTurnJournal(rows(...events)).status,expected))
test('rejects unexpected journal values and oversized result',()=>{
 assert.throws(()=>classifyFirstTurnJournal([{task_id:'task-a',kind:'PRIVATE_VALUE'}]))
 assert.throws(()=>classifyFirstTurnJournal(Array.from({length:65},()=>({task_id:'task-a',kind:'USER_REQUEST'}))))
})
test('reads only its own conversation and does not expose SQLite payloads',()=>{
 const root=mkdtempSync(join(tmpdir(),'lu-firstturn-'))
 try{
   const profile=join(root,'profile'),data=join(profile,'AppData','Roaming','Lu','data')
   mkdirSync(data,{recursive:true})
   const db=new DatabaseSync(join(data,'lu-native-model-audit.sqlite3'))
   db.exec('CREATE TABLE lu_model_boundary_audit(sequence INTEGER PRIMARY KEY,conversation_id TEXT,task_id TEXT,kind TEXT,payload TEXT)')
   const insert=db.prepare('INSERT INTO lu_model_boundary_audit(conversation_id,task_id,kind,payload) VALUES (?,?,?,?)')
   const id='01ARZ3NDEKTSV4RRFFQ69G5FAV'
   insert.run(id,'task-a','USER_REQUEST','PRIVATE PROMPT')
   insert.run(id,'task-a','MODEL_OUTPUT','PRIVATE MODEL TEXT')
   insert.run(id,'task-a','REJECTED','PRIVATE ERROR')
   insert.run('12345678-1234-4123-8123-123456789abc','task-b','FINAL_ANSWER','FOREIGN SECRET')
   db.close()
   const summary=diagnoseJournal(profile,id,root)
   assert.deepEqual(summary,{status:'model_boundary_rejected',events:3,models:1,tools:0})
   assert.equal(JSON.stringify(summary).includes('PRIVATE'),false)
   assert.throws(()=>diagnoseJournal(profile,id,join(root,'other')))
   assert.throws(()=>diagnoseJournal(profile,'../../escape',root))
 }finally{rmSync(root,{recursive:true,force:true})}
})

import {classifyRejectionShape} from './diagnose-installed-first-turn.mjs'
test('does not reveal payload labels when classifying structural rejections',()=>{
  assert.equal(classifyRejectionShape([
    {kind:'REJECTED',code:'unexpected_fields'},
    {kind:'PARSED_CANDIDATE',code:'final'}]), 'model_final_fields_rejected')
  assert.equal(classifyRejectionShape([
    {kind:'REJECTED',code:'malformed_reply'},
    {kind:'PARSED_CANDIDATE',code:'final'}]), 'model_final_text_rejected')
  assert.equal(classifyRejectionShape([
    {kind:'REJECTED',code:'other'},
    {kind:'PARSED_CANDIDATE',code:'other'}]), 'model_boundary_rejected')
})
