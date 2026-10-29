#!/usr/bin/env node
// Lu engineering provenance gate. Never rewrites sources or licensing metadata.
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const read = p => readFileSync(resolve(root, p), 'utf8')
const failures = []
const expect = (pass, message) => { if (!pass) failures.push(message) }
const inventory = JSON.parse(read('docs/lu/jan-origin-inventory.json'))
const original = read('LICENSE')
const bundled = read('src-tauri/resources/LICENSE')
const apache = read('LICENSES/Apache-2.0.txt')
const notice = read('NOTICE')

expect(original.includes('Copyright 2025 Menlo Research') && original.includes('Apache License, Version 2.0'),
  'Jan root LICENSE notice or copyright attribution missing')
expect(bundled === original, 'Bundled Jan LICENSE must match unchanged repository copy')
expect(apache.includes('Apache License\nVersion 2.0') &&
  apache.includes('END OF TERMS AND CONDITIONS') && apache.includes('9. Accepting Warranty or Additional Liability.'),
  'Complete Apache 2.0 license text missing or incomplete')
expect(notice.includes('Menlo Research') && notice.includes('jan-origin-inventory.json'),
  'Supplemental Jan-origin NOTICE missing')
expect(inventory.schemaVersion === 1 && inventory.license === 'Apache-2.0',
  'Jan provenance inventory schema/license mismatch')

const documented = new Set()
for (const record of inventory.verifiedFiles ?? []) {
  const path = record.path
  expect(typeof path === 'string' && !path.includes('..') && !path.startsWith('/'),
    'Invalid inventory source path')
  if (typeof path !== 'string' || path.includes('..') || path.startsWith('/')) continue
  expect(!documented.has(path), 'Duplicate Jan-origin file: ' + path)
  documented.add(path)
  expect(existsSync(resolve(root, path)), 'Missing inventoried Jan-origin file: ' + path)
  if (!existsSync(resolve(root, path))) continue
  const source = read(path)
  const header = source.slice(0, 650)
  expect(header.includes('JAN-UPSTREAM-PROVENANCE') && header.includes('Copyright 2025 Menlo Research') &&
    header.includes('Apache-2.0') && header.includes('docs/lu/jan-origin-provenance.md'),
    'Jan source missing provenance marker: ' + path)
  expect(record.upstreamPath?.includes('github.com/janhq/jan/blob/'),
    'Jan source record missing upstream provenance link: ' + path)
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 15 * 1024 * 1024 })
}
const roots = inventory.reviewCandidateRoots ?? []
if (roots.some(x => typeof x !== 'string' || !x.endsWith('/'))) {
  failures.push('Invalid candidate-root entry')
}
let pendingCount = 'unknown'
try {
  const tracked = git(['ls-files', '--', ...roots]).split(/\r?\n/).filter(Boolean)
  pendingCount = tracked.filter(p => !documented.has(p)).length
} catch (e) {
  failures.push('Git tracked-file provenance scan failed: ' + String(e))
}

const base = process.env.LU_LICENSE_BASE?.trim()
if (base) {
  expect(/^[a-f0-9]{40}$/.test(base), 'Invalid LU_LICENSE_BASE commit SHA')
  if (/^[a-f0-9]{40}$/.test(base)) {
    try {
      const changed = git(['diff', '--name-only', base + '...HEAD', '--', ...roots])
        .split(/\r?\n/).filter(Boolean)
      for (const path of changed) {
        if (!documented.has(path)) {
          failures.push('Changed candidate Jan-origin file requires explicit review/classification: ' + path)
        }
      }
    } catch (e) {
      failures.push('Unable to calculate changed source provenance: ' + String(e))
    }
  }
}

console.log(JSON.stringify({
  status: failures.length ? 'FAIL' : 'PASS',
  verifiedJanSourceFiles: documented.size,
  remainingCandidateTrackedFilesRequiringReview: pendingCount,
  changedBaseEnforced: Boolean(base),
  notice: 'Candidate count does not establish Jan ownership. Individual provenance audit outstanding.',
}, null, 2))
if (failures.length) {
  for (const failure of failures) console.error('JAN_LICENSE_PROVENANCE_FAIL: ' + failure)
  process.exitCode = 1
}
