import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { validateLuDrcPolicy } from './check-lu-drc-policy.mjs'
const source=JSON.parse(fs.readFileSync(new URL('../../docs/lu/lu-drc-policy-v1.json',import.meta.url),'utf8'))
const mutation=(change)=>{const p=structuredClone(source);change(p);return p}
describe('Lu DRC formal policy safety invariants',()=>{
  it('accepts the committed design contract',()=>assert.equal(validateLuDrcPolicy(source),true))
  it('blocks automated core promotion',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.release.human_approval_required_for_core_promotion=false))))
  it('blocks dev access to stable binaries',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.dev.can_mutate_stable_files=true))))
  it('blocks dev promotion authority',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.dev.can_promote_release=true))))
  it('blocks self-certified test reports',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.release.dev_self_certification_allowed=true))))
  it('blocks Git-tag-only rollback claims',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.rollback.git_tag_alone_sufficient=true))))
  it('blocks data-loss-prone schema downgrade',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.rollback.preserve_newer_conversations=false))))
  it('requires merge regression tests',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.release.staging_merge_requires_post_merge_tests=false))))
  it('keeps one model default',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.inference.dev_auto_load_duplicate_model=true))))
  it('keeps GitHub optional',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.git.github_required_for_local_operations=true))))
  it('rejects omitted acceptance gates',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.gates.pop()))))
  it('requires independent Guardian operation',()=>assert.throws(()=>validateLuDrcPolicy(mutation(p=>p.rollback.guardian_works_without_main_or_model=false))))
})
