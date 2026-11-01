/** Read-only bounded first-turn journal status. Never emit payloads, user data, IDs, paths or raw errors. */
import assert from 'node:assert/strict'
import {existsSync,lstatSync} from 'node:fs'
import {resolve,relative,isAbsolute,sep,join} from 'node:path'
import {DatabaseSync} from 'node:sqlite'
import {fileURLToPath} from 'node:url'
const kinds=new Set(['USER_REQUEST','MODEL_OUTPUT','PARSED_CANDIDATE','REJECTED','TOOL_FEEDBACK','FINAL_ANSWER','GENERATION_FAILURE'])
const safeId=id=>typeof id==='string'&&(/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(id)||/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/.test(id))
function inside(root,path){const rel=relative(resolve(root),resolve(path));return rel!==''&&rel!=='..'&&!rel.startsWith('..'+sep)&&!isAbsolute(rel)}
export function classifyFirstTurnJournal(rows,tableExists=true){
  if(!tableExists)return {status:'no_audit_table',events:0,models:0,tools:0}
  assert(Array.isArray(rows)&&rows.length<=64)
  if(!rows.length)return {status:'no_rows_for_thread',events:0,models:0,tools:0}
  for(const r of rows)assert(r&&typeof r.task_id==='string'&&r.task_id.length>0&&r.task_id.length<=128&&kinds.has(r.kind))
  const events=rows.filter(r=>r.task_id===rows[0].task_id).map(r=>r.kind)
  const count=k=>events.filter(x=>x===k).length
  const models=count('MODEL_OUTPUT'),tools=count('TOOL_FEEDBACK')
  let status='unknown_event_state'
  if(count('FINAL_ANSWER'))status='host_final_without_saved_assistant'
  else if(count('GENERATION_FAILURE'))status='generation_failed'
  else if(count('REJECTED'))status='model_boundary_rejected'
  else if(tools)status='tool_feedback_without_final'
  else if(models)status='model_generated_without_final'
  else if(count('USER_REQUEST'))status='user_attested_model_not_returned'
  return {status,events:events.length,models,tools}
}
// Only fixed enum categories leave SQLite. Raw MODEL_OUTPUT or tool payloads
// are never selected by this supplementary structural diagnostic query.
export function classifyRejectionShape(fixedRows) {
  const is=(kind,code)=>fixedRows.some(r=>r.kind===kind&&r.code===code)
  if(is('REJECTED','unexpected_fields')&&is('PARSED_CANDIDATE','final'))
    return 'model_final_fields_rejected'
  if(is('REJECTED','malformed_reply')&&is('PARSED_CANDIDATE','final'))
    return 'model_final_text_rejected'
  if(is('REJECTED','unexpected_fields'))return 'model_unexpected_fields'
  if(is('REJECTED','malformed_reply'))return 'model_malformed_reply'
  if(is('REJECTED','unknown_tool'))return 'model_unknown_tool_rejected'
  if(is('REJECTED','invalid_arguments'))return 'model_invalid_tool_arguments'
  if(is('REJECTED','scope_rejected'))return 'model_authority_rejected'
  if(is('REJECTED','revoked'))return 'model_authority_revoked'
  if(is('REJECTED','readonly_violation'))return 'model_readonly_violation'
  return 'model_boundary_rejected'
}
export function diagnoseJournal(profile,threadId,runnerTemp){
  assert(safeId(threadId)&&typeof runnerTemp==='string'&&runnerTemp.length>0)
  const data=resolve(profile,'AppData','Roaming','Lu','data')
  assert(inside(runnerTemp,data))
  const path=join(data,'lu-native-model-audit.sqlite3')
  if(!existsSync(path))return {status:'no_audit_file',events:0,models:0,tools:0}
  const st=lstatSync(path)
  assert(st.isFile()&&!st.isSymbolicLink())
  const db=new DatabaseSync(path,{readonly:true})
  try{
    const found=db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name='lu_model_boundary_audit'").get()
    if(!found)return classifyFirstTurnJournal([],false)
    const rows=db.prepare('SELECT kind,task_id FROM lu_model_boundary_audit WHERE conversation_id=? ORDER BY sequence DESC LIMIT 64').all(threadId)
    const summary=classifyFirstTurnJournal(rows)
    if(summary.status==='model_boundary_rejected') {
      const safe=db.prepare(`SELECT kind, CASE
        WHEN kind='REJECTED' AND payload='UnexpectedFields' THEN 'unexpected_fields'
        WHEN kind='REJECTED' AND payload='MalformedModelReply' THEN 'malformed_reply'
        WHEN kind='REJECTED' AND payload LIKE 'Catalog(UnknownTool(%' THEN 'unknown_tool'
        WHEN kind='REJECTED' AND payload LIKE 'Catalog(InvalidArguments(%' THEN 'invalid_arguments'
        WHEN kind='REJECTED' AND payload LIKE 'Unauthorized(%' THEN 'scope_rejected'
        WHEN kind='REJECTED' AND payload='Revoked' THEN 'revoked'
        WHEN kind='REJECTED' AND payload='ReadOnlyTurnViolation' THEN 'readonly_violation'
        WHEN kind='PARSED_CANDIDATE' AND payload='final' THEN 'final'
        ELSE 'other' END AS code
        FROM lu_model_boundary_audit WHERE conversation_id=? AND task_id=?
          AND kind IN ('PARSED_CANDIDATE','REJECTED')
        ORDER BY sequence DESC LIMIT 4`).all(threadId,rows[0].task_id)
      summary.status=classifyRejectionShape(safe)
    }
    return summary
  }finally{db.close()}
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  let r={status:'unavailable',events:0,models:0,tools:0}
  try{
    if(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Windows'||!process.env.RUNNER_TEMP||process.argv.length!==4)throw Error('environment')
    r=diagnoseJournal(process.argv[2],process.argv[3],process.env.RUNNER_TEMP)
  }catch{r={status:'unavailable',events:0,models:0,tools:0}}
  console.log('LU_INSTALLED_FIRST_TURN_JOURNAL status='+r.status+' events='+r.events+' models='+r.models+' tools='+r.tools)
}
