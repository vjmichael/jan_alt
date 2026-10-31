import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { verifyUiaEvidence } from './verify-installed-lu-uia-evidence.mjs'

const id = 'b28e03c1-13e8-4e38-b6fa-96610f353e9d'
const marker = 'LU_GUI_NATIVE_PROOF_3f04a968a3a84e6f93be9300bb427530'
const prompt = 'Read notes.txt using the advertised lu_files_read_text tool. First respond with ONLY a JSON tool request, not Python, Markdown or prose. Do not invent or guess the file content. Once the tool result is provided, respond with ONLY a JSON final response containing the exact file marker.'
const events = [
  ['USER_REQUEST', prompt],
  ['MODEL_OUTPUT', JSON.stringify({kind:'tool', name:'lu_files_read_text', arguments:{path:'notes.txt'}})],
  ['PARSED_CANDIDATE','lu_files_read_text'],
  ['TOOL_FEEDBACK', JSON.stringify({name:'lu_files_read_text',response:{ok:true,result:{content:marker+'\n'}}})],
  ['MODEL_OUTPUT',JSON.stringify({kind:'final',text:marker})],
  ['FINAL_ANSWER',marker],
]

test('installed UIA evidence derives actual tool, final and assistant from disk', () => {
  const root=mkdtempSync(join(tmpdir(),'lu-uia-evidence-'))
  const data=join(root,'AppData','Roaming','Lu','data')
  const thread=join(data,'threads',id)
  mkdirSync(thread,{recursive:true})
  const msgs=[
    {id:'u1',role:'user',content:[{type:'text',text:{value:prompt}}]},
    {id:'a1',role:'assistant',content:[{type:'text',text:{value:marker}}]},
  ]
  writeFileSync(join(thread,'messages.jsonl'),msgs.map(r=>JSON.stringify(r)).join('\n')+'\n')
  const db=new DatabaseSync(join(data,'lu-native-model-audit.sqlite3'))
  try {
    db.exec('CREATE TABLE lu_model_boundary_audit (sequence INTEGER PRIMARY KEY AUTOINCREMENT,conversation_id TEXT,task_id TEXT,kind TEXT,payload TEXT)')
    const insert=db.prepare('INSERT INTO lu_model_boundary_audit(conversation_id,task_id,kind,payload) VALUES(?,?,?,?)')
    for(const [kind,payload] of events)insert.run(id,'task-1',kind,payload)
    db.close()
    const verified=verifyUiaEvidence(root,id,marker,prompt)
    assert.equal(verified.nativeToolCalls,1)
    assert.equal(verified.modelOutputs,2)
    assert.equal(verified.assistantId,'a1')
    assert.throws(()=>verifyUiaEvidence(root,'00000000-0000-0000-0000-000000000000',marker,prompt))
    assert.throws(()=>verifyUiaEvidence(root,id,marker,'changed prompt'))
    assert.throws(()=>verifyUiaEvidence(root,id,'injected marker',prompt))
  } finally { try {db.close()}catch{} rmSync(root,{recursive:true,force:true}) }
})
